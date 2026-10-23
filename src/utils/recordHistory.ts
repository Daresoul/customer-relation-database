/** Field names the backend records per version, and their form labels. */
const LABEL_KEY: Record<string, string> = {
  created: 'medical:fields.created',
  record_type: 'medical:fields.recordType',
  name: 'medical:fields.title',
  procedure_name: 'medical:fields.procedureName',
  description: 'medical:fields.description',
  prescription_notes: 'medical:fields.prescriptionNotes',
  price: 'medical:fields.price',
  currency_id: 'medical:fields.currency',
  line_items: 'medical:fields.lineItems',
  discount_percent: 'medical:fields.discount',
  manual_total: 'medical:fields.manualTotal',
  is_archived: 'medical:fields.isArchived',
};

export function changedFieldLabel(t: (key: string) => string, field: string): string {
  const key = LABEL_KEY[field];
  return key ? t(key) : field;
}
