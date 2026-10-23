import type { TFunction } from 'i18next';

// Default species are stored by their English name ("Guinea Pig"); one the
// clinic added keeps its own name.
export function speciesLabel(t: TFunction, species: string | null | undefined): string {
  if (!species) return '';
  const lower = species.toLowerCase();
  const keys = [lower, lower.replace(/\s+/g, '_'), lower.replace(/\s+(\w)/g, (_, c: string) => c.toUpperCase())];
  for (const key of keys) {
    const fullKey = `entities:species.${key}`;
    const label = t(fullKey, { defaultValue: '' });
    if (label && label !== fullKey) return label;
  }
  return species;
}
