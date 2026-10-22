import React from 'react';
import { Alert, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface LoadErrorProps {
  /** Translated "Could not load …" line naming what is missing. */
  title: string;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}

/**
 * Inline error for a load that failed. Never show an empty list or zero
 * counters in its place: "nothing here" and "couldn't read it" must look different.
 */
export const LoadError: React.FC<LoadErrorProps> = ({ title, onRetry, retrying, className }) => {
  const { t } = useTranslation('common');
  return (
    <Alert
      type="error"
      showIcon
      className={className}
      message={title}
      description={t('common:loadFailed.description')}
      action={
        <Button icon={<ReloadOutlined />} onClick={onRetry} loading={retrying}>
          {t('common:retry')}
        </Button>
      }
    />
  );
};

export default LoadError;
