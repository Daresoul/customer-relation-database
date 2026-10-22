/**
 * Every translation key the code uses must exist in English and Macedonian,
 * and both languages must carry the same keys. Runs over the source text, so a
 * missing key fails CI instead of showing English (or the raw key) in mk.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import i18n from '../index';

type Tree = { [key: string]: string | Tree };
type Resources = Record<string, Record<string, Tree>>;

const SRC = path.resolve(__dirname, '../..');
const LANGS = ['en', 'mk'] as const;
const resources = i18n.options.resources as unknown as Resources;
const defaultNS = String(i18n.options.defaultNS);
const namespaces = Object.keys(resources.en);

// Files that get `t` as a parameter instead of calling useTranslation.
// Their unprefixed keys resolve in the caller's namespace, named here.
const FILE_NAMESPACE: Record<string, string> = {
  'components/DeviceStatusBar/deviceHealth.ts': 'devices',
  'services/updateService.ts': 'settings',
};

// Keys built at runtime whose static prefix is not itself a key group.
// Format: 'file:key-prefix'. Keep this empty or tiny, with a reason each.
const DYNAMIC_ALLOW: string[] = [];

function flatten(tree: Tree, prefix = '', out: Map<string, string> = new Map()) {
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else flatten(v, key, out);
  }
  return out;
}

function lookup(lang: string, ns: string, keyPath: string): string | Tree | undefined {
  let node: string | Tree | undefined = resources[lang]?.[ns];
  for (const part of keyPath.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[part];
  }
  return node;
}

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'i18n' || entry.name === 'node_modules') continue;
      listSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Text of a call's arguments after the key, up to the matching ')'. */
function argsAfter(source: string, from: number): string {
  let depth = 1;
  for (let i = from; i < source.length; i++) {
    const c = source[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return source.slice(from, i);
    }
  }
  return source.slice(from);
}

function namespaceAt(source: string, offset: number, rel: string): string {
  const calls = [...source.matchAll(/useTranslation\(\s*(\[[^\]]*\]|['"][^'"]*['"])?\s*\)/g)];
  if (calls.length === 0) return FILE_NAMESPACE[rel] ?? defaultNS;
  const before = calls.filter((m) => (m.index ?? 0) < offset);
  const call = before.length ? before[before.length - 1] : calls[0];
  const arg = call[1];
  if (!arg) return defaultNS;
  const first = arg.match(/['"]([^'"]+)['"]/);
  return first ? first[1] : defaultNS;
}

function splitKey(raw: string, ns: string): { ns: string; key: string } {
  const colon = raw.indexOf(':');
  if (colon > 0 && namespaces.includes(raw.slice(0, colon))) {
    return { ns: raw.slice(0, colon), key: raw.slice(colon + 1) };
  }
  return { ns, key: raw };
}

interface Usage {
  file: string;
  line: number;
  ns: string;
  key: string;
  args: string;
  prefixOnly: boolean;
}

function collectUsages(): Usage[] {
  const usages: Usage[] = [];
  for (const file of listSourceFiles(SRC)) {
    const source = fs.readFileSync(file, 'utf8');
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    const lineOf = (offset: number) => source.slice(0, offset).split('\n').length;

    // t('key', ...), t("key"), t(`key`) and i18n.t('ns:key')
    const callRe = /(?<![\w$.])(i18n\.|i18next\.)?t\(\s*(['"`])((?:\\.|(?!\2)[^\\])*?)\2\s*([,)])/g;
    for (const m of source.matchAll(callRe)) {
      const raw = m[3];
      const isI18nObject = Boolean(m[1]);
      const offset = m.index ?? 0;
      const ns = isI18nObject ? defaultNS : namespaceAt(source, offset, rel);
      const argStart = offset + m[0].length;
      const args = m[4] === ',' ? argsAfter(source, argStart) : '';
      if (m[2] === '`' && raw.includes('${')) continue;
      const nsOption = args.match(/\bns:\s*['"]([^'"]+)['"]/);
      const { ns: keyNs, key } = splitKey(raw, nsOption ? nsOption[1] : ns);
      usages.push({ file: rel, line: lineOf(offset), ns: keyNs, key, args, prefixOnly: false });
    }

    // t(`group.${x}`): the static part must name a key group in both languages.
    const templateRe = /(?<![\w$.])(i18n\.)?t\(\s*`([^`$]*)\$\{/g;
    for (const m of source.matchAll(templateRe)) {
      const offset = m.index ?? 0;
      const prefix = m[2];
      if (!prefix.endsWith('.')) continue;
      if (DYNAMIC_ALLOW.includes(`${rel}:${prefix}`)) continue;
      const ns = m[1] ? defaultNS : namespaceAt(source, offset, rel);
      const { ns: keyNs, key } = splitKey(prefix.slice(0, -1), ns);
      usages.push({ file: rel, line: lineOf(offset), ns: keyNs, key, args: '', prefixOnly: true });
    }

    // <Trans i18nKey="ns:key" />
    for (const m of source.matchAll(/i18nKey=\{?\s*['"]([^'"]+)['"]/g)) {
      const offset = m.index ?? 0;
      const { ns, key } = splitKey(m[1], namespaceAt(source, offset, rel));
      usages.push({ file: rel, line: lineOf(offset), ns, key, args: '', prefixOnly: false });
    }
  }
  return usages;
}

function problem(u: Usage, lang: string): string | null {
  const value = lookup(lang, u.ns, u.key);
  if (u.prefixOnly) {
    return value !== undefined && typeof value === 'object' ? null : 'is not a key group';
  }
  if (typeof value === 'string') return null;
  if (/\bcount\b/.test(u.args)) {
    const one = lookup(lang, u.ns, `${u.key}_one`);
    const other = lookup(lang, u.ns, `${u.key}_other`);
    if (typeof one === 'string' && typeof other === 'string') return null;
  }
  if (value !== undefined && /returnObjects:\s*true/.test(u.args)) return null;
  return value === undefined ? 'is missing' : 'is a group, not a text';
}

describe('translation keys', () => {
  it('English and Macedonian have the same keys in every namespace', () => {
    const diffs: string[] = [];
    for (const ns of namespaces) {
      const en = flatten(resources.en[ns]);
      const mk = flatten(resources.mk[ns] ?? {});
      for (const k of en.keys()) if (!mk.has(k)) diffs.push(`mk is missing ${ns}:${k}`);
      for (const k of mk.keys()) if (!en.has(k)) diffs.push(`en is missing ${ns}:${k}`);
    }
    expect(diffs).toEqual([]);
  });

  it('English and Macedonian texts use the same {{placeholders}}', () => {
    const diffs: string[] = [];
    const vars = (s: string) => [...s.matchAll(/\{\{\s*(\w+)[^}]*\}\}/g)].map((m) => m[1]).sort().join(',');
    for (const ns of namespaces) {
      const en = flatten(resources.en[ns]);
      const mk = flatten(resources.mk[ns] ?? {});
      for (const [k, enText] of en) {
        const mkText = mk.get(k);
        if (mkText !== undefined && vars(enText) !== vars(mkText)) {
          diffs.push(`${ns}:${k} en {${vars(enText)}} mk {${vars(mkText)}}`);
        }
      }
    }
    expect(diffs).toEqual([]);
  });

  it('every literal key used in the code exists in English and Macedonian', () => {
    const usages = collectUsages();
    expect(usages.length).toBeGreaterThan(500);
    const missing: string[] = [];
    for (const u of usages) {
      for (const lang of LANGS) {
        const why = problem(u, lang);
        if (why) missing.push(`${u.file}:${u.line} ${lang} ${u.ns}:${u.key} ${why}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});
