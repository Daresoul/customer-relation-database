/**
 * T030: Empty state components using Ant Design Empty
 */

import React from 'react';
import { Empty, Button, Space } from 'antd';
import {
  FileSearchOutlined,
  InboxOutlined,
  FolderOpenOutlined,
  TeamOutlined,
  HeartOutlined,
  SearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  FrownOutlined,
  SmileOutlined,
} from '@ant-design/icons';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  iconType?: 'search' | 'inbox' | 'folder' | 'team' | 'heart' | 'frown' | 'smile';
  image?: 'default' | 'simple' | React.ReactNode;
  actionText?: string;
  onAction?: () => void;
  secondaryActionText?: string;
  onSecondaryAction?: () => void;
  fullHeight?: boolean;
}

const iconMap = {
  search: <FileSearchOutlined style={{ fontSize: 48, color: '#8c8c8c' }} />,
  inbox: <InboxOutlined style={{ fontSize: 48, color: '#8c8c8c' }} />,
  folder: <FolderOpenOutlined style={{ fontSize: 48, color: '#8c8c8c' }} />,
  team: <TeamOutlined style={{ fontSize: 48, color: '#8c8c8c' }} />,
  heart: <HeartOutlined style={{ fontSize: 48, color: '#8c8c8c' }} />,
  frown: <FrownOutlined style={{ fontSize: 48, color: '#8c8c8c' }} />,
  smile: <SmileOutlined style={{ fontSize: 48, color: '#52c41a' }} />,
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  iconType,
  image = 'default',
  actionText,
  onAction,
  secondaryActionText,
  onSecondaryAction,
  fullHeight = false,
}) => {
  const customIcon = icon || (iconType && iconMap[iconType]);

  const emptyImage = image === 'simple' ? Empty.PRESENTED_IMAGE_SIMPLE : image === 'default' ? Empty.PRESENTED_IMAGE_DEFAULT : image;

  const containerStyle: React.CSSProperties = fullHeight
    ? {
        height: '100%',
        minHeight: 400,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }
    : {};

  return (
    <div style={containerStyle}>
      <Empty
        image={customIcon || emptyImage}
        imageStyle={customIcon ? { height: 'auto' } : { height: 60 }}
        description={
          <Space direction="vertical" size="small">
            {title && <div style={{ fontSize: 16, fontWeight: 500 }}>{title}</div>}
            {description && <div style={{ color: '#8c8c8c' }}>{description}</div>}
          </Space>
        }
      >
        {(actionText || secondaryActionText) && (
          <Space>
            {actionText && onAction && (
              <Button type="primary" icon={<PlusOutlined />} onClick={onAction}>
                {actionText}
              </Button>
            )}
            {secondaryActionText && onSecondaryAction && (
              <Button onClick={onSecondaryAction}>
                {secondaryActionText}
              </Button>
            )}
          </Space>
        )}
      </Empty>
    </div>
  );
};

// No data state
export const NoData: React.FC<Partial<EmptyStateProps>> = (props) => (
  <EmptyState
    title="No Data"
    description="There is no data to display"
    iconType="inbox"
    {...props}
  />
);

// No search results
export const NoSearchResults: React.FC<Partial<EmptyStateProps>> = (props) => (
  <EmptyState
    title="No Results Found"
    description="Try adjusting your search criteria"
    iconType="search"
    actionText="Clear Search"
    {...props}
  />
);

// No patients
export const NoPatientsFound: React.FC<Partial<EmptyStateProps>> = (props) => (
  <EmptyState
    title="No Patients Found"
    description="Start by adding your first patient"
    iconType="heart"
    actionText="Add Patient"
    {...props}
  />
);

// No households
export const NoHouseholdsFound: React.FC<Partial<EmptyStateProps>> = (props) => (
  <EmptyState
    title="No Households Found"
    description="Create a household to get started"
    iconType="team"
    actionText="Create Household"
    {...props}
  />
);

// Error state
export const ErrorState: React.FC<{
  error?: Error | string;
  onRetry?: () => void;
}> = ({ error, onRetry }) => (
  <EmptyState
    title="Something went wrong"
    description={typeof error === 'string' ? error : error?.message || 'An unexpected error occurred'}
    iconType="frown"
    actionText="Retry"
    onAction={onRetry}
    fullHeight
  />
);

// Success state
export const SuccessState: React.FC<{
  title?: string;
  description?: string;
  onContinue?: () => void;
}> = ({ title = 'Success!', description = 'Operation completed successfully', onContinue }) => (
  <EmptyState
    title={title}
    description={description}
    iconType="smile"
    actionText="Continue"
    onAction={onContinue}
    fullHeight
  />
);

// Loading failed state
export const LoadingFailed: React.FC<{
  onRetry?: () => void;
}> = ({ onRetry }) => (
  <EmptyState
    title="Failed to Load"
    description="Unable to load the requested data"
    iconType="frown"
    actionText="Try Again"
    onAction={onRetry}
    secondaryActionText="Refresh Page"
    onSecondaryAction={() => window.location.reload()}
  />
);

// Permission denied state
export const PermissionDenied: React.FC<Partial<EmptyStateProps>> = (props) => (
  <EmptyState
    title="Access Denied"
    description="You don't have permission to view this content"
    image={Empty.PRESENTED_IMAGE_SIMPLE}
    {...props}
  />
);

// Coming soon state
export const ComingSoon: React.FC<Partial<EmptyStateProps>> = (props) => (
  <EmptyState
    title="Coming Soon"
    description="This feature is under development"
    image={Empty.PRESENTED_IMAGE_SIMPLE}
    {...props}
  />
);

// Table empty state
export const TableEmptyState: React.FC<{
  entityName?: string;
  onAdd?: () => void;
}> = ({ entityName = 'items', onAdd }) => (
  <div style={{ padding: '40px 0' }}>
    <EmptyState
      title={`No ${entityName} yet`}
      description={`Start by adding your first ${entityName.slice(0, -1)}`}
      actionText={`Add ${entityName.slice(0, -1)}`}
      onAction={onAdd}
    />
  </div>
);

// List empty state
export const ListEmptyState: React.FC<{
  itemName?: string;
}> = ({ itemName = 'items' }) => (
  <div style={{ textAlign: 'center', padding: '20px', color: '#8c8c8c' }}>
    <InboxOutlined style={{ fontSize: 32, marginBottom: 8 }} />
    <div>No {itemName} to display</div>
  </div>
);