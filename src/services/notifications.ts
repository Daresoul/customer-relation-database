/**
 * T036: Centralized notification system using Ant Design
 */

import { notification, message } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  SyncOutlined,
} from '@ant-design/icons';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';
export type NotificationPlacement = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

interface NotificationOptions {
  duration?: number;
  placement?: NotificationPlacement;
  icon?: React.ReactNode;
  onClick?: () => void;
  onClose?: () => void;
  key?: string;
}

// Configure default notification settings
notification.config({
  placement: 'bottomRight',
  duration: 5,
  maxCount: 4,
});

// Main notification functions
export const notify = {
  success: (title: string, description?: string, options?: NotificationOptions) => {
    notification.success({
      message: title,
      description,
      icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
      ...options,
    });
  },

  error: (title: string, description?: string, options?: NotificationOptions) => {
    notification.error({
      message: title,
      description,
      icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
      ...options,
    });
  },

  warning: (title: string, description?: string, options?: NotificationOptions) => {
    notification.warning({
      message: title,
      description,
      icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
      ...options,
    });
  },

  info: (title: string, description?: string, options?: NotificationOptions) => {
    notification.info({
      message: title,
      description,
      icon: <InfoCircleOutlined style={{ color: '#1890ff' }} />,
      ...options,
    });
  },

  loading: (title: string, description?: string, options?: NotificationOptions) => {
    notification.open({
      message: title,
      description,
      icon: <LoadingOutlined spin style={{ color: '#1890ff' }} />,
      duration: 0, // Don't auto-close loading notifications
      ...options,
    });
  },

  progress: (title: string, progress: number, options?: NotificationOptions) => {
    const key = options?.key || 'progress-notification';
    notification.open({
      key,
      message: title,
      description: (
        <div>
          <div style={{
            width: '100%',
            height: 8,
            backgroundColor: '#f0f0f0',
            borderRadius: 4,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              backgroundColor: '#1890ff',
              transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>
            {progress}% complete
          </div>
        </div>
      ),
      icon: <SyncOutlined spin style={{ color: '#1890ff' }} />,
      duration: 0,
      ...options,
    });
  },

  close: (key: string) => {
    notification.close(key);
  },

  closeAll: () => {
    notification.destroy();
  },
};

// Toast messages (simpler, temporary messages)
export const toast = {
  success: (content: string, duration?: number) => {
    message.success(content, duration);
  },

  error: (content: string, duration?: number) => {
    message.error(content, duration);
  },

  warning: (content: string, duration?: number) => {
    message.warning(content, duration);
  },

  info: (content: string, duration?: number) => {
    message.info(content, duration);
  },

  loading: (content: string, duration?: number) => {
    return message.loading(content, duration || 0);
  },
};

// Specialized notification types
export const specialNotifications = {
  // Save notification
  saved: (itemName?: string) => {
    notify.success(
      'Saved Successfully',
      itemName ? `${itemName} has been saved` : 'Your changes have been saved',
      { duration: 2 }
    );
  },

  // Delete confirmation
  deleted: (itemName?: string) => {
    notify.success(
      'Deleted',
      itemName ? `${itemName} has been deleted` : 'Item has been deleted',
      { duration: 2 }
    );
  },

  // Network error
  networkError: (retry?: () => void) => {
    notify.error(
      'Network Error',
      'Unable to connect to the server. Please check your internet connection.',
      {
        duration: 0,
        onClick: retry,
      }
    );
  },

  // Permission denied
  permissionDenied: () => {
    notify.error(
      'Permission Denied',
      'You do not have permission to perform this action.',
      { duration: 5 }
    );
  },

  // Update available
  updateAvailable: (onUpdate?: () => void) => {
    notify.info(
      'Update Available',
      'A new version is available. Click to update.',
      {
        duration: 0,
        onClick: onUpdate,
      }
    );
  },

  // Sync status
  syncStarted: () => {
    notify.loading('Syncing', 'Synchronizing data...', { key: 'sync' });
  },

  syncComplete: (itemsCount?: number) => {
    notify.success(
      'Sync Complete',
      itemsCount ? `${itemsCount} items synchronized` : 'Data synchronized successfully',
      { key: 'sync', duration: 3 }
    );
  },

  syncFailed: (error?: string) => {
    notify.error(
      'Sync Failed',
      error || 'Failed to synchronize data. Please try again.',
      { key: 'sync', duration: 5 }
    );
  },

  // Form validation
  validationError: (errors: string[]) => {
    notify.error(
      'Validation Error',
      (
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      ),
      { duration: 5 }
    );
  },

  // Import/Export
  importStarted: (itemType: string) => {
    notify.loading(
      'Importing',
      `Importing ${itemType}...`,
      { key: 'import' }
    );
  },

  importComplete: (count: number, itemType: string) => {
    notify.success(
      'Import Complete',
      `Successfully imported ${count} ${itemType}`,
      { key: 'import', duration: 3 }
    );
  },

  exportStarted: (itemType: string) => {
    notify.loading(
      'Exporting',
      `Exporting ${itemType}...`,
      { key: 'export' }
    );
  },

  exportComplete: (fileName: string) => {
    notify.success(
      'Export Complete',
      `Data exported to ${fileName}`,
      { key: 'export', duration: 3 }
    );
  },
};

// Batch operation notifications
export const batchNotifications = {
  start: (operation: string, totalItems: number) => {
    notify.loading(
      `${operation} Started`,
      `Processing ${totalItems} items...`,
      { key: 'batch-operation' }
    );
  },

  progress: (operation: string, current: number, total: number) => {
    const progress = Math.round((current / total) * 100);
    notify.progress(
      `${operation} in Progress`,
      progress,
      { key: 'batch-operation' }
    );
  },

  complete: (operation: string, successCount: number, totalCount: number) => {
    if (successCount === totalCount) {
      notify.success(
        `${operation} Complete`,
        `Successfully processed all ${totalCount} items`,
        { key: 'batch-operation', duration: 3 }
      );
    } else {
      notify.warning(
        `${operation} Partially Complete`,
        `Processed ${successCount} of ${totalCount} items`,
        { key: 'batch-operation', duration: 5 }
      );
    }
  },

  error: (operation: string, error: string) => {
    notify.error(
      `${operation} Failed`,
      error,
      { key: 'batch-operation', duration: 5 }
    );
  },
};

// Export all notification utilities
export default {
  notify,
  toast,
  special: specialNotifications,
  batch: batchNotifications,
};