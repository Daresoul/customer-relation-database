/**
 * Dates on screen use the clinic's date format (Settings), through
 * utils/dateFormatter. The browser's own toLocaleString() ignores it and on a
 * US-set Windows shows 10/23/2026, 12:35:27 PM; a format written into a
 * component (DD.MM.YYYY, MMM DD, YYYY) ignores it too.
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

  it('are never formatted with a pattern written into the component', () => {
    // Numeric day/month patterns and US-style month-name dates; YYYY-MM-DD
    // for data sent to the backend is fine.
    const shown = /\.format\(\s*['"`](DD|D|MM)[./ -]|\.format\(\s*['"`]MMM+ DD, YYYY/;
    const offenders = sourceFiles(SRC).flatMap((file) => {
      if (file.endsWith('dateFormatter.ts')) return [];
      const text = readFileSync(file, 'utf8');
      const lines = text.split('\n');
      const bad = lines.flatMap((line, i) => (shown.test(line) ? [`${relative(SRC, file)}:${i + 1}`] : []));
      for (const m of text.matchAll(/<(DatePicker|RangePicker|DatePicker\.RangePicker)\b/g)) {
        const tag = text.slice(m.index, text.indexOf('/>', m.index));
        if (!tag.includes('format={getDatePickerFormat()}')) {
          bad.push(`${relative(SRC, file)}:${text.slice(0, m.index).split('\n').length} (date picker)`);
        }
      }
      return bad;
    });
    expect(offenders).toEqual([]);
  });
});

