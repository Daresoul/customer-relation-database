import React, { useEffect, useState } from 'react';
import { App, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import MedicalRecordForm from './MedicalRecordForm';
import { useCreateMedicalRecord, useUploadAttachment } from '@/hooks/useMedicalRecords';
import type { CreateMedicalRecordInput, UpdateMedicalRecordInput, DeviceDataInput } from '@/types/medical';
import { invoke } from '@/services/invoke';
import { useQueryClient } from '@tanstack/react-query';
import { DIAGNOSES_KEYS } from '@/hooks/useDiagnoses';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import dayjs from 'dayjs';
import { PatientService } from '@/services/patientService';
import { labInboxService } from '@/services/labInboxService';
import { invalidatePatientData, invalidateLabInboxData } from '@/hooks/invalidation';

interface MedicalRecordModalProps {
  open: boolean;
  onClose: () => void;
  patientId: number;
  patientName: string;
  /** Always null: the modal only creates records; edits happen on the record page. */
  recordId?: number | null;
  /** New records only: a starting title, e.g. the appointment's reason. */
  defaultTitle?: string;
}

const MedicalRecordModal: React.FC<MedicalRecordModalProps> = ({
  open,
  onClose,
  patientId,
  patientName,
  defaultTitle,
}) => {
  const { t } = useTranslation('medical');
  const { notification } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) setDirty(false);
  }, [open]);

  // Closing (X, Esc or Cancel) or leaving the page with typed text asks first.
  const confirmLeave = useUnsavedChangesGuard(open && dirty);
  const requestClose = () =>
    confirmLeave(() => {
      setDirty(false);
      onClose();
    });
  const navigate = useNavigate();
  const createMutation = useCreateMedicalRecord({
    onOpenRecord: (id) => navigate(`/medical-records/${id}`),
  });
  const uploadMutation = useUploadAttachment();
  const queryClient = useQueryClient();

  const title = `${t('form.createTitle')} - ${patientName}`;

  /**
   * A recent device file goes on as a lab result with its device type, the
   * way the record page's Recent files Add does it; one that can't (a result
   * that could not be read) and any other file is uploaded as a plain file.
   * Every file is tried; the ones that failed are named.
   */
  const addFiles = async (recordId: number, files: File[], fileSourceIds?: Map<string, string>) => {
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const sourceFileId = fileSourceIds?.get(file.name);
        if (sourceFileId) {
          try {
            await labInboxService.attach(sourceFileId, recordId);
            return;
          } catch (labError) {
            console.warn('Not attached as a lab result, uploading as a file:', labError);
          }
        }
        await uploadMutation.mutateAsync({ medicalRecordId: recordId, file, sourceFileId });
      }),
    );
    if (fileSourceIds && fileSourceIds.size > 0) invalidateLabInboxData(queryClient);
    const failed = files.filter((_, i) => results[i].status === 'rejected');
    if (failed.length > 0) {
      results.forEach((r) => r.status === 'rejected' && console.error('Upload error:', r.reason));
      notification.error({
        message: t('common:error'),
        description: t('messages.uploadFailedFiles', { names: failed.map((f) => f.name).join(', ') }),
        placement: 'bottomRight',
        duration: 0,
      });
    } else {
      notification.success({
        message: t('common:success'),
        description: t('messages.uploadSuccess'),
        placement: 'bottomRight',
        duration: 3,
      });
    }
  };

  const handleSubmit = async (
    values: CreateMedicalRecordInput | UpdateMedicalRecordInput,
    files?: File[],
    fileSourceIds?: Map<string, string>,
    deviceDataList?: DeviceDataInput[],
    diagnosisIds?: number[],
    visitWeight?: number,
  ) => {
    setLoading(true);
    try {
      // Create the medical record first (include deviceDataList for PDF generation)
      const result = await createMutation.mutateAsync({
        ...values as CreateMedicalRecordInput,
        patientId,
        deviceDataList: deviceDataList,
      });
      const savedRecordId: number | null = result ? result.id : null;

      if (files && files.length > 0 && savedRecordId != null) {
        await addFiles(savedRecordId, files, fileSourceIds);
      }

      // Persist the diagnosis tag set as a separate step. set_diagnoses_for_record
      // takes the full intended set and replaces what's currently linked in
      // medical_record_diagnoses — works the same for create (was empty) and
      // edit (replaces whatever was there). Pass an empty array to clear all
      // tags from a record. Only run when we have a confirmed recordId.
      //
      // Wrapped in its own try/catch so a tag-save failure surfaces as a
      // soft error notification without aborting the modal close — the
      // record itself is already saved successfully at this point.
      if (savedRecordId != null && diagnosisIds !== undefined) {
        try {
          await invoke('set_diagnoses_for_record', {
            medicalRecordId: savedRecordId,
            diagnosisIds,
          });
          // Tell React Query the per-record diagnosis cache is stale
          // so the detail modal and dashboard cards re-fetch and show
          // the new tag set on next render — otherwise the user would
          // see their just-saved tags only after a hard refresh.
          await queryClient.invalidateQueries({
            queryKey: DIAGNOSES_KEYS.forRecord(savedRecordId),
          });
          // Also invalidate the patient-level aggregation — the
          // overview tab's `<DiagnosisTagList patientId={...} />`
          // is a DISTINCT join across every medical record for the
          // patient, so any record's tag-set change can shift that
          // set. Without this invalidation the overview card stayed
          // empty / stale after creating the first tagged record.
          await queryClient.invalidateQueries({
            queryKey: DIAGNOSES_KEYS.forPatient(patientId),
          });
        } catch (tagErr) {
          console.error('Failed to save diagnosis tags:', tagErr);
          // Promoted from `warning` to `error` — the user kept clicking
          // save, seeing the medical record success notification, and
          // then wondering why no tags appeared. A red notification is
          // much harder to miss than a yellow one.
          notification.error({
            message: t('messages.diagnosesPartialSave', 'Diagnoses not saved'),
            description: String(tagErr),
            placement: 'bottomRight',
            duration: 8,
          });
        }
      }
      if (savedRecordId != null && visitWeight) {
        try {
          await PatientService.addWeight(patientId, visitWeight, dayjs().format('YYYY-MM-DD'), savedRecordId);
          invalidatePatientData(queryClient);
        } catch (weightErr) {
          console.error('Failed to add the visit weight:', weightErr);
          notification.error({
            message: t('common:error'),
            description: t('patients:chart.weights.recordSaveFailed'),
            placement: 'bottomRight',
            duration: 8,
          });
        }
      }
      onClose();
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={requestClose}
      maskClosable={false}
      footer={null}
      width={800}
      destroyOnHidden
    >
      <MedicalRecordForm
        onSubmit={handleSubmit}
        onCancel={requestClose}
        onDirtyChange={setDirty}
        loading={loading}
        isEdit={false}
        patientId={patientId}
        recordId={null}
        defaultTitle={defaultTitle}
      />
    </Modal>
  );
};

export default MedicalRecordModal;
