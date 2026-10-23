/**
 * Dates on screen use the clinic's date format (Settings), through
 * utils/dateFormatter. The browser's own toLocaleString() ignores it and on a
 * US-set Windows shows 10/23/2026, 12:35:27 PM.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC = resolve(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('dates on screen', () => {
  it('never come from the browser locale', () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => /new Date\([^)]*\)\.toLocale(Date|Time)?String\(/.test(line))
        .map(({ n }) => `${relative(SRC, file)}:${n}`),
    );
    expect(offenders).toEqual([]);
  });
});
