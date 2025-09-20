/**
 * T015: Navigation tabs for switching between views
 */

import React from 'react';
import { Tabs } from 'antd';
import { HeartOutlined, HomeOutlined } from '@ant-design/icons';
import type { ViewType } from '../../types/ui.types';

interface NavigationTabsProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  activeView,
  onViewChange,
}) => {
  const items = [
    {
      key: 'patients',
      label: (
        <span>
          <HeartOutlined style={{ marginRight: 8 }} />
          Patients
        </span>
      ),
    },
    {
      key: 'households',
      label: (
        <span>
          <HomeOutlined style={{ marginRight: 8 }} />
          Households
        </span>
      ),
    },
  ];

  return (
    <Tabs
      activeKey={activeView}
      onChange={(key) => onViewChange(key as ViewType)}
      items={items}
      size="large"
      style={{
        height: '64px',
      }}
      tabBarStyle={{
        marginBottom: 0,
        borderBottom: 'none',
      }}
    />
  );
};