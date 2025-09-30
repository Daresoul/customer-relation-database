/**
 * T012: Main application layout with Ant Design
 * Implements the main layout structure with Header, Content, and Footer
 */

import React from 'react';
import { Layout } from 'antd';
import { AppHeader } from '../components/layout/AppHeader';
import { AppToolbar } from '../components/layout/AppToolbar';
import type { AppLayoutProps } from '../types/ui.types';
import styles from './AppLayout.module.css';

const { Content, Footer } = Layout;

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  activeView,
  onViewChange,
  userInfo,
}) => {
  return (
    <Layout className={styles.layout}>
      <AppHeader
        activeView={activeView}
        onViewChange={onViewChange}
        userInfo={userInfo}
      />

      <AppToolbar activeView={activeView} />

      <Content className={styles.content}>
        <div className={styles.contentInner}>
          {children}
        </div>
      </Content>

      <Footer className={styles.footer}>
        Veterinary Clinic Management System ©{new Date().getFullYear()}
      </Footer>
    </Layout>
  );
};