import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../..');
const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));

function directives(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...values] = d.split(/\s+/);
        return [name, values];
      }),
  );
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('tauri.conf.json security', () => {
  it('sets a strict content security policy', () => {
    const csp = conf.tauri.security.csp;
    expect(typeof csp).toBe('string');
    const d = directives(csp);
    expect(d['default-src']).toEqual(["'self'"]);
    expect(d['script-src']).toEqual(["'self'"]);
    expect(d['frame-src'] ?? []).not.toContain("'self'");
    expect(d['object-src']).toBeDefined();
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/(^|\s)(https?:|\*)(\s|;|$)/);
  });

  it('does not expose window.__TAURI__ to page scripts', () => {
    expect(conf.build.withGlobalTauri).toBe(false);
  });

  it('frontend code never relies on window.__TAURI__', () => {
    const offenders = sourceFiles(path.join(root, 'src')).filter((f) =>
      /__TAURI__/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it('allows only the APIs the frontend uses', () => {
    const allow = conf.tauri.allowlist;
    expect(allow.shell?.open ?? false).toBe(false);
    expect(allow.fs.scope).toEqual(['$TEMP/vet-clinic-attachments/previews/*']);
  });
});
