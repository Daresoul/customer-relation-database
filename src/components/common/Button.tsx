/**
 * T025: Custom Button component wrapping Ant Design Button
 */

import React from 'react';
import { Button as AntButton, ButtonProps as AntButtonProps } from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
  CloseOutlined,
  SearchOutlined,
  DownloadOutlined,
  UploadOutlined,
  ReloadOutlined,
  CheckOutlined,
} from '@ant-design/icons';

export interface ButtonProps extends AntButtonProps {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'ghost';
  iconType?: 'plus' | 'edit' | 'delete' | 'save' | 'close' | 'search' | 'download' | 'upload' | 'reload' | 'check';
  fullWidth?: boolean;
  rounded?: boolean;
}

const iconMap = {
  plus: <PlusOutlined />,
  edit: <EditOutlined />,
  delete: <DeleteOutlined />,
  save: <SaveOutlined />,
  close: <CloseOutlined />,
  search: <SearchOutlined />,
  download: <DownloadOutlined />,
  upload: <UploadOutlined />,
  reload: <ReloadOutlined />,
  check: <CheckOutlined />,
};

const variantMap: Record<string, Partial<AntButtonProps>> = {
  primary: { type: 'primary' },
  secondary: { type: 'default' },
  success: { type: 'primary', style: { backgroundColor: '#52C41A', borderColor: '#52C41A' } },
  danger: { danger: true },
  warning: { type: 'primary', style: { backgroundColor: '#FAAD14', borderColor: '#FAAD14' } },
  ghost: { type: 'ghost' },
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  iconType,
  fullWidth = false,
  rounded = false,
  children,
  style,
  ...props
}) => {
  const variantProps = variantMap[variant] || {};
  const icon = iconType ? iconMap[iconType] : undefined;

  const customStyle: React.CSSProperties = {
    ...style,
    width: fullWidth ? '100%' : undefined,
    borderRadius: rounded ? '20px' : undefined,
  };

  return (
    <AntButton
      icon={icon}
      style={customStyle}
      {...variantProps}
      {...props}
    >
      {children}
    </AntButton>
  );
};

// Export commonly used button configurations
export const PrimaryButton: React.FC<ButtonProps> = (props) => (
  <Button variant="primary" {...props} />
);

export const SecondaryButton: React.FC<ButtonProps> = (props) => (
  <Button variant="secondary" {...props} />
);

export const DangerButton: React.FC<ButtonProps> = (props) => (
  <Button variant="danger" {...props} />
);

export const SuccessButton: React.FC<ButtonProps> = (props) => (
  <Button variant="success" {...props} />
);

export const GhostButton: React.FC<ButtonProps> = (props) => (
  <Button variant="ghost" {...props} />
);

export const IconButton: React.FC<ButtonProps> = (props) => (
  <Button type="text" {...props} />
);