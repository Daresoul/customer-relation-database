import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface PendingDeviceFile {
  id: string;
  deviceType: string;
  deviceName: string;
  connectionMethod: string;
  fileName: string;
  fileData: number[]; // Array of bytes
  mimeType: string;
  testResults: any;
  patientId?: number;
  patientIdentifier?: string;
  detectedAt: string;
}

interface DeviceImportState {
  pendingFiles: PendingDeviceFile[];
  modalOpen: boolean;
  suggestedPatientId?: number;
}

interface DeviceImportContextType extends DeviceImportState {
  addDeviceFile: (file: PendingDeviceFile) => void;
  removeDeviceFile: (fileId: string) => void;
  clearAllFiles: () => void;
  openModal: () => void;
  closeModal: () => void;
  setSuggestedPatient: (patientId?: number) => void;
}

const DeviceImportContext = createContext<DeviceImportContextType | undefined>(undefined);

export const DeviceImportProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<DeviceImportState>({
    pendingFiles: [],
    modalOpen: false,
    suggestedPatientId: undefined,
  });

  const addDeviceFile = useCallback((file: PendingDeviceFile) => {
    setState((prev) => {
      console.log('📥 Adding device file to context:', {
        deviceName: file.deviceName,
        fileName: file.fileName,
        fileSize: file.fileData.length,
        mimeType: file.mimeType,
        currentPendingCount: prev.pendingFiles.length,
      });

      // Create a unique key based on filename, device, and file size
      const fileKey = `${file.deviceName}-${file.fileName}-${file.fileData.length}`;

      // Check for duplicate files by comparing file key
      const isDuplicate = prev.pendingFiles.some((existing) => {
        const existingKey = `${existing.deviceName}-${existing.fileName}-${existing.fileData.length}`;
        console.log('   Comparing with existing:', {
          existingKey,
          newKey: fileKey,
          match: existingKey === fileKey,
        });
        return existingKey === fileKey;
      });

      if (isDuplicate) {
        console.log('⏭️ Skipping duplicate file in frontend:', file.fileName);
        return prev; // Don't add duplicate
      }

      const updatedFiles = [...prev.pendingFiles, file];

      console.log('✅ File added to pending list. Total files:', updatedFiles.length);

      // Auto-open modal on first file if not already open
      const shouldOpenModal = prev.pendingFiles.length === 0;

      // Set suggested patient from first file with patient data
      let suggestedPatientId = prev.suggestedPatientId;
      if (!suggestedPatientId && file.patientId) {
        suggestedPatientId = file.patientId;
      }

      return {
        pendingFiles: updatedFiles,
        modalOpen: shouldOpenModal ? true : prev.modalOpen,
        suggestedPatientId,
      };
    });
  }, []);

  const removeDeviceFile = useCallback((fileId: string) => {
    setState((prev) => ({
      ...prev,
      pendingFiles: prev.pendingFiles.filter((f) => f.id !== fileId),
    }));
  }, []);

  const clearAllFiles = useCallback(() => {
    setState((prev) => ({
      ...prev,
      pendingFiles: [],
      suggestedPatientId: undefined,
    }));
  }, []);

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
        ...state,
        addDeviceFile,
        removeDeviceFile,
        clearAllFiles,
        openModal,
        closeModal,
        setSuggestedPatient,
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
