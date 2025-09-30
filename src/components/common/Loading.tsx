/**
 * T029: Loading components using Ant Design Spin and Skeleton
 */

import React from 'react';
import { Spin, Skeleton, Space, Progress } from 'antd';
import {
  LoadingOutlined,
  SyncOutlined,
  HourglassOutlined,
} from '@ant-design/icons';
import styles from './Common.module.css';

export interface LoadingProps {
  size?: 'small' | 'default' | 'large';
  tip?: string;
  fullScreen?: boolean;
  overlay?: boolean;
  type?: 'spinner' | 'dots' | 'progress';
  progress?: number;
  iconType?: 'loading' | 'sync' | 'hourglass';
}

const iconMap = {
  loading: <LoadingOutlined />,
  sync: <SyncOutlined />,
  hourglass: <HourglassOutlined />,
};

export const Loading: React.FC<LoadingProps> = ({
  size = 'default',
  tip,
  fullScreen = false,
  overlay = false,
  type = 'spinner',
  progress = 0,
  iconType = 'loading',
}) => {
  const icon = iconMap[iconType];
  const customIcon = <Spin indicator={icon} />;

  const spinElement = (
    <>
      {type === 'spinner' && (
        <Spin
          size={size}
          tip={tip}
          indicator={icon}
          className={size === 'large' ? styles.spinnerLarge : size === 'small' ? styles.spinnerSmall : styles.spinnerDefault}
        />
      )}
      {type === 'dots' && (
        <Spin size={size} tip={tip} />
      )}
      {type === 'progress' && (
        <Space direction="vertical" align="center">
          <Progress
            type="circle"
            percent={progress}
            size={size === 'small' ? 80 : size === 'large' ? 160 : 120}
          />
          {tip && <div>{tip}</div>}
        </Space>
      )}
    </>
  );

  if (fullScreen) {
    return (
      <div className={overlay ? styles.fullScreenOverlay : styles.fullScreenTransparent}>
        {spinElement}
      </div>
    );
  }

  if (overlay) {
    return (
      <div className={styles.overlayContainer}>
        <div className={styles.overlayInner}>
          {spinElement}
        </div>
      </div>
    );
  }

  return spinElement;
};

// Page loader component
export const PageLoader: React.FC<{ message?: string }> = ({
  message = 'Loading...',
}) => (
  <div className={styles.pageLoaderContainer}>
    <Loading size="large" />
    <div className={styles.pageLoaderText}>{message}</div>
  </div>
);

// Content loader with skeleton
export interface ContentLoaderProps {
  rows?: number;
  avatar?: boolean;
  title?: boolean;
  paragraph?: boolean;
  active?: boolean;
}

export const ContentLoader: React.FC<ContentLoaderProps> = ({
  rows = 3,
  avatar = false,
  title = true,
  paragraph = true,
  active = true,
}) => (
  <Skeleton
    active={active}
    avatar={avatar}
    title={title}
    paragraph={paragraph ? { rows } : false}
  />
);

// Table loader
export const TableLoader: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <Space direction="vertical" className={styles.tableLoaderContainer}>
    {Array.from({ length: rows }).map((_, index) => (
      <Skeleton.Input key={index} active className={styles.skeletonFullWidth} />
    ))}
  </Space>
);

// Card loader
export const CardLoader: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <Space size="large">
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className={styles.cardLoaderItem}>
        <Skeleton active avatar paragraph={{ rows: 3 }} />
      </div>
    ))}
  </Space>
);

// List loader
export const ListLoader: React.FC<{ items?: number }> = ({ items = 5 }) => (
  <Space direction="vertical" className={styles.tableLoaderContainer}>
    {Array.from({ length: items }).map((_, index) => (
      <Skeleton key={index} active avatar title={{ width: '50%' }} paragraph={{ rows: 1 }} />
    ))}
  </Space>
);

// Form loader
export const FormLoader: React.FC<{ fields?: number }> = ({ fields = 4 }) => (
  <Space direction="vertical" className={styles.formLoaderContainer} size="large">
    {Array.from({ length: fields }).map((_, index) => (
      <div key={index}>
        <Skeleton.Input active size="small" className={styles.formLoaderLabel} />
        <Skeleton.Input active className={styles.formLoaderInput} />
      </div>
    ))}
    <Skeleton.Button active className={styles.formLoaderButton} />
  </Space>
);

// Inline loader
export const InlineLoader: React.FC<{ text?: string }> = ({
  text = 'Loading...',
}) => (
  <Space size="small">
    <Spin size="small" />
    <span className={styles.inlineLoaderText}>{text}</span>
  </Space>
);

// Button loader
export const ButtonLoader: React.FC = () => (
  <Spin size="small" className={styles.buttonLoaderMargin} />
);

// Lazy loading wrapper
export interface LazyLoaderProps {
  loading: boolean;
  error?: Error | null;
  retry?: () => void;
  children: React.ReactNode;
}

export const LazyLoader: React.FC<LazyLoaderProps> = ({
  loading,
  error,
  retry,
  children,
}) => {
  if (loading) {
    return <PageLoader />;
  }

  if (error) {
    return (
      <div className={styles.lazyLoaderError}>
        <div className={styles.lazyLoaderErrorTitle}>Error loading content</div>
        <div className={styles.lazyLoaderErrorMessage}>{error.message}</div>
        {retry && (
          <button onClick={retry} className={styles.lazyLoaderButton}>
            Retry
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
};