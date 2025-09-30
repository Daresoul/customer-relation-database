/**
 * T028: Custom Modal components wrapping Ant Design Modal
 */

import React from 'react';
import { Modal as AntModal, ModalProps as AntModalProps, message, notification } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import styles from './Common.module.css';

export interface ModalProps extends AntModalProps {
  variant?: 'default' | 'info' | 'success' | 'warning' | 'error';
  showCloseButton?: boolean;
  fullScreen?: boolean;
}

const variantIcons = {
  info: <InfoCircleOutlined className={styles.modalIconInfo} />,
  success: <CheckCircleOutlined className={styles.modalIconSuccess} />,
  warning: <ExclamationCircleOutlined className={styles.modalIconWarning} />,
  error: <CloseCircleOutlined className={styles.modalIconError} />,
  default: null,
};

export const Modal: React.FC<ModalProps> = ({
  variant = 'default',
  showCloseButton = true,
  fullScreen = false,
  title,
  style,
  ...props
}) => {
  const icon = variantIcons[variant];

  const customStyle: React.CSSProperties = fullScreen
    ? {
        ...style,
        top: 0,
        padding: 0,
        maxWidth: '100vw',
      }
    : style;

  const customTitle = icon ? (
    <span>
      {icon} {title}
    </span>
  ) : (
    title
  );

  return (
    <AntModal
      title={customTitle}
      closable={showCloseButton}
      style={customStyle}
      width={fullScreen ? '100vw' : undefined}
      {...props}
    />
  );
};

// Confirmation modal utilities
export const confirm = AntModal.confirm;
export const info = AntModal.info;
export const success = AntModal.success;
export const warning = AntModal.warning;
export const error = AntModal.error;

// Custom confirmation dialogs
export const confirmDelete = ({
  title = 'Delete Confirmation',
  content = 'Are you sure you want to delete this item? This action cannot be undone.',
  onOk,
  onCancel,
  ...props
}: Omit<Parameters<typeof confirm>[0], 'icon'>) => {
  return confirm({
    title,
    icon: <ExclamationCircleOutlined className={styles.modalIconError} />,
    content,
    okText: 'Delete',
    okType: 'danger',
    cancelText: 'Cancel',
    onOk,
    onCancel,
    ...props,
  });
};

export const confirmAction = ({
  title = 'Confirm Action',
  content = 'Are you sure you want to proceed with this action?',
  onOk,
  onCancel,
  ...props
}: Omit<Parameters<typeof confirm>[0], 'icon'>) => {
  return confirm({
    title,
    icon: <QuestionCircleOutlined className={styles.modalIconInfo} />,
    content,
    okText: 'Confirm',
    cancelText: 'Cancel',
    onOk,
    onCancel,
    ...props,
  });
};

// Alert modal (simplified)
export const alert = ({
  title,
  content,
  type = 'info',
  ...props
}: {
  title: string;
  content: React.ReactNode;
  type?: 'info' | 'success' | 'warning' | 'error';
} & Partial<Parameters<typeof info>[0]>) => {
  const modalFunctions = {
    info,
    success,
    warning,
    error,
  };

  return modalFunctions[type]({
    title,
    content,
    ...props,
  });
};

// Toast notifications (using Ant Design message)
export const toast = {
  success: (content: string, duration?: number) =>
    message.success(content, duration),
  error: (content: string, duration?: number) =>
    message.error(content, duration),
  warning: (content: string, duration?: number) =>
    message.warning(content, duration),
  info: (content: string, duration?: number) =>
    message.info(content, duration),
  loading: (content: string, duration?: number) =>
    message.loading(content, duration),
};

// Notification helpers
export const notify = {
  success: (title: string, description?: string) =>
    notification.success({
      message: title,
      description,
      placement: 'topRight',
    }),
  error: (title: string, description?: string) =>
    notification.error({
      message: title,
      description,
      placement: 'topRight',
    }),
  warning: (title: string, description?: string) =>
    notification.warning({
      message: title,
      description,
      placement: 'topRight',
    }),
  info: (title: string, description?: string) =>
    notification.info({
      message: title,
      description,
      placement: 'topRight',
    }),
};

// Form Modal Component
export interface FormModalProps extends ModalProps {
  submitText?: string;
  cancelText?: string;
  onSubmit?: () => void | Promise<void>;
  loading?: boolean;
}

export const FormModal: React.FC<FormModalProps> = ({
  submitText = 'Submit',
  cancelText = 'Cancel',
  onSubmit,
  loading = false,
  children,
  ...props
}) => {
  return (
    <Modal
      okText={submitText}
      cancelText={cancelText}
      onOk={onSubmit}
      confirmLoading={loading}
      {...props}
    >
      {children}
    </Modal>
  );
};

// Drawer Modal (slides from side)
export const DrawerModal: React.FC<ModalProps> = (props) => (
  <Modal
    {...props}
    style={{
      ...props.style,
      top: 0,
      paddingBottom: 0,
    }}
    bodyStyle={{
      height: 'calc(100vh - 110px)',
      overflow: 'auto',
    }}
  />
);