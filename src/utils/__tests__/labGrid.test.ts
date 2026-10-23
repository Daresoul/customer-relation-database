import { describe, it, expect } from 'vitest';
import { analyteKey, buildLabGrid, changeFromPrevious, panelOf, trendPoints } from '../labGrid';
import type { LabResultRow } from '../../types/labResults';

let nextId = 1;
function v(over: Partial<LabResultRow>): LabResultRow {
  return {
    id: nextId++,
    patientId: 3,
    medicalRecordId: 7,
    attachmentId: 1,
    deviceType: 'exigo_eos_vet',
    sampleAt: '2026-07-10T14:52:11',
    code: 'WBC',
    name: 'WBC - леукоцити',
    position: 3,
    valueText: '10.4',
    valueNum: 10.4,
    unit: '10e+9/L',
    refLow: 6,
    refHigh: 17,
    rangeText: '6.0 - 17.0',
    flag: 'N',
    ...over,
  };
}

describe('panelOf', () => {
  it('names the panel each machine runs', () => {
    expect(panelOf('exigo_eos_vet')).toBe('hematology');
    expect(panelOf('mnchip_pointcare_chemistry')).toBe('chemistry');
    expect(panelOf('healvet_hv_fia_3000')).toBe('immunoassay');
    expect(panelOf('mnchip_pcr_analyzer')).toBe('pcr');
    expect(panelOf('mnchip_pointcare_pcr_v1')).toBe('pcr');
    expect(panelOf('something_new')).toBe('other');
  });
});

describe('buildLabGrid', () => {
  it('puts analytes in rows and samples in columns, newest left', () => {
    const values = [
      v({ attachmentId: 2, sampleAt: '2026-07-17T09:00:00', valueText: '18.0', valueNum: 18, flag: 'H' }),
      v({ attachmentId: 2, sampleAt: '2026-07-17T09:00:00', code: 'PLT', position: 0, valueText: '300' }),
      v({ attachmentId: 1, sampleAt: '2026-07-10T14:52:11' }),
    ];

    const grid = buildLabGrid(values, 'all');

    expect(grid.columns.map((c) => c.sampleAt)).toEqual(['2026-07-17T09:00:00', '2026-07-10T14:52:11']);
    expect(grid.rows.map((r) => r.code)).toEqual(['PLT', 'WBC']);
    const wbc = grid.rows[1];
    expect(wbc.cells[grid.columns[0].key].valueText).toBe('18.0');
    expect(wbc.cells[grid.columns[1].key].valueText).toBe('10.4');
    expect(grid.rows[0].cells[grid.columns[1].key]).toBeUndefined();
  });

  it('shares a column between two machines run the same day, but not two runs of one analyte', () => {
    const values = [
      v({ attachmentId: 3, sampleAt: '2026-07-10T16:00:00', valueText: '9.0' }),
      v({ attachmentId: 2, deviceType: 'mnchip_pointcare_chemistry', code: 'ALT', sampleAt: '2026-07-10T15:00:00' }),
      v({ attachmentId: 1, sampleAt: '2026-07-10T14:52:11' }),
    ];

    const grid = buildLabGrid(values, 'all');

    expect(grid.columns).toHaveLength(2);
    const alt = grid.rows.find((r) => r.code === 'ALT')!;
    expect(Object.keys(alt.cells)).toEqual([grid.columns[0].key]);
  });

  it('keeps one panel when filtered, and orders rows by panel then the machine order', () => {
    const values = [
      v({ attachmentId: 2, deviceType: 'mnchip_pointcare_chemistry', code: 'ALT', position: 7 }),
      v({ attachmentId: 2, deviceType: 'mnchip_pointcare_chemistry', code: 'GLU', position: 0 }),
      v({ attachmentId: 1 }),
    ];

    expect(buildLabGrid(values, 'all').rows.map((r) => r.code)).toEqual(['WBC', 'GLU', 'ALT']);
    const chemistry = buildLabGrid(values, 'chemistry');
    expect(chemistry.rows.map((r) => r.code)).toEqual(['GLU', 'ALT']);
    expect(chemistry.columns).toHaveLength(1);
  });

  it('shows the unit and range of the newest value', () => {
    const values = [
      v({ attachmentId: 2, sampleAt: '2026-07-17T09:00:00', rangeText: '5.5 - 16.9' }),
      v({ attachmentId: 1, rangeText: '6.0 - 17.0' }),
    ];

    expect(buildLabGrid(values, 'all').rows[0].rangeText).toBe('5.5 - 16.9');
  });
});

describe('trendPoints', () => {
  it('gives the numeric values of one analyte, oldest first', () => {
    const values = [
      v({ attachmentId: 3, sampleAt: '2026-07-24T09:00:00', valueText: '---', valueNum: null }),
      v({ attachmentId: 2, sampleAt: '2026-07-17T09:00:00', valueNum: 18 }),
      v({ attachmentId: 2, sampleAt: '2026-07-17T09:00:00', code: 'PLT' }),
      v({ attachmentId: 1, valueNum: 10.4 }),
    ];

    expect(trendPoints(values, analyteKey(values[0])).map((p) => p.valueNum)).toEqual([10.4, 18]);
  });
});

describe('changeFromPrevious', () => {
  it('says whether a value went up or down', () => {
    expect(changeFromPrevious(12, 10)).toBe('up');
    expect(changeFromPrevious(8, 10)).toBe('down');
    expect(changeFromPrevious(10, 10)).toBe('same');
    expect(changeFromPrevious(10, null)).toBeNull();
    expect(changeFromPrevious(undefined, 10)).toBeNull();
  });
});
