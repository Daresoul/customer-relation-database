use std::path::Path;
use std::fs;
use pdfium_render::prelude::*;
use tauri::AppHandle;
use std::io::Cursor;
use image::{ImageFormat, GenericImageView};

pub struct PdfRenderService;

impl PdfRenderService {
    /// Return the number of pages in the given PDF file.
    pub fn get_page_count(app_handle: &AppHandle, pdf_path: &str) -> Result<u16, String> {
        let pdfium = Self::load_pdfium(app_handle)?;
        let document = pdfium
            .load_pdf_from_file(pdf_path, None)
            .map_err(|e| format!("Failed to open PDF: {}", e))?;
        Ok(document.pages().len())
    }

    /// Render a page of a PDF to a PNG file at the given width.
    /// Returns the output path on success.
    #[allow(dead_code)]
    pub fn render_page_to_png(
        app_handle: &AppHandle,
        pdf_path: &str,
        page_index: u32,
        target_width: u32,
        out_path: &str,
    ) -> Result<String, String> {
        // Ensure parent directory exists
        if let Some(parent) = Path::new(out_path).parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create preview dir: {}", e))?;
            }
        }

        // Try to bind to a system-installed PDFium library.
        // If you prefer embedding, switch to Pdfium::bind_to_statically_linked_library()
        // and add the correct Cargo feature for your pdfium-render version.
        let pdfium = Self::load_pdfium(app_handle)?;

        let document = pdfium
            .load_pdf_from_file(pdf_path, None)
            .map_err(|e| format!("Failed to open PDF: {}", e))?;
        let pages = document.pages();
        let page_count: u16 = pages.len();
        if page_count == 0 {
            return Err("PDF has no pages".to_string());
        }
        let index_u16: u16 = if page_index < page_count as u32 { page_index as u16 } else { 0 };
        let page = pages
            .get(index_u16)
            .map_err(|e| format!("Failed to get page: {}", e))?;

        let cfg = PdfRenderConfig::new()
            .set_target_width(target_width as i32)
            .render_form_data(true)
            .use_lcd_text_rendering(true);

        let bitmap = page
            .render_with_config(&cfg)
            .map_err(|e| format!("Failed to render page: {}", e))?;

        let image = bitmap.as_image();
        let (w, h) = image.dimensions();
        image
            .save(out_path)
            .map_err(|e| format!("Failed to save preview: {}", e))?;
        if let Ok(md) = fs::metadata(out_path) {
            let sz = md.len();
            println!("Debug: pdfium saved PNG {}x{} bytes={} -> {}", w, h, sz, out_path);
            if sz == 0 {
                return Err("Preview file is empty".to_string());
            }
        }

        Ok(out_path.to_string())
    }

    /// Render a page to PNG bytes (avoids filesystem issues)
    pub fn render_page_to_png_bytes(
        app_handle: &AppHandle,
        pdf_path: &str,
        page_index: u32,
        target_width: u32,
    ) -> Result<Vec<u8>, String> {
        let pdfium = Self::load_pdfium(app_handle)?;
        let document = pdfium
            .load_pdf_from_file(pdf_path, None)
            .map_err(|e| format!("Failed to open PDF: {}", e))?;
        let pages = document.pages();
        let page_count: u16 = pages.len();
        if page_count == 0 { return Err("PDF has no pages".into()); }
        let index_u16: u16 = if page_index < page_count as u32 { page_index as u16 } else { 0 };
        let page = pages.get(index_u16).map_err(|e| format!("Failed to get page: {}", e))?;
        let cfg = PdfRenderConfig::new()
            .set_target_width(target_width as i32)
            .render_form_data(true)
            .use_lcd_text_rendering(true);
        let bitmap = page.render_with_config(&cfg).map_err(|e| format!("Failed to render page: {}", e))?;
        let image = bitmap.as_image();
        let mut buf = Cursor::new(Vec::new());
        image.write_to(&mut buf, ImageFormat::Png)
            .map_err(|e| format!("Failed to encode PNG: {}", e))?;
        let v = buf.into_inner();
        println!("Debug: pdfium encoded PNG bytes={}", v.len());
        if v.is_empty() { return Err("Encoded PNG was empty".into()); }
        Ok(v)
    }

    fn load_pdfium(app_handle: &AppHandle) -> Result<Pdfium, String> {
        // Try to load lib from bundled resources based on platform/arch; fall back to system library.
        let subdir = if cfg!(target_os = "macos") {
            if cfg!(target_arch = "aarch64") { "macos-aarch64" } else { "macos-x86_64" }
        } else if cfg!(target_os = "windows") {
            if cfg!(target_arch = "aarch64") { "windows-aarch64" } else { "windows-x86_64" }
        } else {
            // linux and others
            if cfg!(target_arch = "aarch64") { "linux-aarch64" } else { "linux-x86_64" }
        };

        log::info!("📄 Loading PDFium library for platform: {}", subdir);

        // 1) Look in packaged resources (works in production bundles)
        if let Some(base) = app_handle.path_resolver().resolve_resource(format!("pdfium/{}", subdir)) {
            let lib_path = Pdfium::pdfium_platform_library_name_at_path(&base);
            log::info!("   Trying packaged resource: {:?}", lib_path);
            if lib_path.exists() {
                log::info!("   ✓ Library file exists");
                match Pdfium::bind_to_library(&lib_path) {
                    Ok(bindings) => {
                        log::info!("   ✅ Successfully loaded PDFium from packaged resources");
                        return Ok(Pdfium::new(bindings));
                    }
                    Err(e) => {
                        log::warn!("   ⚠️  Failed to bind to library: {}", e);
                    }
                }
            } else {
                log::warn!("   ⚠️  Library file not found");
            }
        } else {
            log::warn!("   ⚠️  Could not resolve packaged resource path");
        }

        // 2) Look in dev resources folder (resources/pdfium/<subdir>) relative to CWD
        if let Ok(cwd) = std::env::current_dir() {
            let dev_base = cwd.join("resources").join("pdfium").join(subdir);
            let lib_path = Pdfium::pdfium_platform_library_name_at_path(&dev_base);
            log::info!("   Trying dev resources: {:?}", lib_path);
            if lib_path.exists() {
                log::info!("   ✓ Library file exists");
                match Pdfium::bind_to_library(&lib_path) {
                    Ok(bindings) => {
                        log::info!("   ✅ Successfully loaded PDFium from dev resources");
                        return Ok(Pdfium::new(bindings));
                    }
                    Err(e) => {
                        log::warn!("   ⚠️  Failed to bind to library: {}", e);
                    }
                }
            } else {
                log::warn!("   ⚠️  Library file not found");
            }

            // 3) Look in workspace layout (src-tauri/resources/pdfium/<subdir>)
            let dev_base2 = cwd.join("src-tauri").join("resources").join("pdfium").join(subdir);
            let lib_path2 = Pdfium::pdfium_platform_library_name_at_path(&dev_base2);
            log::info!("   Trying workspace layout: {:?}", lib_path2);
            if lib_path2.exists() {
                log::info!("   ✓ Library file exists");
                match Pdfium::bind_to_library(&lib_path2) {
                    Ok(bindings) => {
                        log::info!("   ✅ Successfully loaded PDFium from workspace");
                        return Ok(Pdfium::new(bindings));
                    }
                    Err(e) => {
                        log::warn!("   ⚠️  Failed to bind to library: {}", e);
                    }
                }
            } else {
                log::warn!("   ⚠️  Library file not found");
            }
        }

        // Fallback to system install
        log::info!("   Trying system library...");
        match Pdfium::bind_to_system_library() {
            Ok(bindings) => {
                log::info!("   ✅ Successfully loaded PDFium from system");
                Ok(Pdfium::new(bindings))
            }
            Err(e) => {
                log::error!("   ❌ Failed to load PDFium from system: {}", e);
                Err(format!("PDFium not found. Tried bundled and system libraries. Last error: {}", e))
            }
        }
    }
}
