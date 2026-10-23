import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { ExtractedPatientData, PatientDataConflict } from '../types/deviceImport';
import { aggregatePatientData, detectPatientDataConflicts } from '../utils/deviceDataExtraction';

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

interface DeviceImportState {
  pendingFiles: PendingDeviceFile[];
  modalOpen: boolean;
  suggestedPatientId?: number;
  // Results that arrived while an import was open; each gets its own import later
  waitingResults: PendingDeviceFile[];
  // Changes whenever a new import starts, so the modal can start fresh
  importId: number;
}

interface DeviceImportContextType extends Omit<DeviceImportState, 'waitingResults'> {
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

const DeviceImportContext = createContext<DeviceImportContextType | undefined>(undefined);

const fileKey = (file: PendingDeviceFile): string =>
  `${file.deviceName}-${file.fileName}-${file.fileData.length}`;

const startImport = (
  prev: DeviceImportState,
  file: PendingDeviceFile,
  waitingResults: PendingDeviceFile[],
): DeviceImportState => ({
  ...prev,
  pendingFiles: [file],
  waitingResults,
  modalOpen: true,
  suggestedPatientId: file.patientId,
  importId: prev.importId + 1,
});

export const DeviceImportProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<DeviceImportState>({
    pendingFiles: [],
    modalOpen: false,
    suggestedPatientId: undefined,
    waitingResults: [],
    importId: 0,
  });

  const addDeviceFile = useCallback((file: PendingDeviceFile) => {
    setState((prev) => {
      if (prev.pendingFiles.some((existing) => fileKey(existing) === fileKey(file))) {
        return prev;
      }
      const shouldOpenModal = prev.pendingFiles.length === 0;
      return {
        ...prev,
        pendingFiles: [...prev.pendingFiles, file],
        modalOpen: shouldOpenModal ? true : prev.modalOpen,
        suggestedPatientId: prev.suggestedPatientId ?? file.patientId,
        importId: shouldOpenModal ? prev.importId + 1 : prev.importId,
      };
    });
  }, []);

  const receiveDeviceResult = useCallback((file: PendingDeviceFile) => {
    setState((prev) => {
      const key = fileKey(file);
      if ([...prev.pendingFiles, ...prev.waitingResults].some((f) => fileKey(f) === key)) {
        return prev;
      }
      if (prev.modalOpen || prev.pendingFiles.length > 0) {
        return { ...prev, waitingResults: [...prev.waitingResults, file] };
      }
      return startImport(prev, file, prev.waitingResults);
    });
  }, []);

  const finishImport = useCallback(() => {
    setState((prev) => {
      const cleared = { ...prev, pendingFiles: [], suggestedPatientId: undefined };
      const [next, ...rest] = prev.waitingResults;
      if (!next) return { ...cleared, modalOpen: false };
      return startImport(cleared, next, rest);
    });
  }, []);

  const removeDeviceFile = useCallback((fileId: string) => {
    setState((prev) => ({
      ...prev,
      pendingFiles: prev.pendingFiles.filter((f) => f.id !== fileId),
    }));
  }, []);

  const getGroupedFiles = useCallback((): GroupedDeviceFile[] => state.pendingFiles, [state.pendingFiles]);

  // Get aggregated patient data from all pending files
  const getAggregatedPatientData = useCallback(
    (): ExtractedPatientData => aggregatePatientData(state.pendingFiles),
    [state.pendingFiles],
  );

  // Get conflicts in patient data across files
  const getPatientDataConflicts = useCallback(
    (): PatientDataConflict[] => detectPatientDataConflicts(state.pendingFiles),
    [state.pendingFiles],
  );

  const openModal = useCallback(() => {
    setState((prev) => ({ ...prev, modalOpen: true }));
  }, []);

  const closeModal = useCallback(() => {
    setState((prev) => ({
      ...prev,
      modalOpen: false,
    }));
  }, []);

  const setSuggestedPatient = useCallback((patientId?: number) => {
    setState((prev) => ({ ...prev, suggestedPatientId: patientId }));
  }, []);

  return (
    <DeviceImportContext.Provider
      value={{
        pendingFiles: state.pendingFiles,
        modalOpen: state.modalOpen,
        suggestedPatientId: state.suggestedPatientId,
        importId: state.importId,
        waitingCount: state.waitingResults.length,
        receiveDeviceResult,
        finishImport,
        addDeviceFile,
        removeDeviceFile,
        openModal,
        closeModal,
        setSuggestedPatient,
        getGroupedFiles,
        getAggregatedPatientData,
        getPatientDataConflicts,
      }}
    >
      {children}
    </DeviceImportContext.Provider>
  );
};

export const useDeviceImport = (): DeviceImportContextType => {
  const context = useContext(DeviceImportContext);
  if (!context) {
    throw new Error('useDeviceImport must be used within DeviceImportProvider');
  }
  return context;
};
