import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MedicalService } from '@/services/medicalService';
import { App } from 'antd';
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
    retry: 1
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

// Mutation hooks
export function useCreateMedicalRecord() {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();

  return useMutation({
    mutationFn: (input: CreateMedicalRecordInput) =>
      MedicalService.createMedicalRecord(input),
    onSuccess: (data, variables) => {
      notification.success({
        message: 'Medical Record Created',
        description: 'Medical record created successfully',
        placement: 'bottomRight',
        duration: 3,
      });
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
    onError: (error: Error) => {
      notification.error({
        message: 'Failed to Create Medical Record',
        description: `Error: ${error.message}`,
        placement: 'bottomRight',
        duration: 5,
      });
      console.error('Create medical record error:', error);
    }
  });
}

export function useUpdateMedicalRecord() {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();

  return useMutation({
    mutationFn: ({
      recordId,
      updates
    }: {
      recordId: number;
      updates: UpdateMedicalRecordInput;
    }) => MedicalService.updateMedicalRecord(recordId, updates),
    onSuccess: (data) => {
      notification.success({
        message: 'Medical record updated successfully',
        description: 'Medical record updated successfully',
        placement: 'bottomRight',
        duration: 3,
      });
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
    onError: (error: Error) => {
      notification.error({
        message: 'Error',
        description: `Failed to update medical record: ${error.message}`,
        placement: 'bottomRight',
        duration: 5,
      });
      console.error('Update medical record error:', error);
    }
  });
}

export function useArchiveMedicalRecord() {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();

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
        message: variables.archive ? 'Medical Record Archived' : 'Medical Record Restored',
        description: variables.archive
          ? 'Medical record archived successfully'
          : 'Medical record restored successfully',
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
    onError: (error: Error) => {
      notification.error({
        message: 'Error',
        description: `Failed to archive medical record: ${error.message}`,
        placement: 'bottomRight',
        duration: 5,
      });
      console.error('Archive medical record error:', error);
    }
  });
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();

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
        message: 'File uploaded successfully',
        description: 'File uploaded successfully',
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
    onError: (error: Error) => {
      notification.error({
        message: 'Error',
        description: `Failed to upload file: ${error.message}`,
        placement: 'bottomRight',
        duration: 5,
      });
      console.error('Upload attachment error:', error);
    }
  });
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();

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
        message: 'Attachment deleted successfully',
        description: 'Attachment deleted successfully',
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
    onError: (error: Error) => {
      notification.error({
        message: 'Error',
        description: `Failed to delete attachment: ${error.message}`,
        placement: 'bottomRight',
        duration: 5,
      });
      console.error('Delete attachment error:', error);
    }
  });
}

export function useDownloadAttachment() {
  const { notification } = App.useApp();

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
        message: 'File downloaded successfully',
        description: 'File downloaded successfully',
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: (error: Error) => {
      notification.error({
        message: 'Error',
        description: `Failed to download file: ${error.message}`,
        placement: 'bottomRight',
        duration: 5,
      });
      console.error('Download attachment error:', error);
    }
  });
}

// Batch operations hook
export function useBulkArchiveMedicalRecords() {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();

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
          message: 'Bulk Operation Complete',
          description: `${successCount} record(s) ${variables.archive ? 'archived' : 'restored'} successfully`,
          placement: 'bottomRight',
          duration: 3,
        });
      }
      if (failCount > 0) {
        notification.warning({
          message: 'Partial Failure',
          description: `Failed to process ${failCount} record(s)`,
          placement: 'bottomRight',
          duration: 4,
        });
      }

      // Invalidate all medical records queries
      queryClient.invalidateQueries({
        queryKey: ['medical-records']
      });
    },
    onError: (error: Error) => {
      notification.error({
        message: 'Error',
        description: `Bulk operation failed: ${error.message}`,
        placement: 'bottomRight',
        duration: 5,
      });
      console.error('Bulk archive error:', error);
    }
  });
}
