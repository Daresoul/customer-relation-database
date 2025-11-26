import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';

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

// Session grouping for devices that send multiple sequential messages
export interface DeviceSession {
  id: string;
  deviceType: string;
  deviceName: string;
  connectionMethod: string;
  patientId?: number;
  patientIdentifier?: string;
  sessionStart: string;
  lastActivity: string;
  parameters: Array<{
    code: string;
    value: string;
    unit?: string;
    receivedAt: string;
    rawData: any;
  }>;
  isComplete: boolean;
}

// Grouped file represents either a single file OR a session
export interface GroupedDeviceFile {
  id: string;
  deviceType: string;
  deviceName: string;
  connectionMethod: string;
  fileName: string;
  fileData: number[];
  mimeType: string;
  testResults: any;
  patientId?: number;
  patientIdentifier?: string;
  detectedAt: string;
  // Session metadata (only for grouped sessions)
  isSession?: boolean;
  parameterCount?: number;
  sessionInProgress?: boolean;
}

interface DeviceImportState {
  pendingFiles: PendingDeviceFile[];
  activeSessions: Map<string, DeviceSession>;
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
  getGroupedFiles: () => GroupedDeviceFile[];
}

// Session timeout: 30 seconds of inactivity
const SESSION_TIMEOUT_MS = 30000;

const DeviceImportContext = createContext<DeviceImportContextType | undefined>(undefined);

// Helper: Check if device type should use session grouping
// NOTE: Healvet data is already aggregated by Rust parser (all params in one stream ending with EE)
// So we don't need frontend session grouping - data arrives complete
const shouldGroupBySession = (deviceType: string): boolean => {
  return false; // Rust parser handles all aggregation
};

// Helper: Generate session key for grouping
const getSessionKey = (file: PendingDeviceFile): string => {
  // Group by device + patient identifier + time window
  const patientKey = file.patientIdentifier || file.patientId || 'unknown';
  return `${file.deviceType}-${patientKey}`;
};

