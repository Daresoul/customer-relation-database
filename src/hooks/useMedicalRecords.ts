import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MedicalService } from '@/services/medicalService';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { createMutationErrorHandler } from '@/utils/errors';
import { useDocumentStatusNotice, type SavedRecordDocuments } from './useDocumentStatusNotice';
import type {
  MedicalRecordFilter,
  UpdateMedicalRecordInput,
  CreateMedicalRecordInput,
  PaginationParams
} from '@/types/medical';

// Query hooks
export function useMedicalRecords(
  patientId: number,
  filter?: MedicalRecordFilter,
  pagination?: PaginationParams
) {
  return useQuery({
    queryKey: ['medical-records', patientId, filter, pagination],
    queryFn: () => MedicalService.getMedicalRecords(patientId, filter, pagination),
    enabled: !!patientId,
    retry: 1,
    // Keep the shown records while "load more" or a filter change fetches,
    // but never carry one patient's records onto another patient's page.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === patientId ? previous : undefined,
  });
}

export function useMedicalRecord(recordId: number, includeHistory = false) {
  return useQuery({
    queryKey: ['medical-record', recordId, includeHistory],
    queryFn: () => MedicalService.getMedicalRecord(recordId, includeHistory),
    enabled: !!recordId,
    retry: 1,
    retryDelay: 750,
  });
}

export function useCurrencies() {
  return useQuery({
    queryKey: ['currencies'],
    queryFn: () => MedicalService.getCurrencies(),
    staleTime: 5 * 60 * 1000 // Cache for 5 minutes
  });
}

export function useSearchMedicalRecords(
  patientId: number,
  searchTerm: string,
  includeArchived = false
) {
  return useQuery({
    queryKey: ['medical-records-search', patientId, searchTerm, includeArchived],
    queryFn: () => MedicalService.searchMedicalRecords(patientId, searchTerm, includeArchived),
    enabled: !!patientId && searchTerm.length >= 2 // Minimum 2 characters for search
  });
}

/** Lets a caller that opened the record form see which record it created (the appointment panel links it). */
export const CREATE_RECORD_MUTATION_KEY = ['medical-records', 'create'] as const;

// Mutation hooks
export function useCreateMedicalRecord(options: { onOpenRecord?: (recordId: number) => void } = {}) {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const reportDocuments = useDocumentStatusNotice();

  return useMutation({
    mutationKey: CREATE_RECORD_MUTATION_KEY,
    mutationFn: (input: CreateMedicalRecordInput) =>
      MedicalService.createMedicalRecord(input),
    onSuccess: (data, variables) => {
      reportDocuments(data as SavedRecordDocuments, t('medical:messages.createSuccess'), options.onOpenRecord);
      // Invalidate ALL medical records queries for this patient (regardless of filters)
      queryClient.invalidateQueries({
        queryKey: ['medical-records', variables.patientId],
        exact: false, // Match any query starting with ['medical-records', patientId]
      });
      // Also invalidate search queries
      queryClient.invalidateQueries({
        queryKey: ['medical-records-search', variables.patientId],
        exact: false,
      });
    },
    onError: createMutationErrorHandler(notification, 'createMedicalRecord', t, 'useMedicalRecords'),
  });
}

export function useUpdateMedicalRecord() {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');
  const reportDocuments = useDocumentStatusNotice();

  return useMutation({
    mutationFn: ({
      recordId,
      updates
    }: {
      recordId: number;
      updates: UpdateMedicalRecordInput;
    }) => MedicalService.updateMedicalRecord(recordId, updates),
    onSuccess: (data) => {
      reportDocuments(data as SavedRecordDocuments, t('medical:messages.updateSuccess'));
      // Invalidate medical records list for this patient (with any filters)
      queryClient.invalidateQueries({
        queryKey: ['medical-records', data.patientId],
        exact: false,
      });
      // Invalidate search queries for this patient
      queryClient.invalidateQueries({
        queryKey: ['medical-records-search', data.patientId],
        exact: false,
      });
      // Invalidate specific record query
      queryClient.invalidateQueries({
        queryKey: ['medical-record', data.id],
      });
    },
    onError: createMutationErrorHandler(notification, 'updateMedicalRecord', t, 'useMedicalRecords'),
  });
}

