/**
 * T013: Main application layout with header and content
 */

import React from 'react';
import { Layout } from 'antd';
import { AppHeader } from './AppHeader';
import { AppToolbar } from './AppToolbar';
import type { ViewMode } from '../../contexts/ViewContext';

const { Content } = Layout;

export interface UserInfo {
  name: string;
  email: string;
  avatar: string;
  role: string;
}

export interface AppLayoutProps {
  children: React.ReactNode;
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  userInfo: UserInfo;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  activeView,
  onViewChange,
  userInfo,
}) => {
  return (
    <Layout style={{ minHeight: '100vh', background: '#141414' }}>
      <AppHeader
        activeView={activeView}
        onViewChange={onViewChange}
        userInfo={userInfo}
      />
      <AppToolbar activeView={activeView} />
      <Content
        style={{
          padding: '24px',
          marginTop: '112px', // Header (64px) + Toolbar (48px)
          minHeight: 'calc(100vh - 112px)',
          background: '#141414',
        }}
      >
        {children}
      </Content>
    </Layout>
  );
};