use crate::entities::line_item_template::{self, Entity as LineItemTemplateEntity};
use crate::entities::medical_record_line_item::{self, Entity as MedicalRecordLineItemEntity};
use crate::models::{
    LineItemTemplate, CreateLineItemTemplateInput, UpdateLineItemTemplateInput,
    MedicalRecordLineItem, CreateLineItemInput
};
use chrono::Utc;
use sea_orm::*;

pub struct LineItemService;

impl LineItemService {
    /// Convert a SeaORM line item template model to the API model
    fn template_to_api_model(model: line_item_template::Model) -> LineItemTemplate {
        LineItemTemplate {
            id: model.id,
            name: model.name,
            description: model.description,
            default_price: model.default_price,
            currency_id: model.currency_id,
            display_order: model.display_order,
            is_active: model.is_active,
            created_at: model.created_at,
            updated_at: model.updated_at,
        }
    }

    /// Convert a SeaORM medical record line item model to the API model
    fn line_item_to_api_model(model: medical_record_line_item::Model) -> MedicalRecordLineItem {
        MedicalRecordLineItem {
            id: model.id,
            medical_record_id: model.medical_record_id,
            template_id: model.template_id,
            name: model.name,
            description: model.description,
            unit_price: model.unit_price,
            currency_id: model.currency_id,
            quantity: model.quantity,
            created_at: model.created_at,
        }
    }

    // ==================== LINE ITEM TEMPLATES (Settings) ====================

    /// Get all line item templates (optionally filtered by active status)
    pub async fn get_templates(
        db: &DatabaseConnection,
        active_only: bool,
    ) -> Result<Vec<LineItemTemplate>, String> {
        let mut query = LineItemTemplateEntity::find();

        if active_only {
            query = query.filter(line_item_template::Column::IsActive.eq(true));
        }

        let templates = query
            .order_by_asc(line_item_template::Column::DisplayOrder)
            .order_by_asc(line_item_template::Column::Name)
            .all(db)
            .await
            .map_err(|e| format!("Failed to fetch line item templates: {}", e))?;

        Ok(templates.into_iter().map(Self::template_to_api_model).collect())
    }

    /// Get a single line item template by ID
    pub async fn get_template_by_id(
        db: &DatabaseConnection,
        id: i64,
    ) -> Result<LineItemTemplate, String> {
        let template = LineItemTemplateEntity::find_by_id(id)
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch line item template: {}", e))?
            .ok_or_else(|| "Line item template not found".to_string())?;

        Ok(Self::template_to_api_model(template))
    }

    /// Create a new line item template
    pub async fn create_template(
        db: &DatabaseConnection,
        input: CreateLineItemTemplateInput,
    ) -> Result<LineItemTemplate, String> {
        // Validate input
        if input.name.trim().is_empty() {
            return Err("Name cannot be empty".to_string());
        }
        if input.default_price < 0.0 {
            return Err("Default price cannot be negative".to_string());
        }

        // Get the next display_order
        let highest_order = LineItemTemplateEntity::find()
            .order_by_desc(line_item_template::Column::DisplayOrder)
            .one(db)
            .await
            .map_err(|e| format!("Failed to get max display order: {}", e))?;

        let display_order = highest_order
            .map(|t| t.display_order + 1)
            .unwrap_or(0);

        let now = Utc::now();

        let new_template = line_item_template::ActiveModel {
            name: Set(input.name.trim().to_string()),
            description: Set(input.description),
            default_price: Set(input.default_price),
            currency_id: Set(input.currency_id),
            display_order: Set(display_order),
            is_active: Set(true),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        };

        let result = LineItemTemplateEntity::insert(new_template)
            .exec(db)
            .await
            .map_err(|e| format!("Failed to create line item template: {}", e))?;

        Self::get_template_by_id(db, result.last_insert_id).await
    }

    /// Update a line item template
    pub async fn update_template(
        db: &DatabaseConnection,
        id: i64,
        input: UpdateLineItemTemplateInput,
    ) -> Result<LineItemTemplate, String> {
        // Check if template exists
        let existing = LineItemTemplateEntity::find_by_id(id)
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch line item template: {}", e))?
            .ok_or_else(|| "Line item template not found".to_string())?;

        // Check if there's anything to update
        if input.name.is_none()
            && input.description.is_none()
            && input.default_price.is_none()
            && input.currency_id.is_none()
            && input.is_active.is_none()
            && input.display_order.is_none()
        {
            return Ok(Self::template_to_api_model(existing));
        }

        // Validate name if provided
        if let Some(ref name) = input.name {
            if name.trim().is_empty() {
                return Err("Name cannot be empty".to_string());
            }
        }

        // Validate price if provided
        if let Some(price) = input.default_price {
            if price < 0.0 {
                return Err("Default price cannot be negative".to_string());
            }
        }

        let now = Utc::now();
        let mut template_model: line_item_template::ActiveModel = existing.into();

        if let Some(name) = input.name {
            template_model.name = Set(name.trim().to_string());
        }
        if let Some(description) = input.description {
            template_model.description = Set(Some(description));
        }
        if let Some(default_price) = input.default_price {
            template_model.default_price = Set(default_price);
        }
        if let Some(currency_id) = input.currency_id {
            template_model.currency_id = Set(currency_id);
        }
        if let Some(is_active) = input.is_active {
            template_model.is_active = Set(is_active);
        }
        if let Some(display_order) = input.display_order {
            template_model.display_order = Set(display_order);
        }
        template_model.updated_at = Set(now);

        template_model
            .update(db)
            .await
            .map_err(|e| format!("Failed to update line item template: {}", e))?;

        Self::get_template_by_id(db, id).await
    }

