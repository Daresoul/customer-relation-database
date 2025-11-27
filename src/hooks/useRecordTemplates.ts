import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { TemplateService } from '@/services/templateService';
import type {
  RecordTemplate,
  CreateRecordTemplateInput,
  UpdateRecordTemplateInput,
  RecordType,
} from '@/types/medical';

// Query hooks
export function useRecordTemplates(recordType?: RecordType) {
  return useQuery({
    queryKey: ['record-templates', recordType],
    queryFn: () => TemplateService.getRecordTemplates(recordType),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes - templates don't change frequently
    retry: 1,
  });
}

export function useSearchRecordTemplates(searchTerm: string, recordType?: RecordType) {
  return useQuery({
    queryKey: ['record-templates-search', searchTerm, recordType],
    queryFn: () => TemplateService.searchRecordTemplates(searchTerm, recordType),
    enabled: searchTerm.trim().length >= 2, // Minimum 2 characters for search
    staleTime: 30 * 1000, // Cache search results for 30 seconds
    retry: 1,
  });
}

// Mutation hooks
export function useCreateRecordTemplate() {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();

  return useMutation({
    mutationFn: (input: CreateRecordTemplateInput) =>
      TemplateService.createRecordTemplate(input),
    onSuccess: () => {
      notification.success({
        message: 'Template Created',
        description: 'Record template created successfully',
        placement: 'bottomRight',
        duration: 3,
      });
      // Invalidate all template list queries (with any record type filter)
      queryClient.invalidateQueries({
        queryKey: ['record-templates'],
        exact: false,
      });
      // Also invalidate search queries
      queryClient.invalidateQueries({
        queryKey: ['record-templates-search'],
        exact: false,
      });
    },
    onError: (error: Error) => {
      notification.error({
        message: 'Failed to Create Template',
        description: `Error: ${error.message}`,
        placement: 'bottomRight',
        duration: 5,
      });
      console.error('Create template error:', error);
    },
  });
}

export function useUpdateRecordTemplate() {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();

  return useMutation({
    mutationFn: ({
      templateId,
      input,
    }: {
      templateId: number;
      input: UpdateRecordTemplateInput;
    }) => TemplateService.updateRecordTemplate(templateId, input),
    onSuccess: () => {
      notification.success({
        message: 'Template Updated',
        description: 'Record template updated successfully',
        placement: 'bottomRight',
        duration: 3,
      });
      // Invalidate all template list queries (with any record type filter)
      queryClient.invalidateQueries({
        queryKey: ['record-templates'],
        exact: false,
      });
      // Also invalidate search queries
      queryClient.invalidateQueries({
        queryKey: ['record-templates-search'],
        exact: false,
      });
    },
    onError: (error: Error) => {
      notification.error({
        message: 'Failed to Update Template',
        description: `Error: ${error.message}`,
        placement: 'bottomRight',
        duration: 5,
      });
      console.error('Update template error:', error);
    },
  });
}

export function useDeleteRecordTemplate() {
  const queryClient = useQueryClient();
  const { notification } = App.useApp();

  return useMutation({
    mutationFn: (templateId: number) => TemplateService.deleteRecordTemplate(templateId),
    onSuccess: () => {
      notification.success({
        message: 'Template Deleted',
        description: 'Record template deleted successfully',
        placement: 'bottomRight',
        duration: 3,
      });
      // Invalidate all template list queries (with any record type filter)
      queryClient.invalidateQueries({
        queryKey: ['record-templates'],
        exact: false,
      });
      // Also invalidate search queries
      queryClient.invalidateQueries({
        queryKey: ['record-templates-search'],
        exact: false,
      });
    },
    onError: (error: Error) => {
      notification.error({
        message: 'Failed to Delete Template',
        description: `Error: ${error.message}`,
        placement: 'bottomRight',
        duration: 5,
      });
      console.error('Delete template error:', error);
    },
  });
}
