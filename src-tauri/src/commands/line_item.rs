use tauri::State;
use log::{info, error};
use crate::database::SeaOrmPool;
use crate::services::line_item::LineItemService;
use crate::models::{
    LineItemTemplate, CreateLineItemTemplateInput, UpdateLineItemTemplateInput
};

// ==================== LINE ITEM TEMPLATES (Settings) ====================

#[tauri::command]
pub async fn get_line_item_templates(
    pool: State<'_, SeaOrmPool>,
    active_only: Option<bool>,
) -> Result<Vec<LineItemTemplate>, String> {
    info!("get_line_item_templates called with active_only: {:?}", active_only);
    match LineItemService::get_templates(&pool, active_only.unwrap_or(true)).await {
        Ok(templates) => {
            info!("Found {} line item templates", templates.len());
            Ok(templates)
        }
        Err(e) => {
            error!("Failed to get line item templates: {}", e);
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn get_line_item_template(
    pool: State<'_, SeaOrmPool>,
    id: i64,
) -> Result<LineItemTemplate, String> {
    LineItemService::get_template_by_id(&pool, id).await
}

#[tauri::command]
pub async fn create_line_item_template(
    pool: State<'_, SeaOrmPool>,
    input: CreateLineItemTemplateInput,
) -> Result<LineItemTemplate, String> {
    info!("create_line_item_template called with: {:?}", input);
    match LineItemService::create_template(&pool, input).await {
        Ok(template) => {
            info!("Line item template created successfully: {:?}", template.id);
            Ok(template)
        }
        Err(e) => {
            error!("Failed to create line item template: {}", e);
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn update_line_item_template(
    pool: State<'_, SeaOrmPool>,
    id: i64,
    input: UpdateLineItemTemplateInput,
) -> Result<LineItemTemplate, String> {
    LineItemService::update_template(&pool, id, input).await
}

#[tauri::command]
pub async fn delete_line_item_template(
    pool: State<'_, SeaOrmPool>,
    id: i64,
) -> Result<(), String> {
    LineItemService::delete_template(&pool, id).await
}