export const DeviceImportProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<DeviceImportState>({
    pendingFiles: [],
    activeSessions: new Map(),
    modalOpen: false,
    suggestedPatientId: undefined,
  });

  const sessionTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const addDeviceFile = useCallback((file: PendingDeviceFile) => {
    setState((prev) => {
      console.log('📥 Adding device file to context:', {
        deviceName: file.deviceName,
        deviceType: file.deviceType,
        fileName: file.fileName,
        fileSize: file.fileData.length,
        mimeType: file.mimeType,
        currentPendingCount: prev.pendingFiles.length,
        shouldGroup: shouldGroupBySession(file.deviceType),
      });

      // Check if this device type should be grouped into sessions
      if (shouldGroupBySession(file.deviceType)) {
        const sessionKey = getSessionKey(file);
        const now = new Date().toISOString();

        console.log(`🔗 Session-based device detected. Session key: ${sessionKey}`);

        // Get or create session
        const newSessions = new Map(prev.activeSessions);
        let session = newSessions.get(sessionKey);

        if (!session) {
          // Create new session
          console.log(`✨ Creating new session: ${sessionKey}`);
          session = {
            id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            deviceType: file.deviceType,
            deviceName: file.deviceName,
            connectionMethod: file.connectionMethod,
            patientId: file.patientId,
            patientIdentifier: file.patientIdentifier,
            sessionStart: now,
            lastActivity: now,
            parameters: [],
            isComplete: false,
          };
        } else {
          console.log(`📝 Adding to existing session: ${sessionKey} (${session.parameters.length} parameters)`);
        }

        // Extract parameter from test results
        const paramCode = file.testResults?.parameter_code || file.testResults?.code || 'Unknown';
        const paramValue = file.testResults?.result || file.testResults?.value || '';
        const paramUnit = file.testResults?.unit || '';

        // Add parameter to session
        session.parameters.push({
          code: paramCode,
          value: paramValue,
          unit: paramUnit,
          receivedAt: now,
          rawData: file.testResults,
        });

        session.lastActivity = now;
        newSessions.set(sessionKey, session);

        console.log(`✅ Parameter added to session. Total parameters: ${session.parameters.length}`);

        // Clear existing timeout for this session
        const existingTimeout = sessionTimeoutRef.current.get(sessionKey);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }

        // Set new timeout to auto-complete session
        const timeout = setTimeout(() => {
          console.log(`⏰ Session timeout reached for ${sessionKey}. Marking complete.`);
          setState((s) => {
            const sessions = new Map(s.activeSessions);
            const timedOutSession = sessions.get(sessionKey);
            if (timedOutSession) {
              timedOutSession.isComplete = true;
              sessions.set(sessionKey, timedOutSession);
            }
            return { ...s, activeSessions: sessions };
          });
          sessionTimeoutRef.current.delete(sessionKey);
        }, SESSION_TIMEOUT_MS);

        sessionTimeoutRef.current.set(sessionKey, timeout);

        // Auto-open modal on first parameter if not already open
        const shouldOpenModal = prev.pendingFiles.length === 0 && prev.activeSessions.size === 0;

        // Set suggested patient from first parameter with patient data
        let suggestedPatientId = prev.suggestedPatientId;
        if (!suggestedPatientId && file.patientId) {
          suggestedPatientId = file.patientId;
        }

        return {
          ...prev,
          activeSessions: newSessions,
          modalOpen: shouldOpenModal ? true : prev.modalOpen,
          suggestedPatientId,
        };
      }

      // Non-session devices: use original logic
      const fileKey = `${file.deviceName}-${file.fileName}-${file.fileData.length}`;

      const isDuplicate = prev.pendingFiles.some((existing) => {
        const existingKey = `${existing.deviceName}-${existing.fileName}-${existing.fileData.length}`;
        return existingKey === fileKey;
      });

      if (isDuplicate) {
        console.log('⏭️ Skipping duplicate file in frontend:', file.fileName);
        return prev;
      }

      const updatedFiles = [...prev.pendingFiles, file];
      console.log('✅ File added to pending list. Total files:', updatedFiles.length);

      const shouldOpenModal = prev.pendingFiles.length === 0 && prev.activeSessions.size === 0;

      let suggestedPatientId = prev.suggestedPatientId;
      if (!suggestedPatientId && file.patientId) {
        suggestedPatientId = file.patientId;
      }

      return {
        ...prev,
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
    // Clear all session timeouts
    sessionTimeoutRef.current.forEach((timeout) => clearTimeout(timeout));
    sessionTimeoutRef.current.clear();

    setState((prev) => ({
      ...prev,
      pendingFiles: [],
      activeSessions: new Map(),
      suggestedPatientId: undefined,
    }));
  }, []);

  // Convert sessions to grouped files for display and backend
  const getGroupedFiles = useCallback((): GroupedDeviceFile[] => {
    const grouped: GroupedDeviceFile[] = [];

    // Add non-session files as-is
    state.pendingFiles.forEach((file) => {
      grouped.push({
        ...file,
        isSession: false,
      });
    });

    // Convert active sessions to aggregated files
    state.activeSessions.forEach((session) => {
      const patientLabel = session.patientIdentifier || session.patientId || 'Unknown';

      // Convert parameters array to flat HashMap (for PDF generation)
      const testResults: Record<string, string> = {};
      session.parameters.forEach(param => {
        if (param.code && param.value) {
          testResults[param.code] = param.value;
        }
      });

      // Session metadata for JSON file storage
      const sessionData = {
        sessionId: session.id,
        deviceType: session.deviceType,
        deviceName: session.deviceName,
        patientId: session.patientId,
        patientIdentifier: session.patientIdentifier,
        sessionStart: session.sessionStart,
        sessionEnd: session.lastActivity,
        parameterCount: session.parameters.length,
        parameters: session.parameters,
      };

      const jsonString = JSON.stringify(sessionData, null, 2);
      const fileData = Array.from(new TextEncoder().encode(jsonString));

      grouped.push({
        id: session.id,
        deviceType: session.deviceType,
        deviceName: session.deviceName,
        connectionMethod: session.connectionMethod,
        fileName: `${session.deviceName} - Chemistry Panel - ${patientLabel}.json`,
        fileData,
        mimeType: 'application/json',
        testResults: testResults,  // Use flat HashMap instead of sessionData
        patientId: session.patientId,
        patientIdentifier: session.patientIdentifier,
        detectedAt: session.sessionStart,
        isSession: true,
        parameterCount: session.parameters.length,
        sessionInProgress: !session.isComplete,
      });
    });

    return grouped;
  }, [state.pendingFiles, state.activeSessions]);

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

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      sessionTimeoutRef.current.forEach((timeout) => clearTimeout(timeout));
      sessionTimeoutRef.current.clear();
    };
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
        getGroupedFiles,
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
