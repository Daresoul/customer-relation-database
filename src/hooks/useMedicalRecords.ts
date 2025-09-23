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
    staleTime: 1000 * 60 * 60 // Cache for 1 hour
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
  const { message } = App.useApp();

  return useMutation({
    mutationFn: (input: CreateMedicalRecordInput) =>
      MedicalService.createMedicalRecord(input),
    onSuccess: (data, variables) => {
      message.success('Medical record created successfully');
      // Invalidate the medical records list for this patient
      queryClient.invalidateQueries({
        queryKey: ['medical-records', variables.patientId]
      });
    },
    onError: (error: Error) => {
      message.error(`Failed to create medical record: ${error.message}`);
      console.error('Create medical record error:', error);
    }
  });
}

export function useUpdateMedicalRecord() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  return useMutation({
    mutationFn: ({
      recordId,
      updates
    }: {
      recordId: number;
      updates: UpdateMedicalRecordInput;
    }) => MedicalService.updateMedicalRecord(recordId, updates),
    onSuccess: (data) => {
      message.success('Medical record updated successfully');
      // Invalidate all medical records queries
      queryClient.invalidateQueries({
        queryKey: ['medical-records']
      });
      // Invalidate specific record query
      queryClient.invalidateQueries({
        queryKey: ['medical-record', data.id]
      });
    },
    onError: (error: Error) => {
      message.error(`Failed to update medical record: ${error.message}`);
      console.error('Update medical record error:', error);
    }
  });
}

export function useArchiveMedicalRecord() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  return useMutation({
    mutationFn: ({
      recordId,
      archive
    }: {
      recordId: number;
      archive: boolean;
    }) => MedicalService.archiveMedicalRecord(recordId, archive),
    onSuccess: (_, variables) => {
      message.success(
        variables.archive
          ? 'Medical record archived successfully'
          : 'Medical record restored successfully'
      );
      // Invalidate all medical records queries
      queryClient.invalidateQueries({
        queryKey: ['medical-records']
      });
    },
    onError: (error: Error) => {
      message.error(`Failed to archive medical record: ${error.message}`);
      console.error('Archive medical record error:', error);
    }
  });
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  return useMutation({
    mutationFn: ({
      medicalRecordId,
      file
    }: {
      medicalRecordId: number;
      file: File;
    }) => {
      // Validate file before uploading
      const validationError = MedicalService.validateFile(file);
      if (validationError) {
        return Promise.reject(new Error(validationError));
      }
      return MedicalService.uploadAttachment(medicalRecordId, file);
    },
    onSuccess: (data) => {
      message.success('File uploaded successfully');
      // Invalidate the specific medical record to refresh attachments
      queryClient.invalidateQueries({
        queryKey: ['medical-record', data.medicalRecordId]
      });
      // Also invalidate the list in case we're showing attachment counts
      queryClient.invalidateQueries({
        queryKey: ['medical-records']
      });
    },
    onError: (error: Error) => {
      message.error(`Failed to upload file: ${error.message}`);
      console.error('Upload attachment error:', error);
    }
  });
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  return useMutation({
    mutationFn: (attachmentId: number) =>
      MedicalService.deleteAttachment(attachmentId),
    onSuccess: () => {
      message.success('Attachment deleted successfully');
      // Invalidate medical record queries to refresh attachments
      queryClient.invalidateQueries({
        queryKey: ['medical-record']
      });
      queryClient.invalidateQueries({
        queryKey: ['medical-records']
      });
    },
    onError: (error: Error) => {
      message.error(`Failed to delete attachment: ${error.message}`);
      console.error('Delete attachment error:', error);
    }
  });
}

export function useDownloadAttachment() {
  const { message } = App.useApp();

  return useMutation({
    mutationFn: ({
      attachmentId,
      fileName
    }: {
      attachmentId: number;
      fileName: string;
    }) => MedicalService.downloadAndOpenAttachment(attachmentId, fileName),
    onSuccess: () => {
      message.success('File downloaded successfully');
    },
    onError: (error: Error) => {
      message.error(`Failed to download file: ${error.message}`);
      console.error('Download attachment error:', error);
    }
  });
}

// Batch operations hook
export function useBulkArchiveMedicalRecords() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();

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
        message.success(
          `${successCount} record(s) ${
            variables.archive ? 'archived' : 'restored'
          } successfully`
        );
      }
      if (failCount > 0) {
        message.warning(`Failed to process ${failCount} record(s)`);
      }

      // Invalidate all medical records queries
      queryClient.invalidateQueries({
        queryKey: ['medical-records']
      });
    },
    onError: (error: Error) => {
      message.error(`Bulk operation failed: ${error.message}`);
      console.error('Bulk archive error:', error);
    }
  });
}