export function useArchiveMedicalRecord() {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');

  return useMutation({
    mutationFn: ({
      recordId,
      archive,
      patientId
    }: {
      recordId: number;
      archive: boolean;
      patientId: number;
    }) => MedicalService.archiveMedicalRecord(recordId, archive),
    onSuccess: (_, variables) => {
      notification.success({
        message: variables.archive ? t('medical:messages.archivedTitle') : t('medical:messages.restoredTitle'),
        description: variables.archive
          ? t('medical:messages.archiveSuccess')
          : t('medical:messages.restoreSuccess'),
        placement: 'bottomRight',
        duration: 3,
      });
      // Invalidate medical records list for this patient (with any filters)
      queryClient.invalidateQueries({
        queryKey: ['medical-records', variables.patientId],
        exact: false,
      });
      // Invalidate search queries
      queryClient.invalidateQueries({
        queryKey: ['medical-records-search', variables.patientId],
        exact: false,
      });
      // Invalidate specific record
      queryClient.invalidateQueries({
        queryKey: ['medical-record', variables.recordId],
      });
    },
    onError: createMutationErrorHandler(notification, 'archiveMedicalRecord', t, 'useMedicalRecords'),
  });
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');

  return useMutation({
    mutationFn: ({
      medicalRecordId,
      file,
      deviceType,
      deviceName,
      connectionMethod,
      attachmentType,
      sourceFileId
    }: {
      medicalRecordId: number;
      file: File;
      deviceType?: string;
      deviceName?: string;
      connectionMethod?: string;
      attachmentType?: 'file' | 'test_result' | 'generated_pdf';
      sourceFileId?: string;
    }) => {
      // Validate file before uploading
      const validationError = MedicalService.validateFile(file);
      if (validationError) {
        return Promise.reject(new Error(validationError));
      }
      return MedicalService.uploadAttachment(medicalRecordId, file, deviceType, deviceName, connectionMethod, attachmentType, sourceFileId);
    },
    onSuccess: (data, variables) => {
      notification.success({
        message: t('medical:messages.uploadSuccess'),
        description: t('medical:messages.uploadSuccess'),
        placement: 'bottomRight',
        duration: 3,
      });
      // Invalidate the specific medical record to refresh attachments
      queryClient.invalidateQueries({
        queryKey: ['medical-record', variables.medicalRecordId],
      });
      // Invalidate all list queries for this record's patient
      // Note: We don't have patientId here, so use partial match on medical-records
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return key[0] === 'medical-records';
        },
      });
    },
    onError: createMutationErrorHandler(notification, 'uploadFile', t, 'useMedicalRecords'),
  });
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');

  return useMutation({
    mutationFn: ({
      attachmentId,
      medicalRecordId
    }: {
      attachmentId: number;
      medicalRecordId: number;
    }) => MedicalService.deleteAttachment(attachmentId),
    onSuccess: (_, variables) => {
      notification.success({
        message: t('medical:messages.attachmentDeleteSuccess'),
        description: t('medical:messages.attachmentDeleteSuccess'),
        placement: 'bottomRight',
        duration: 3,
      });
      // Invalidate specific medical record query
      queryClient.invalidateQueries({
        queryKey: ['medical-record', variables.medicalRecordId],
      });
      // Invalidate list queries (for attachment count updates)
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return key[0] === 'medical-records';
        },
      });
    },
    onError: createMutationErrorHandler(notification, 'deleteAttachment', t, 'useMedicalRecords'),
  });
}

export function useDownloadAttachment() {
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');

  return useMutation({
    mutationFn: ({
      attachmentId,
      fileName
    }: {
      attachmentId: number;
      fileName: string;
    }) => MedicalService.downloadAndOpenAttachment(attachmentId, fileName),
    onSuccess: () => {
      notification.success({
        message: t('medical:messages.downloadSuccess'),
        description: t('medical:messages.downloadSuccess'),
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'downloadFile', t, 'useMedicalRecords'),
  });
}

// Batch operations hook
export function useBulkArchiveMedicalRecords() {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();
  const { t } = useTranslation('errors');

  return useMutation({
    mutationFn: async ({
      recordIds,
      archive
    }: {
      recordIds: number[];
      archive: boolean;
    }) => {
      // Archive each record sequentially
      const results = [];
      for (const recordId of recordIds) {
        try {
          await MedicalService.archiveMedicalRecord(recordId, archive);
          results.push({ recordId, success: true });
        } catch (error) {
          results.push({ recordId, success: false, error });
        }
      }
      return results;
    },
    onSuccess: (results, variables) => {
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      if (successCount > 0) {
        notification.success({
          message: t('medical:messages.bulkComplete'),
          description: variables.archive
            ? t('medical:messages.bulkArchived', { count: successCount })
            : t('medical:messages.bulkRestored', { count: successCount }),
          placement: 'bottomRight',
          duration: 3,
        });
      }
      if (failCount > 0) {
        notification.warning({
          message: t('medical:messages.partialFailure'),
          description: t('medical:messages.bulkFailed', { count: failCount }),
          placement: 'bottomRight',
          duration: 4,
        });
      }

      // Invalidate all medical records queries
      queryClient.invalidateQueries({
        queryKey: ['medical-records']
      });
    },
    onError: createMutationErrorHandler(notification, 'bulkArchive', t, 'useMedicalRecords'),
  });
}
