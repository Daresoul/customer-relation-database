import { createContext, useContext } from 'react';
import type { ExtractedPatientData, PatientDataConflict } from '../types/deviceImport';

export interface PendingDeviceFile {
  id: string;
  deviceType: string;
  deviceName: string;
  connectionMethod: string;
  fileName: string;
  fileData: number[]; // Array of bytes
  mimeType: string;
  testResults: Record<string, unknown>;
  patientId?: number;
  patientIdentifier?: string;
  // How the backend matched patientIdentifier; ambiguous means 2+ patients and no pick
  matchMethod?: 'microchip' | 'name' | 'none';
  matchAmbiguous?: boolean;
  detectedAt: string;
  // If known, propagate the original history file_id so backend can auto-mark processed
  sourceFileId?: string;
}

/** A file in the open import (the backend sends each sample as one result). */
export type GroupedDeviceFile = PendingDeviceFile;

export interface DeviceImportState {
  pendingFiles: PendingDeviceFile[];
  modalOpen: boolean;
  suggestedPatientId?: number;
  // Results that arrived while an import was open; each gets its own import later
  waitingResults: PendingDeviceFile[];
  // Changes whenever a new import starts, so the modal can start fresh
  importId: number;
}

export interface DeviceImportContextType extends Omit<DeviceImportState, 'waitingResults'> {
  waitingCount: number;
  // A result from a machine: opens an import, or waits behind the open one
  receiveDeviceResult: (file: PendingDeviceFile) => void;
  // The current import was saved, parked or cancelled: open the next waiting result
  finishImport: () => void;
  addDeviceFile: (file: PendingDeviceFile) => void;
  removeDeviceFile: (fileId: string) => void;
  openModal: () => void;
  closeModal: () => void;
  setSuggestedPatient: (patientId?: number) => void;
  getGroupedFiles: () => GroupedDeviceFile[];
  // Patient data extraction from device files
  getAggregatedPatientData: () => ExtractedPatientData;
  getPatientDataConflicts: () => PatientDataConflict[];
}

export const DeviceImportContext = createContext<DeviceImportContextType | undefined>(undefined);

export const useDeviceImport = (): DeviceImportContextType => {
  const context = useContext(DeviceImportContext);
  if (!context) {
    throw new Error('useDeviceImport must be used within DeviceImportProvider');
  }
  return context;
};
