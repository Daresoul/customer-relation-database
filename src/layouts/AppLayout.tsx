/**
 * T012: Main application layout with Ant Design
 * Implements the main layout structure with Header, Content, and Footer
 */

import React from 'react';
import { Layout } from 'antd';
import { AppHeader } from '../components/layout/AppHeader';
import { AppToolbar } from '../components/layout/AppToolbar';
import type { AppLayoutProps } from '../types/ui.types';

const { Content, Footer } = Layout;

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
          marginTop: '112px', // Height of header + toolbar
          background: '#141414',
          minHeight: 'calc(100vh - 176px)', // Viewport - header - toolbar - footer
        }}
      >
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {children}
        </div>
      </Content>

      <Footer
        style={{
          textAlign: 'center',
          background: '#1F1F1F',
          color: '#8C8C8C',
          borderTop: '1px solid #303030',
        }}
      >
        Veterinary Clinic Management System ©{new Date().getFullYear()}
      </Footer>
    </Layout>
  );
};