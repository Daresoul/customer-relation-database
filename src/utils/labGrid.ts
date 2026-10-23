import type { LabResultRow } from '../types/labResults';

export type LabPanel = 'hematology' | 'chemistry' | 'immunoassay' | 'pcr' | 'other';

export const LAB_PANELS: LabPanel[] = ['hematology', 'chemistry', 'immunoassay', 'pcr', 'other'];

export function panelOf(deviceType: string): LabPanel {
  if (deviceType === 'exigo_eos_vet') return 'hematology';
  if (deviceType.includes('pcr')) return 'pcr';
  if (deviceType.includes('pointcare')) return 'chemistry';
  if (deviceType.startsWith('healvet')) return 'immunoassay';
  return 'other';
}

export interface LabColumn {
  key: string;
  /** Sample time of the newest sample in the column. */
  sampleAt: string;
}

export interface LabGridRow {
  key: string;
  deviceType: string;
  panel: LabPanel;
  code: string;
  name: string;
  unit?: string | null;
  rangeText?: string | null;
  position: number;
  cells: Record<string, LabResultRow>;
}

export function analyteKey(value: Pick<LabResultRow, 'deviceType' | 'code'>): string {
  return `${value.deviceType}:${value.code}`;
}

const newestFirst = (a: LabResultRow, b: LabResultRow) =>
  b.sampleAt.localeCompare(a.sampleAt) || b.attachmentId - a.attachmentId;

/**
 * Analytes as rows, samples as columns (newest left). Samples from the same
 * day share a column unless they repeat an analyte, so a blood count and a
 * chemistry panel run together sit side by side.
 */
export function buildLabGrid(values: LabResultRow[], panel: LabPanel | 'all'): { columns: LabColumn[]; rows: LabGridRow[] } {
  const shown = values.filter((v) => panel === 'all' || panelOf(v.deviceType) === panel).sort(newestFirst);

  const samples = new Map<number, LabResultRow[]>();
  shown.forEach((v) => samples.set(v.attachmentId, [...(samples.get(v.attachmentId) ?? []), v]));

  const columns: (LabColumn & { analytes: Set<string> })[] = [];
  const columnOf = new Map<number, string>();
  samples.forEach((sample, attachmentId) => {
    const day = sample[0].sampleAt.slice(0, 10);
    const keys = sample.map(analyteKey);
    let column = columns.find((c) => c.sampleAt.slice(0, 10) === day && !keys.some((k) => c.analytes.has(k)));
    if (!column) {
      column = { key: `${day}#${columns.length}`, sampleAt: sample[0].sampleAt, analytes: new Set() };
      columns.push(column);
    }
    keys.forEach((k) => column!.analytes.add(k));
    columnOf.set(attachmentId, column.key);
  });

  const rows = new Map<string, LabGridRow>();
  shown.forEach((v) => {
    const key = analyteKey(v);
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        deviceType: v.deviceType,
        panel: panelOf(v.deviceType),
        code: v.code,
        name: v.name,
        unit: v.unit,
        rangeText: v.rangeText,
        position: v.position,
        cells: {},
      };
      rows.set(key, row);
    }
    const column = columnOf.get(v.attachmentId)!;
    if (!row.cells[column]) row.cells[column] = v;
  });

  const sortedRows = [...rows.values()].sort(
    (a, b) =>
      LAB_PANELS.indexOf(a.panel) - LAB_PANELS.indexOf(b.panel) ||
      a.deviceType.localeCompare(b.deviceType) ||
      a.position - b.position ||
      a.code.localeCompare(b.code),
  );
  return { columns: columns.map(({ key, sampleAt }) => ({ key, sampleAt })), rows: sortedRows };
}

/** The numeric values of one analyte, oldest first. */
export function trendPoints(values: LabResultRow[], key: string): LabResultRow[] {
  return values
    .filter((v) => analyteKey(v) === key && v.valueNum != null)
    .sort((a, b) => -newestFirst(a, b));
}

export function changeFromPrevious(current?: number | null, previous?: number | null): 'up' | 'down' | 'same' | null {
  if (current == null || previous == null) return null;
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'same';
}
