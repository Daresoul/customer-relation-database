/**
 * Capitalizes the first letter of each word and keeps the rest as typed,
 * so "GSD" stays "GSD".
 */
export const toTitleCase = (str: string): string => {
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};
