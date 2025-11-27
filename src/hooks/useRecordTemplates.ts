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
  });
}

export function useSearchRecordTemplates(searchTerm: string, recordType?: RecordType) {
  return useQuery({
    queryKey: ['record-templates-search', searchTerm, recordType],
    queryFn: () => TemplateService.searchRecordTemplates(searchTerm, recordType),
    enabled: searchTerm.length >= 2, // Minimum 2 characters for search
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
      // Invalidate all template queries
      queryClient.invalidateQueries({
        queryKey: ['record-templates'],
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
      // Invalidate all template queries
      queryClient.invalidateQueries({
        queryKey: ['record-templates'],
      });
    },
    onError: (error: Error) => {
      notification.error({
        message: 'Error',
        description: `Failed to update template: ${error.message}`,
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
      // Invalidate all template queries
      queryClient.invalidateQueries({
        queryKey: ['record-templates'],
      });
    },
    onError: (error: Error) => {
      notification.error({
        message: 'Error',
        description: `Failed to delete template: ${error.message}`,
        placement: 'bottomRight',
        duration: 5,
      });
      console.error('Delete template error:', error);
    },
  });
}
