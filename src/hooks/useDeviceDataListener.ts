import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@/services/invoke';
import { useTranslation } from 'react-i18next';
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
  // Saved file-history id, when the backend stored the file before emitting
  fileId?: number | string;
}

interface PatientMatch {
  patient: { id: number; name?: string | null } | null;
  method: 'microchip' | 'name' | 'none';
  ambiguous: boolean;
  candidateCount: number;
}

export const useDeviceDataListener = () => {
  const { receiveDeviceResult } = useDeviceImport();
  const { notification } = App.useApp();
  const { t } = useTranslation(['medical']);

  // Use refs to avoid recreating the listener when these functions change
  const receiveRef = useRef(receiveDeviceResult);
  const notificationRef = useRef(notification);
  const tRef = useRef(t);

  // Keep refs up to date
  useEffect(() => {
    receiveRef.current = receiveDeviceResult;
    notificationRef.current = notification;
    tRef.current = t;
  }, [receiveDeviceResult, notification, t]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<DeviceDataPayload>('device-data-received', async (event) => {
        const data = event.payload;
        const t = tRef.current;
        const toast = notificationRef.current;
        const device = data.deviceName;
        const identifier = data.patientIdentifier;
        const message = t('medical:deviceImport.received', 'Lab result received');

        let match: PatientMatch | undefined;
        if (identifier) {
          try {
            match = await invoke<PatientMatch>('resolve_patient_from_identifier', { identifier });
          } catch (_error) {
            toast.warning({
              message,
              description: t('medical:deviceImport.lookupFailed', {
                defaultValue: '{{device}} — could not look up patient "{{identifier}}". Select the patient manually.',
                device,
                identifier,
              }),
              placement: 'bottomRight',
              duration: 8,
            });
          }
        }

        const resolvedPatientId = match?.patient && !match.ambiguous ? match.patient.id : undefined;
        const who = match?.patient?.name ?? '';

        if (!identifier) {
          toast.info({
            message,
            description: t('medical:deviceImport.receivedNoId', {
              defaultValue: '{{device}} sent a result with no patient ID. Select the patient manually.',
              device,
            }),
            placement: 'bottomRight',
            duration: 6,
          });
        } else if (match && resolvedPatientId && match.method === 'microchip') {
          toast.success({
            message,
            description: t('medical:deviceImport.receivedChipMatch', {
              defaultValue: '{{device}} — patient matched by microchip: {{who}}',
              device,
              who,
            }),
            placement: 'bottomRight',
            duration: 4,
          });
        } else if (match && resolvedPatientId && match.method === 'name') {
          toast.warning({
            message: t('medical:deviceImport.receivedVerify', 'Lab result received — verify patient'),
            description: t('medical:deviceImport.receivedNameMatch', {
              defaultValue: '{{device}} — matched by name "{{who}}". Please confirm it\'s the right patient before saving.',
              device,
              who,
            }),
            placement: 'bottomRight',
            duration: 8,
          });
        } else if (match?.ambiguous) {
          toast.warning({
            message: t('medical:deviceImport.receivedSelect', 'Lab result received — select patient'),
            description: t('medical:deviceImport.receivedAmbiguous', {
              defaultValue: '{{device}} — {{n}} patients match "{{identifier}}". Select the correct patient manually.',
              device,
              n: match.candidateCount,
              identifier,
            }),
            placement: 'bottomRight',
            duration: 8,
          });
        } else if (match) {
          toast.warning({
            message,
            description: t('medical:deviceImport.receivedNoMatch', {
              defaultValue: '{{device}} — no patient matched "{{identifier}}". Select the patient manually.',
              device,
              identifier,
            }),
            placement: 'bottomRight',
            duration: 8,
          });
        }

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
          patientIdentifier: identifier,
          matchMethod: match?.method,
          matchAmbiguous: match?.ambiguous,
          detectedAt: data.detectedAt,
          sourceFileId: data.fileId != null ? String(data.fileId) : undefined,
        };

        // Opens an import, or waits behind the one that is open
        receiveRef.current(pendingFile);
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
