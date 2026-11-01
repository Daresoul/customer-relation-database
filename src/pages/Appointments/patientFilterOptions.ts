import type { TFunction } from 'i18next';
import { speciesLabel } from '@/utils/species';

/** The patient filter's choices: name and species in the app language. */
export function patientFilterOptions(
  patients: Array<{ id: number; name?: string | null; species?: string | null }>,
  t: TFunction,
): Array<{ value: number; label: string }> {
  return patients.map((p) => ({ value: p.id, label: [p.name, speciesLabel(t, p.species)].filter(Boolean).join(' · ') }));
}
