/**
 * The clinic simulator replays real captures the way the machines send them:
 * serial bytes in small timed chunks, Exigo results as files in the watched
 * folder (a day file that grows sample by sample, like the BM800 writes it).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCENARIOS, chunk, serialPlan, exigoPlan, parseConfig } from '../scenarios.mjs';

// vitest runs from the repo root.
const fixture = (name) => readFileSync(resolve(process.cwd(), 'src-tauri/tests/fixtures', name));
const DAY = fixture('exigo_daily_two_samples.xml').toString('utf8');
const NOW = new Date('2026-10-23T09:30:00');

describe('scenarios', () => {
  it('cover every machine and the failure cases', () => {
    expect(Object.keys(SCENARIOS)).toEqual(
      expect.arrayContaining([
        'pointcare-panel',
        'pointcare-twice',
        'pointcare-cut-frame',
        'pointcare-slow',
        'healvet-result',
        'pcr-result',
        'exigo-day',
        'exigo-day-growing',
        'exigo-single',
        'exigo-unreadable',
      ]),
    );
  });
});

describe('chunk', () => {
  it('splits bytes into pieces of at most the given size, in order', () => {
    const parts = chunk(Buffer.from('abcdefg'), 3);
    expect(parts.map((p) => p.toString())).toEqual(['abc', 'def', 'g']);
  });
});

describe('serialPlan', () => {
  it('sends the whole capture in timed chunks', () => {
    const bytes = fixture('real_chem_pcv.bin');
    const plan = serialPlan(SCENARIOS['pointcare-panel'], bytes);
    expect(Buffer.concat(plan.map((s) => s.bytes)).equals(bytes)).toBe(true);
    expect(plan.every((s) => s.bytes.length <= SCENARIOS['pointcare-panel'].chunkSize)).toBe(true);
    expect(plan.every((s) => s.delayMs >= 0)).toBe(true);
  });

  it('sends the capture twice for a resend', () => {
    const bytes = fixture('real_chem_pcv.bin');
    const plan = serialPlan(SCENARIOS['pointcare-twice'], bytes);
    expect(Buffer.concat(plan.map((s) => s.bytes)).equals(Buffer.concat([bytes, bytes]))).toBe(true);
  });

  it('stops halfway through for a cut frame', () => {
    const bytes = fixture('real_chem_pcv.bin');
    const sent = Buffer.concat(serialPlan(SCENARIOS['pointcare-cut-frame'], bytes).map((s) => s.bytes));
    expect(sent.length).toBe(Math.floor(bytes.length / 2));
    expect(bytes.subarray(0, sent.length).equals(sent)).toBe(true);
  });
});

describe('exigoPlan', () => {
  it('writes a day file named like the BM800 does', () => {
    const steps = exigoPlan(SCENARIOS['exigo-day'], DAY, NOW);
    expect(steps).toHaveLength(1);
    expect(steps[0].name).toBe('BM-53672_2026-10-23.xml');
    expect(steps[0].content).toBe(DAY);
  });

  it('grows the day file: first sample, then both', () => {
    const steps = exigoPlan(SCENARIOS['exigo-day-growing'], DAY, NOW);
    expect(steps).toHaveLength(2);
    expect(steps[0].name).toBe(steps[1].name);
    expect((steps[0].content.match(/<sample /g) ?? []).length).toBe(1);
    expect(steps[0].content.trimEnd().endsWith('</samples>')).toBe(true);
    expect(steps[1].content).toBe(DAY);
    expect(steps[1].delayMs).toBeGreaterThan(0);
  });

  it('writes a single-result file with the sample id in its name', () => {
    const [step] = exigoPlan(SCENARIOS['exigo-single'], DAY, NOW);
    expect(step.name).toMatch(/^exigo_SIM-\d+\.xml$/);
    expect(step.content).toContain('<ExigoResult>');
    expect(step.content).toContain('<SampleId>SIM-');
  });

  it('writes an unreadable file for the failure path', () => {
    const [step] = exigoPlan(SCENARIOS['exigo-unreadable'], DAY, NOW);
    expect(step.name.endsWith('.xml')).toBe(true);
    expect(step.content).not.toContain('<samples');
  });
});

describe('lab config', () => {
  it('reads a config file Windows PowerShell wrote (with a byte-order mark)', () => {
    expect(parseConfig('\uFEFF{"exigo":"C:\\\\ArkivetLab\\\\exigo"}')).toEqual({ exigo: 'C:\\ArkivetLab\\exigo' });
  });
});
