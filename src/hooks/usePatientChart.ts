/**
 * Patient chart writes: weight log, alerts, deceased / inactive status.
 * Each reports success only after the backend confirms, with one message,
 * and refreshes every reader of patient data.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { PatientService } from '../services/patientService';
import { createMutationErrorHandler, extractErrorMessage, type MutationOperation, type TFunction } from '../utils/errors';
import { invalidatePatientData } from './invalidation';

const CHART_ERRORS: Record<string, string> = {
  DECEASED_DATE_IN_FUTURE: 'patients:chart.errors.deceasedDateInFuture',
  PATIENT_DECEASED: 'patients:chart.errors.patientDeceased',
  INVALID_WEIGHT: 'patients:chart.errors.invalidWeight',
  ALERT_NOTE_TOO_LONG: 'patients:chart.errors.alertNoteTooLong',
};

type Notify = ReturnType<typeof App.useApp>['notification'];

function chartErrorHandler(notification: Notify, operation: MutationOperation, t: TFunction) {
  return (error: unknown) => {
    const message = extractErrorMessage(error);
    const code = Object.keys(CHART_ERRORS).find((c) => message.startsWith(c));
    if (!code) {
      createMutationErrorHandler(notification, operation, t, 'usePatientChart')(error);
      return;
    }
    notification.error({
      message: t('errors:failedTo', { operation: t(`errors:operations.${operation}`) }),
      description: t(CHART_ERRORS[code]),
      placement: 'bottomRight',
      duration: 6,
    });
  };
}

export const patientWeightsKey = (patientId: number) => ['patient-weights', patientId];

export function usePatientWeights(patientId: number) {
  return useQuery({
    queryKey: patientWeightsKey(patientId),
    queryFn: () => PatientService.getWeights(patientId),
    enabled: patientId > 0,
  });
}

function useChartMutation<V, R>(
  operation: MutationOperation,
  mutationFn: (vars: V) => Promise<R>,
  successText: (vars: V) => string,
) {
  const queryClient = useQueryClient();
  const { notification, message } = App.useApp();
  const { t } = useTranslation(['patients', 'errors']);
  return useMutation({
    mutationFn,
    onSuccess: (_result, vars) => {
      invalidatePatientData(queryClient);
      message.success(successText(vars));
    },
    onError: chartErrorHandler(notification, operation, t as TFunction),
  });
}

export function useAddWeight() {
  const { t } = useTranslation('patients');
  return useChartMutation(
    'addPatientWeight',
    (v: { patientId: number; weight: number; measuredOn: string; medicalRecordId?: number | null }) =>
      PatientService.addWeight(v.patientId, v.weight, v.measuredOn, v.medicalRecordId ?? null),
    () => t('patients:chart.weights.added'),
  );
}

export function useDeleteWeight() {
  const { t } = useTranslation('patients');
  return useChartMutation(
    'deletePatientWeight',
    (v: { id: number }) => PatientService.deleteWeight(v.id),
    () => t('patients:chart.weights.removed'),
  );
}

export function useSaveAlert() {
  const { t } = useTranslation('patients');
  return useChartMutation(
    'savePatientAlert',
    (v: { patientId: number; alertId?: number; alertType: string; note: string | null }) =>
      v.alertId
        ? PatientService.updateAlert(v.alertId, v.alertType, v.note)
        : PatientService.addAlert(v.patientId, v.alertType, v.note),
    (v) => (v.alertId ? t('patients:chart.alerts.updated') : t('patients:chart.alerts.added')),
  );
}

export function useDeleteAlert() {
  const { t } = useTranslation('patients');
  return useChartMutation(
    'deletePatientAlert',
    (v: { id: number }) => PatientService.deleteAlert(v.id),
    () => t('patients:chart.alerts.removed'),
  );
}

export function useMarkDeceased() {
  const { t } = useTranslation('patients');
  return useChartMutation(
    'markPatientDeceased',
    (v: { id: number; name: string; deceasedOn: string; note: string | null }) =>
      PatientService.markDeceased(v.id, v.deceasedOn, v.note),
    (v) => t('patients:chart.deceased.done', { name: v.name }),
  );
}

export function useMarkInactive() {
  const { t } = useTranslation('patients');
  return useChartMutation(
    'markPatientInactive',
    (v: { id: number; name: string; reason: string | null }) => PatientService.markInactive(v.id, v.reason),
    (v) => t('patients:chart.inactive.done', { name: v.name }),
  );
}

export function useReactivatePatient() {
  const { t } = useTranslation('patients');
  return useChartMutation(
    'reactivatePatient',
    (v: { id: number; name: string }) => PatientService.reactivate(v.id),
    (v) => t('patients:chart.reactivate.done', { name: v.name }),
  );
}
