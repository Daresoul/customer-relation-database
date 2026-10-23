import type { LabResultRow } from '../types/labResults';

export type LabPanel = 'hematology' | 'chemistry' | 'immunoassay' | 'pcr' | 'other';

export const LAB_PANELS: LabPanel[] = ['hematology', 'chemistry', 'immunoassay', 'pcr', 'other'];

export function panelOf(_deviceType: string): LabPanel {
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
  cells: Record<string, LabResultRow>;
}

export function buildLabGrid(_values: LabResultRow[], _panel: LabPanel | 'all'): { columns: LabColumn[]; rows: LabGridRow[] } {
  return { columns: [], rows: [] };
}

export function analyteKey(value: Pick<LabResultRow, 'deviceType' | 'code'>): string {
  return `${value.deviceType}:${value.code}`;
}

export function trendPoints(_values: LabResultRow[], _key: string): LabResultRow[] {
  return [];
}

export function changeFromPrevious(_current?: number | null, _previous?: number | null): 'up' | 'down' | 'same' | null {
  return null;
}
