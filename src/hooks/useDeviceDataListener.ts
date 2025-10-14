import { useEffect } from 'react';
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

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<DeviceDataPayload>('device-data-received', async (event) => {
        const data = event.payload;

        console.log('📥 Device data received:', {
          device: data.deviceName,
          fileName: data.originalFileName,
          patientId: data.patientIdentifier,
        });

        // Try to resolve patient if identifier is provided
        let resolvedPatientId: number | undefined;
        if (data.patientIdentifier) {
          try {
            const result = await invoke<{ id: number } | null>(
              'resolve_patient_from_identifier',
              { identifier: data.patientIdentifier }
            );

            if (result) {
              resolvedPatientId = result.id;
              console.log('✅ Patient resolved:', result);

              notification.success({
                message: 'Device Data Received',
                description: `File from ${data.deviceName} - Patient auto-detected`,
                placement: 'bottomRight',
                duration: 4,
              });
            } else {
              console.log('⚠️  Patient not found for identifier:', data.patientIdentifier);

              notification.info({
                message: 'Device Data Received',
                description: `File from ${data.deviceName} - Please select patient manually`,
                placement: 'bottomRight',
                duration: 4,
              });
            }
          } catch (error) {
            console.error('Failed to resolve patient:', error);
          }
        } else {
          notification.info({
            message: 'Device Data Received',
            description: `File from ${data.deviceName} - Please select patient`,
            placement: 'bottomRight',
            duration: 4,
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
        addDeviceFile(pendingFile);

        // Set suggested patient if this is the first file with a resolved patient
        if (resolvedPatientId) {
          setSuggestedPatient(resolvedPatientId);
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [addDeviceFile, setSuggestedPatient, notification]);
};
