/**
 * FormModal - Base modal wrapper for form-based modals
 *
 * Standardizes the modal pattern used across the application by handling:
 * - Form initialization on open
 * - Loading state management
 * - Success/error notifications
 * - Form reset on close
 */

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Form, Button, Space, App } from 'antd';
import { SaveOutlined, CloseOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd';

export interface FormModalProps {
  /** Whether the modal is visible */
  open: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Modal title */
  title: React.ReactNode;
  /** Form instance from Form.useForm() */
  form: FormInstance;
  /** Form submission handler - should throw on error */
  onSubmit: (values: any) => Promise<void>;
  /** Whether the form is currently submitting */
  loading?: boolean;
  /** Modal width in pixels */
  width?: number;
  /** Custom footer (set to null to hide default footer) */
  footer?: React.ReactNode | null;
  /** Child elements (form content) */
  children: React.ReactNode;
  /** Initial values to set when modal opens */
  initialValues?: any;
  /** Text for submit button */
  submitText?: string;
  /** Text for cancel button */
  cancelText?: string;
  /** Icon for submit button */
  submitIcon?: React.ReactNode;
  /** Whether to show success notification on submit */
  showSuccessNotification?: boolean;
  /** Success message for notification */
  successMessage?: string;
  /** Whether to reset form on close */
  resetOnClose?: boolean;
  /** Whether to close modal on successful submit */
  closeOnSuccess?: boolean;
  /** Custom submit button props */
  submitButtonProps?: React.ComponentProps<typeof Button>;
  /** Custom cancel button props */
  cancelButtonProps?: React.ComponentProps<typeof Button>;
  /** Additional modal props */
  modalProps?: Partial<React.ComponentProps<typeof Modal>>;
}

export const FormModal: React.FC<FormModalProps> = ({
  open,
  onClose,
  title,
  form,
  onSubmit,
  loading = false,
  width = 600,
  footer,
  children,
  initialValues,
  submitText,
  cancelText,
  submitIcon = <SaveOutlined />,
  showSuccessNotification = true,
  successMessage,
  resetOnClose = true,
  closeOnSuccess = true,
  submitButtonProps,
  cancelButtonProps,
  modalProps,
}) => {
  const { t } = useTranslation(['common', 'forms']);
  const { notification } = App.useApp();

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      form.resetFields();
      if (initialValues) {
        form.setFieldsValue(initialValues);
      }
    }
  }, [open, form, initialValues]);

  // Handle form submission
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      await onSubmit(values);

      if (showSuccessNotification) {
        notification.success({
          message: t('common:success'),
          description: successMessage || t('common:operationSuccessful'),
          placement: 'bottomRight',
          duration: 3,
        });
      }

      if (closeOnSuccess) {
        handleClose();
      }
    } catch (error: any) {
      // If it's a validation error (from form.validateFields), don't show notification
      if (!error?.errorFields) {
        notification.error({
          message: t('common:error'),
          description: error?.message || t('common:operationFailed'),
          placement: 'bottomRight',
          duration: 5,
        });
      }
    }
  };

  // Handle modal close
  const handleClose = () => {
    if (resetOnClose) {
      form.resetFields();
    }
    onClose();
  };

  // Default footer with submit and cancel buttons
  const defaultFooter = (
    <Space>
      <Button
        type="primary"
        onClick={handleSubmit}
        loading={loading}
        icon={submitIcon}
        {...submitButtonProps}
      >
        {submitText || t('common:buttons.submit')}
      </Button>
      <Button
        onClick={handleClose}
        disabled={loading}
        icon={<CloseOutlined />}
        {...cancelButtonProps}
      >
        {cancelText || t('common:buttons.cancel')}
      </Button>
    </Space>
  );

  return (
    <Modal
      title={title}
      open={open}
      onCancel={handleClose}
      width={width}
      footer={footer === null ? null : footer || defaultFooter}
      destroyOnClose
      maskClosable={!loading}
      closable={!loading}
      {...modalProps}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >
        {children}
      </Form>
    </Modal>
  );
};

export default FormModal;
