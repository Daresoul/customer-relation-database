/** The record's version history names what changed in the app language, not "description". */
import { describe, it, expect } from 'vitest';
import { changedFieldLabel } from '../recordHistory';

const t = (key: string) => `t(${key})`;

describe('changedFieldLabel', () => {
  it('uses the form label of each field the backend reports', () => {
    expect(changedFieldLabel(t, 'description')).toBe('t(medical:fields.description)');
    expect(changedFieldLabel(t, 'prescription_notes')).toBe('t(medical:fields.prescriptionNotes)');
    expect(changedFieldLabel(t, 'line_items')).toBe('t(medical:fields.lineItems)');
    expect(changedFieldLabel(t, 'created')).toBe('t(medical:fields.created)');
  });

  it('keeps a name it does not know', () => {
    expect(changedFieldLabel(t, 'something_new')).toBe('something_new');
  });
});
