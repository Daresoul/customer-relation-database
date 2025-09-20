/**
 * T013: Application header with navigation and user menu
 */

import React from 'react';
import { Layout, Typography, Space } from 'antd';
import { HeartOutlined } from '@ant-design/icons';
import { NavigationTabs } from './NavigationTabs';
import { UserMenu } from './UserMenu';
import type { AppHeaderProps } from '../../types/ui.types';

const { Header } = Layout;
const { Title } = Typography;

export const AppHeader: React.FC<AppHeaderProps> = ({
  activeView,
  onViewChange,
  userInfo,
}) => {
  return (
    <Header
      style={{
        position: 'fixed',
        top: 0,
        zIndex: 1000,
        width: '100%',
        background: '#1F1F1F',
        borderBottom: '1px solid #303030',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '64px',
      }}
    >
      {/* Logo and App Name */}
      <Space size={16} style={{ flex: '0 0 auto' }}>
        <HeartOutlined style={{ fontSize: '24px', color: '#4A90E2' }} />
        <Title
          level={4}
          style={{
            margin: 0,
            color: '#E6E6E6',
            fontSize: '18px',
            fontWeight: 600,
          }}
        >
          VetClinic Pro
        </Title>
      </Space>

      {/* Navigation Tabs */}
      <div style={{ flex: '1 1 auto', display: 'flex', justifyContent: 'center' }}>
        <NavigationTabs
          activeView={activeView}
          onViewChange={onViewChange}
        />
      </div>

      {/* User Menu */}
      <div style={{ flex: '0 0 auto' }}>
        <UserMenu userInfo={userInfo} />
      </div>
    </Header>
  );
};