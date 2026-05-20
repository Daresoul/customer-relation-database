import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { LineItemService } from '../services/lineItemService';
import {
  LineItemTemplate,
  CreateLineItemTemplateInput,
  UpdateLineItemTemplateInput
} from '../types/lineItem';
import { createMutationErrorHandler } from '../utils/errors';

export const useLineItemTemplates = (activeOnly: boolean = true) => {
  return useQuery({
    queryKey: ['lineItemTemplates', activeOnly],
    queryFn: () => LineItemService.getTemplates(activeOnly),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useLineItemTemplateById = (id: number) => {
  return useQuery({
    queryKey: ['lineItemTemplate', id],
    queryFn: () => LineItemService.getTemplate(id),
    enabled: !!id,
  });
};

export const useCreateLineItemTemplate = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation(['errors', 'settings']);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateLineItemTemplateInput) => LineItemService.createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lineItemTemplates'] });
      notification.success({
        message: t('common:success', { ns: 'common' }),
        description: t('settings:lineItems.created', 'Line item created successfully'),
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Create Line Item Template', t, 'useLineItemTemplates'),
  });
};

export const useUpdateLineItemTemplate = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation(['errors', 'settings']);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateLineItemTemplateInput }) =>
      LineItemService.updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lineItemTemplates'] });
      notification.success({
        message: t('common:success', { ns: 'common' }),
        description: t('settings:lineItems.updated', 'Line item updated successfully'),
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Update Line Item Template', t, 'useLineItemTemplates'),
  });
};

export const useDeleteLineItemTemplate = () => {
  const { notification } = App.useApp();
  const { t } = useTranslation(['errors', 'settings']);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => LineItemService.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lineItemTemplates'] });
      notification.success({
        message: t('common:success', { ns: 'common' }),
        description: t('settings:lineItems.deleted', 'Line item deleted successfully'),
        placement: 'bottomRight',
        duration: 3,
      });
    },
    onError: createMutationErrorHandler(notification, 'Delete Line Item Template', t, 'useLineItemTemplates'),
  });
};
