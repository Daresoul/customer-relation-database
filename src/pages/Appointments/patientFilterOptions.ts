import type { TFunction } from 'i18next';

export function patientFilterOptions(
  patients: Array<{ id: number; name: string; species?: string | null }>,
  _t: TFunction,
): Array<{ value: number; label: string }> {
  return patients.map((p) => ({ value: p.id, label: [p.name, p.species].filter(Boolean).join(' · ') }));
}
