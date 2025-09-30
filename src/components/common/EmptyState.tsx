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
import styles from './Common.module.css';

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
  search: <FileSearchOutlined className={styles.emptyIcon} />,
  inbox: <InboxOutlined className={styles.emptyIcon} />,
  folder: <FolderOpenOutlined className={styles.emptyIcon} />,
  team: <TeamOutlined className={styles.emptyIcon} />,
  heart: <HeartOutlined className={styles.emptyIcon} />,
  frown: <FrownOutlined className={styles.emptyIcon} />,
  smile: <SmileOutlined className={styles.emptyIconGreen} />,
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

  return (
    <div className={fullHeight ? styles.emptyContainer : undefined}>
      <Empty
        image={customIcon || emptyImage}
        imageStyle={customIcon ? { height: 'auto' } : { height: 60 }}
        description={
          <Space direction="vertical" size="small">
            {title && <div className={styles.emptyTitle}>{title}</div>}
            {description && <div className={styles.emptyDescription}>{description}</div>}
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
  <div className={styles.tablePadding}>
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
  <div className={styles.listEmpty}>
    <InboxOutlined className={styles.listEmptyIcon} />
    <div>No {itemName} to display</div>
  </div>
);