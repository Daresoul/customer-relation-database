/**
 * T028: Custom Modal components wrapping Ant Design Modal
 */

import React from 'react';
import { Modal as AntModal, ModalProps as AntModalProps } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
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
  title = i18n.t('common:confirmDialog.deleteTitle'),
  content = i18n.t('common:confirmDialog.deleteContent'),
  onOk,
  onCancel,
  ...props
}: Omit<Parameters<typeof confirm>[0], 'icon'>) => {
  return confirm({
    title,
    icon: <ExclamationCircleOutlined className={styles.modalIconError} />,
    content,
    okText: i18n.t('common:delete'),
    okType: 'danger',
    cancelText: i18n.t('common:cancel'),
    onOk,
    onCancel,
    ...props,
  });
};

export const confirmAction = ({
  title = i18n.t('common:confirmDialog.actionTitle'),
  content = i18n.t('common:confirmDialog.actionContent'),
  onOk,
  onCancel,
  ...props
}: Omit<Parameters<typeof confirm>[0], 'icon'>) => {
  return confirm({
    title,
    icon: <QuestionCircleOutlined className={styles.modalIconInfo} />,
    content,
    okText: i18n.t('common:confirm'),
    cancelText: i18n.t('common:cancel'),
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

// Form Modal Component
export interface FormModalProps extends ModalProps {
  submitText?: string;
  cancelText?: string;
  onSubmit?: () => void | Promise<void>;
  loading?: boolean;
}

export const FormModal: React.FC<FormModalProps> = ({
  submitText,
  cancelText,
  onSubmit,
  loading = false,
  children,
  ...props
}) => {
  const { t } = useTranslation('common');
  return (
    <Modal
      okText={submitText ?? t('common:buttons.submit')}
      cancelText={cancelText ?? t('common:cancel')}
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
    styles={{
      body: {
        height: 'calc(100vh - 110px)',
        overflow: 'auto',
      },
    }}
  />
);