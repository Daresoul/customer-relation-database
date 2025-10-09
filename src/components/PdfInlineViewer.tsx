import React, { useEffect, useRef, useState } from 'react';
import { Typography, Button } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
// pdf.js v3 imports — use legacy build for wider WebView compatibility
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.js?url';
import styles from './PdfInlineViewer.module.css';

const { Text } = Typography;

interface PdfInlineViewerProps {
  blob: Blob;
  fileName: string;
}

// Best-effort inline PDF viewer using pdfjs-dist if available.
// Falls back to a helpful message if the lib is not installed.
const PdfInlineViewer: React.FC<PdfInlineViewerProps> = ({ blob, fileName }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const renderTaskRef = useRef<any>(null);
  const loadingTaskRef = useRef<any>(null);

  useEffect(() => {
    let active = true;
    let rendered = false;
    const start = Date.now();
    let watchdog: any = null;
    (async () => {
      try {
        // Read PDF bytes from provided Blob
        const ab = await blob.arrayBuffer();
        const uint8 = new Uint8Array(ab);

        // Configure pdf.js v3 worker
        GlobalWorkerOptions.workerSrc = workerSrc as any;
        let pdf;
        const isTauri = typeof (window as any).__TAURI__ !== 'undefined';
        const preferNoWorker = isTauri; // In Tauri WebView, workers/eval often fail — render on main thread.
        try {
          if (preferNoWorker) {
            const loadingTaskNoWorker = getDocument({
              data: uint8,
              disableWorker: true,
              isEvalSupported: false,
            } as any);
            loadingTaskRef.current = loadingTaskNoWorker;
            pdf = await loadingTaskNoWorker.promise;
          } else {
            const loadingTask = getDocument({ data: uint8 });
            loadingTaskRef.current = loadingTask;
            pdf = await loadingTask.promise;
          }
        } catch (workerErr) {
          console.warn('[PDF Viewer] Initial load failed, retrying without worker:', workerErr);
          // Retry without a worker (main-thread rendering) for environments that block Workers
          const loadingTaskNoWorker = getDocument({ data: uint8, disableWorker: true, isEvalSupported: false } as any);
          loadingTaskRef.current = loadingTaskNoWorker;
          pdf = await loadingTaskNoWorker.promise;
        }
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: 1.0 });
        const canvas = canvasRef.current;
        if (!canvas || !active) return;
        const context = canvas.getContext('2d', { alpha: false, desynchronized: true } as any);
        if (!context) throw new Error('Canvas context not available');
        // Handle HiDPI: keep DPR=1 in Tauri for speed, higher elsewhere for sharpness
        const dpr = isTauri ? 1 : Math.min(window.devicePixelRatio || 1.5, 2);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.width = Math.floor((viewport.width as number) * dpr);
        canvas.height = Math.floor((viewport.height as number) * dpr);
        const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
        const renderContext = { canvasContext: context, viewport, transform } as any;
        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;
        // Start the watchdog only once rendering begins
        watchdog = setTimeout(() => {
          if (active && !rendered) {
            console.warn('[PDF Viewer] Render timeout after', Date.now() - start, 'ms, falling back to embed');
            try { renderTaskRef.current?.cancel?.(); } catch {}
            setError('Inline PDF viewing timed out.');
          }
        }, 10000);
        await renderTask.promise;
        rendered = true;
        if (watchdog) clearTimeout(watchdog);
      } catch (e: any) {
        if (watchdog) clearTimeout(watchdog);
        if (e?.name === 'RenderingCancelledException' || /cancel/i.test(String(e?.message || ''))) {
          console.warn('[PDF Viewer] Rendering was cancelled.');
          return; // don't show an error for expected cancellations
        }
        console.error('PDF inline viewer error:', e);
        setError(`Inline PDF viewing failed. ${e?.message || ''}`.trim());
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      if (watchdog) clearTimeout(watchdog);
      try { renderTaskRef.current?.cancel?.(); } catch {}
      try { loadingTaskRef.current?.destroy?.(); } catch {}
    };
  }, [blob, fileName]);

  // Create and manage a fallback object URL if we hit the error path
  useEffect(() => {
    if (!error) {
      if (fallbackUrl) {
        URL.revokeObjectURL(fallbackUrl);
        setFallbackUrl(null);
      }
      return;
    }
    const url = URL.createObjectURL(blob);
    setFallbackUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
    // Only re-run when blob or error changes
  }, [error, blob]);

  // Print function - print the rendered canvas
  const handlePrint = () => {
    // Just trigger browser print - will print the current page
    window.print();
  };

  if (error) {
    return (
      <div>
        <Text type="secondary" className={styles.errorText}>{error}</Text>
        {/* Use object/iframe with blob URL if the runtime can display PDFs */}
        {fallbackUrl ? (
          <>
            <object data={fallbackUrl} type="application/pdf" width="100%" height={480}>
              <iframe src={fallbackUrl} title={fileName} className={styles.iframe} />
            </object>
            <div className={styles.fallbackLink}>
              <a href={fallbackUrl} download={fileName}>Download PDF</a>
            </div>
          </>
        ) : (
          <Text type="secondary">Unable to display PDF here.</Text>
        )}
      </div>
    );
  }
  if (loading) {
    return <Text type="secondary">Loading preview...</Text>;
  }
  return (
    <div>
      <div style={{ marginBottom: '8px', textAlign: 'right' }}>
        <Button
          size="small"
          icon={<PrinterOutlined />}
          onClick={handlePrint}
        >
          Print
        </Button>
      </div>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
};

export default PdfInlineViewer;
