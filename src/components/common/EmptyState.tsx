/**
 * T030: Empty state components using Ant Design Empty
 */

import React from 'react';
import { Empty, Button, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  FileSearchOutlined,
  InboxOutlined,
  FolderOpenOutlined,
  TeamOutlined,
  HeartOutlined,
  PlusOutlined,
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
export const NoData: React.FC<Partial<EmptyStateProps>> = (props) => {
  const { t } = useTranslation('common');
  return (
    <EmptyState
      title={t('common:empty.noDataTitle')}
      description={t('common:empty.noDataDescription')}
      iconType="inbox"
      {...props}
    />
  );
};

// No search results
export const NoSearchResults: React.FC<Partial<EmptyStateProps>> = (props) => {
  const { t } = useTranslation('common');
  return (
    <EmptyState
      title={t('common:empty.noResultsTitle')}
      description={t('common:empty.noResultsDescription')}
      iconType="search"
      actionText={t('common:empty.clearSearch')}
      {...props}
    />
  );
};

// No patients
export const NoPatientsFound: React.FC<Partial<EmptyStateProps>> = (props) => {
  const { t } = useTranslation('common');
  return (
    <EmptyState
      title={t('common:empty.noPatientsTitle')}
      description={t('common:empty.noPatientsDescription')}
      iconType="heart"
      actionText={t('common:empty.addPatient')}
      {...props}
    />
  );
};

// No households
export const NoHouseholdsFound: React.FC<Partial<EmptyStateProps>> = (props) => {
  const { t } = useTranslation('common');
  return (
    <EmptyState
      title={t('common:empty.noHouseholdsTitle')}
      description={t('common:empty.noHouseholdsDescription')}
      iconType="team"
      actionText={t('common:empty.createHousehold')}
      {...props}
    />
  );
};

// Error state
export const ErrorState: React.FC<{
  error?: Error | string;
  onRetry?: () => void;
}> = ({ error, onRetry }) => {
  const { t } = useTranslation('common');
  return (
    <EmptyState
      title={t('common:crash.title')}
      description={typeof error === 'string' ? error : error?.message || t('common:unexpectedError')}
      iconType="frown"
      actionText={t('common:retry')}
      onAction={onRetry}
      fullHeight
    />
  );
};

// Success state
export const SuccessState: React.FC<{
  title?: string;
  description?: string;
  onContinue?: () => void;
}> = ({ title, description, onContinue }) => {
  const { t } = useTranslation('common');
  return (
    <EmptyState
      title={title ?? t('common:empty.successTitle')}
      description={description ?? t('common:operationSuccess')}
      iconType="smile"
      actionText={t('common:empty.continue')}
      onAction={onContinue}
      fullHeight
    />
  );
};

// Loading failed state
export const LoadingFailed: React.FC<{
  onRetry?: () => void;
}> = ({ onRetry }) => {
  const { t } = useTranslation('common');
  return (
    <EmptyState
      title={t('common:empty.loadFailedTitle')}
      description={t('common:empty.loadFailedDescription')}
      iconType="frown"
      actionText={t('common:empty.tryAgain')}
      onAction={onRetry}
      secondaryActionText={t('common:empty.refreshPage')}
      onSecondaryAction={() => window.location.reload()}
    />
  );
};

// Permission denied state
export const PermissionDenied: React.FC<Partial<EmptyStateProps>> = (props) => {
  const { t } = useTranslation('common');
  return (
    <EmptyState
      title={t('common:empty.accessDeniedTitle')}
      description={t('common:empty.accessDeniedDescription')}
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      {...props}
    />
  );
};

// Coming soon state
export const ComingSoon: React.FC<Partial<EmptyStateProps>> = (props) => {
  const { t } = useTranslation('common');
  return (
    <EmptyState
      title={t('common:empty.comingSoonTitle')}
      description={t('common:empty.comingSoonDescription')}
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      {...props}
    />
  );
};

// Table empty state
export const TableEmptyState: React.FC<{
  entityName?: string;
  onAdd?: () => void;
}> = ({ entityName, onAdd }) => {
  const { t } = useTranslation('common');
  const plural = entityName ?? t('common:empty.items');
  const singular = entityName ? entityName.slice(0, -1) : t('common:empty.item');
  return (
    <div className={styles.tablePadding}>
      <EmptyState
        title={t('common:empty.tableTitle', { items: plural })}
        description={t('common:empty.tableDescription', { item: singular })}
        actionText={t('common:empty.tableAdd', { item: singular })}
        onAction={onAdd}
      />
    </div>
  );
};

// List empty state
export const ListEmptyState: React.FC<{
  itemName?: string;
}> = ({ itemName }) => {
  const { t } = useTranslation('common');
  return (
    <div className={styles.listEmpty}>
      <InboxOutlined className={styles.listEmptyIcon} />
      <div>{t('common:empty.listEmpty', { items: itemName ?? t('common:empty.items') })}</div>
    </div>
  );
};
