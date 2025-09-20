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
          style={{
            fontSize: size === 'large' ? 32 : size === 'small' ? 14 : 24,
          }}
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
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: overlay ? 'rgba(0, 0, 0, 0.75)' : 'transparent',
          zIndex: 9999,
        }}
      >
        {spinElement}
      </div>
    );
  }

  if (overlay) {
    return (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          minHeight: 100,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 10,
          }}
        >
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
  <div
    style={{
      height: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'column',
      gap: '16px',
    }}
  >
    <Loading size="large" />
    <div style={{ fontSize: '16px', color: '#8c8c8c' }}>{message}</div>
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
  <Space direction="vertical" style={{ width: '100%' }}>
    {Array.from({ length: rows }).map((_, index) => (
      <Skeleton.Input key={index} active style={{ width: '100%' }} />
    ))}
  </Space>
);

// Card loader
export const CardLoader: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <Space size="large">
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} style={{ width: 300 }}>
        <Skeleton active avatar paragraph={{ rows: 3 }} />
      </div>
    ))}
  </Space>
);

// List loader
export const ListLoader: React.FC<{ items?: number }> = ({ items = 5 }) => (
  <Space direction="vertical" style={{ width: '100%' }}>
    {Array.from({ length: items }).map((_, index) => (
      <Skeleton key={index} active avatar title={{ width: '50%' }} paragraph={{ rows: 1 }} />
    ))}
  </Space>
);

// Form loader
export const FormLoader: React.FC<{ fields?: number }> = ({ fields = 4 }) => (
  <Space direction="vertical" style={{ width: '100%' }} size="large">
    {Array.from({ length: fields }).map((_, index) => (
      <div key={index}>
        <Skeleton.Input active size="small" style={{ width: 100, marginBottom: 8 }} />
        <Skeleton.Input active style={{ width: '100%' }} />
      </div>
    ))}
    <Skeleton.Button active style={{ width: 120 }} />
  </Space>
);

// Inline loader
export const InlineLoader: React.FC<{ text?: string }> = ({
  text = 'Loading...',
}) => (
  <Space size="small">
    <Spin size="small" />
    <span style={{ color: '#8c8c8c' }}>{text}</span>
  </Space>
);

// Button loader
export const ButtonLoader: React.FC = () => (
  <Spin size="small" style={{ marginRight: 8 }} />
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
      <div
        style={{
          height: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ fontSize: '18px', color: '#ff4d4f' }}>Error loading content</div>
        <div style={{ fontSize: '14px', color: '#8c8c8c' }}>{error.message}</div>
        {retry && (
          <button
            onClick={retry}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: '#1890ff',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
};