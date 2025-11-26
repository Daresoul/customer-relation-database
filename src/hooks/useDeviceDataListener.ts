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
      const listenerNumber = Math.floor(Math.random() * 10000);
      console.log(`🎧 [LISTENER-${listenerNumber}] Setting up device-data-received listener`);

      unlisten = await listen<DeviceDataPayload>('device-data-received', async (event) => {
        console.log(`📥 [LISTENER-${listenerNumber}] Received event:`, event.payload.testResults?.parameter_code);
        const data = event.payload;

        console.log('📥 Device data received:', {
          device: data.deviceName,
          fileName: data.originalFileName,
          patientId: data.patientIdentifier,
          timestamp: new Date().toISOString(),
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

              notificationRef.current.success({
                message: 'Device Data Received',
                description: `File from ${data.deviceName} - Patient auto-detected`,
                placement: 'bottomRight',
                duration: 4,
              });
            } else {
              console.log('⚠️  Patient not found for identifier:', data.patientIdentifier);

              notificationRef.current.info({
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
          notificationRef.current.info({
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
        addDeviceFileRef.current(pendingFile);

        // Set suggested patient if this is the first file with a resolved patient
        if (resolvedPatientId) {
          setSuggestedPatientRef.current(resolvedPatientId);
        }
      });

      console.log(`✅ [LISTENER-${listenerNumber}] Device-data-received listener registered`);
    };

    setupListener();

    return () => {
      if (unlisten) {
        console.log('🔌 Unregistering device-data-received listener');
        unlisten();
      }
    };
  }, []); // IMPORTANT: Empty dependency array - only set up listener ONCE
};