    /// Delete a line item template (soft delete by setting is_active = false)
    pub async fn delete_template(
        db: &DatabaseConnection,
        id: i64,
    ) -> Result<(), String> {
        let template = LineItemTemplateEntity::find_by_id(id)
            .one(db)
            .await
            .map_err(|e| format!("Failed to fetch line item template: {}", e))?
            .ok_or_else(|| format!("Line item template with id {} not found", id))?;

        let now = Utc::now();
        let mut template_model: line_item_template::ActiveModel = template.into();
        template_model.is_active = Set(false);
        template_model.updated_at = Set(now);

        template_model
            .update(db)
            .await
            .map_err(|e| format!("Failed to delete line item template: {}", e))?;

        Ok(())
    }

    // ==================== MEDICAL RECORD LINE ITEMS ====================

    /// Get all line items for a medical record
    pub async fn get_line_items_for_record(
        db: &DatabaseConnection,
        medical_record_id: i64,
    ) -> Result<Vec<MedicalRecordLineItem>, String> {
        let line_items = MedicalRecordLineItemEntity::find()
            .filter(medical_record_line_item::Column::MedicalRecordId.eq(medical_record_id))
            .order_by_asc(medical_record_line_item::Column::Id)
            .all(db)
            .await
            .map_err(|e| format!("Failed to fetch line items: {}", e))?;

        Ok(line_items.into_iter().map(Self::line_item_to_api_model).collect())
    }

    /// Create line items for a medical record
    pub async fn create_line_items_for_record(
        db: &DatabaseConnection,
        medical_record_id: i64,
        items: Vec<CreateLineItemInput>,
    ) -> Result<Vec<MedicalRecordLineItem>, String> {
        let now = Utc::now();

        for item in &items {
            if item.name.trim().is_empty() {
                return Err("Line item name cannot be empty".to_string());
            }
            if item.unit_price < 0.0 {
                return Err("Unit price cannot be negative".to_string());
            }
            if item.quantity < 1 {
                return Err("Quantity must be at least 1".to_string());
            }
        }

        let new_items: Vec<medical_record_line_item::ActiveModel> = items
            .into_iter()
            .map(|item| medical_record_line_item::ActiveModel {
                medical_record_id: Set(medical_record_id),
                template_id: Set(item.template_id),
                name: Set(item.name.trim().to_string()),
                description: Set(item.description),
                unit_price: Set(item.unit_price),
                currency_id: Set(item.currency_id),
                quantity: Set(item.quantity),
                created_at: Set(now),
                ..Default::default()
            })
            .collect();

        if !new_items.is_empty() {
            MedicalRecordLineItemEntity::insert_many(new_items)
                .exec(db)
                .await
                .map_err(|e| format!("Failed to create line items: {}", e))?;
        }

        Self::get_line_items_for_record(db, medical_record_id).await
    }

    /// Replace all line items for a medical record
    pub async fn replace_line_items_for_record(
        db: &DatabaseConnection,
        medical_record_id: i64,
        items: Vec<CreateLineItemInput>,
    ) -> Result<Vec<MedicalRecordLineItem>, String> {
        // Delete existing line items
        MedicalRecordLineItemEntity::delete_many()
            .filter(medical_record_line_item::Column::MedicalRecordId.eq(medical_record_id))
            .exec(db)
            .await
            .map_err(|e| format!("Failed to delete existing line items: {}", e))?;

        // Create new line items
        Self::create_line_items_for_record(db, medical_record_id, items).await
    }

    /// Delete all line items for a medical record
    pub async fn delete_line_items_for_record(
        db: &DatabaseConnection,
        medical_record_id: i64,
    ) -> Result<(), String> {
        MedicalRecordLineItemEntity::delete_many()
            .filter(medical_record_line_item::Column::MedicalRecordId.eq(medical_record_id))
            .exec(db)
            .await
            .map_err(|e| format!("Failed to delete line items: {}", e))?;

        Ok(())
    }
}
