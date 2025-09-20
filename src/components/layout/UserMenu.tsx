/**
 * T016: User menu dropdown component
 */

import React from 'react';
import { Dropdown, Avatar, Space, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  QuestionCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import type { UserInfo } from '../../types/ui.types';

const { Text } = Typography;

interface UserMenuProps {
  userInfo?: UserInfo;
}

export const UserMenu: React.FC<UserMenuProps> = ({ userInfo }) => {
  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    switch (key) {
      case 'profile':
        console.log('Navigate to profile');
        break;
      case 'settings':
        console.log('Navigate to settings');
        break;
      case 'help':
        console.log('Open help');
        break;
      case 'about':
        console.log('Show about');
        break;
      case 'logout':
        console.log('Logout');
        break;
    }
  };

  const menuItems: MenuProps['items'] = [
    {
      key: 'user-info',
      label: (
        <div style={{ padding: '4px 0' }}>
          <Text strong style={{ display: 'block' }}>
            {userInfo?.name || 'Guest User'}
          </Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {userInfo?.email || 'guest@vetclinic.com'}
          </Text>
        </div>
      ),
      disabled: true,
    },
    {
      type: 'divider',
    },
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'My Profile',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
    },
    {
      type: 'divider',
    },
    {
      key: 'help',
      icon: <QuestionCircleOutlined />,
      label: 'Help',
    },
    {
      key: 'about',
      icon: <InfoCircleOutlined />,
      label: 'About',
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      danger: true,
    },
  ];

  return (
    <Dropdown
      menu={{ items: menuItems, onClick: handleMenuClick }}
      trigger={['click']}
      placement="bottomRight"
    >
      <Space style={{ cursor: 'pointer' }}>
        <Avatar
          size="default"
          icon={<UserOutlined />}
          style={{ background: '#4A90E2' }}
        >
          {userInfo?.name?.charAt(0).toUpperCase() || 'U'}
        </Avatar>
      </Space>
    </Dropdown>
  );
};