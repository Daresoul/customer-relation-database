import type { TFunction } from 'i18next';

export function speciesLabel(_t: TFunction, species: string | null | undefined): string {
  return species ?? '';
}
