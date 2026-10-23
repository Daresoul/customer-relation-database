/**
 * The app has a light and a dark theme. A stylesheet that writes a dark-theme
 * colour straight in (instead of a theme variable) paints that part dark in
 * the light theme too — a black page, near-white text on white.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
const DARK_ONLY = /#(141414|1f1f1f|262626|2a2a2a|303030|e6e6e6|a6a6a6)\b/i;

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'theme' ? [] : cssFiles(path);
    return path.endsWith('.css') ? [path] : [];
  });
}

// Rules whose selector names a theme are fine; so is a var() fallback.
function unthemedDarkColours(css: string): string[] {
  const found: string[] = [];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = rule.exec(css.replace(/\/\*[\s\S]*?\*\//g, '')))) {
    const [, selector, body] = m;
    if (/data-theme|prefers-color-scheme/.test(selector)) continue;
    for (const decl of body.split(';')) {
      const value = decl.replace(/var\([^()]*\)/g, '');
      if (DARK_ONLY.test(value)) found.push(`${selector.trim()} { ${decl.trim()} }`);
    }
  }
  return found;
}

describe('stylesheets follow the theme', () => {
  it('write no dark-theme colour outside a theme rule', () => {
    const offenders = cssFiles(SRC).flatMap((file) =>
      unthemedDarkColours(readFileSync(file, 'utf8')).map((d) => `${relative(SRC, file)}: ${d}`),
    );
    expect(offenders).toEqual([]);
  });
});
