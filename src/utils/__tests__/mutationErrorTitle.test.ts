import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import i18n from '../../i18n';
import { createMutationErrorHandler } from '../errors';

for (const level of ['error', 'warn', 'log'] as const) vi.spyOn(console, level).mockImplementation(() => {});

function titleFor(lang: 'en' | 'mk', operation: string) {
  const notification = { error: vi.fn() };
  const t = i18n.getFixedT(lang, 'errors');
  createMutationErrorHandler(notification, operation as never, t, 'test')(new Error('boom'));
  return notification.error.mock.calls[0][0].message as string;
}

describe('mutation error title', () => {
  it('is a whole Macedonian sentence in mk', () => {
    expect(titleFor('mk', 'createAppointment')).toBe('Неуспешно креирање на термин');
  });

  it('is a whole English sentence in en', () => {
    expect(titleFor('en', 'createAppointment')).toBe('Failed to create appointment');
  });

  it('every caller names an operation that has a text in both languages', () => {
    const hooks = path.resolve(__dirname, '../../hooks');
    const used: string[] = [];
    for (const name of fs.readdirSync(hooks)) {
      if (!/\.tsx?$/.test(name)) continue;
      const source = fs.readFileSync(path.join(hooks, name), 'utf8');
      for (const m of source.matchAll(/createMutationErrorHandler\(\s*\w+\s*,\s*['"]([^'"]+)['"]/g)) used.push(m[1]);
    }
    expect(used.length).toBeGreaterThan(40);
    const missing = used.filter(
      (op) => !i18n.exists(`errors:operations.${op}`, { lng: 'en' }) || !i18n.exists(`errors:operations.${op}`, { lng: 'mk' }),
    );
    expect(missing).toEqual([]);
  });
});
