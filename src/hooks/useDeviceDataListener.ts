import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api';
import { useDeviceImport, PendingDeviceFile } from '../contexts/DeviceImportContext';
import { App } from 'antd';

interface DeviceDataPayload {
  deviceType: string;
  deviceName: string;
  connectionMethod: string;
  patientIdentifier?: string;
  testResults: any;
  originalFileName: string;
  fileData: number[];
  mimeType: string;
  detectedAt: string;
}

export const useDeviceDataListener = () => {
  const { addDeviceFile, setSuggestedPatient } = useDeviceImport();
  const { notification } = App.useApp();

  // Use refs to avoid recreating the listener when these functions change
  const addDeviceFileRef = useRef(addDeviceFile);
  const setSuggestedPatientRef = useRef(setSuggestedPatient);
  const notificationRef = useRef(notification);

  // Keep refs up to date
  useEffect(() => {
    addDeviceFileRef.current = addDeviceFile;
    setSuggestedPatientRef.current = setSuggestedPatient;
    notificationRef.current = notification;
  }, [addDeviceFile, setSuggestedPatient, notification]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<DeviceDataPayload>('device-data-received', async (event) => {
        const data = event.payload;

        // Try to resolve patient if identifier is provided
        let resolvedPatientId: number | undefined;
        if (data.patientIdentifier) {
          try {
            const result = await invoke<{ id: number; name?: string | null } | null>(
              'resolve_patient_from_identifier',
              { identifier: data.patientIdentifier }
            );

            if (result) {
              resolvedPatientId = result.id;

              const who = result.name ? `: ${result.name}` : '';
              notificationRef.current.success({
                message: 'Lab result received',
                description: `${data.deviceName} — patient matched${who}`,
                placement: 'bottomRight',
                duration: 4,
              });
            } else {
              // Say WHICH identifier failed so staff know what was searched and
              // don't blindly create a duplicate patient. Longer duration — the
              // manual case needs the tech to actually act on it.
              notificationRef.current.warning({
                message: 'Lab result received',
                description: `${data.deviceName} — no patient matched "${data.patientIdentifier}". Select the patient manually.`,
                placement: 'bottomRight',
                duration: 8,
              });
            }
          } catch (_error) {
            // Silent fail - patient resolution is optional
          }
        } else {
          notificationRef.current.info({
            message: 'Lab result received',
            description: `${data.deviceName} sent a result with no patient ID. Select the patient manually.`,
            placement: 'bottomRight',
            duration: 6,
          });
        }

        // Create pending file object
        const pendingFile: PendingDeviceFile = {
          id: `${data.deviceName}-${Date.now()}-${Math.random()}`,
          deviceType: data.deviceType,
          deviceName: data.deviceName,
          connectionMethod: data.connectionMethod,
          fileName: data.originalFileName,
          fileData: data.fileData,
          mimeType: data.mimeType,
          testResults: data.testResults,
          patientId: resolvedPatientId,
          patientIdentifier: data.patientIdentifier,
          detectedAt: data.detectedAt,
        };

        // Add to context (will auto-open modal on first file)
        addDeviceFileRef.current(pendingFile);

        // Set suggested patient if this is the first file with a resolved patient
        if (resolvedPatientId) {
          setSuggestedPatientRef.current(resolvedPatientId);
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []); // IMPORTANT: Empty dependency array - only set up listener ONCE
};
