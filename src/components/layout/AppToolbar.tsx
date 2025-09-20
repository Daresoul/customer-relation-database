/**
 * T014: Context-specific toolbar with action buttons
 */

import React from 'react';
import { Space, Button } from 'antd';
import {
  PlusOutlined,
  DownloadOutlined,
  UploadOutlined,
  SearchOutlined,
  FilterOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import type { AppToolbarProps } from '../../types/ui.types';

export const AppToolbar: React.FC<AppToolbarProps> = ({ activeView }) => {
  // Define toolbar actions based on active view
  const getToolbarActions = () => {
    if (activeView === 'patients') {
      return (
        <>
          <Button type="primary" icon={<PlusOutlined />} size="middle">
            Create New Patient
          </Button>
          <Button icon={<SearchOutlined />} size="middle">
            Advanced Search
          </Button>
          <Button icon={<FilterOutlined />} size="middle">
            Filter
          </Button>
          <Button icon={<DownloadOutlined />} size="middle">
            Export
          </Button>
        </>
      );
    } else if (activeView === 'households') {
      return (
        <>
          <Button type="primary" icon={<HomeOutlined />} size="middle">
            Create New Household
          </Button>
          <Button icon={<PlusOutlined />} size="middle">
            Add Contact
          </Button>
          <Button icon={<SearchOutlined />} size="middle">
            Search Households
          </Button>
          <Button icon={<UploadOutlined />} size="middle">
            Import
          </Button>
        </>
      );
    }
    return null;
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: '64px', // Below header
        zIndex: 999,
        width: '100%',
        background: '#262626',
        borderBottom: '1px solid #303030',
        padding: '12px 24px',
        height: '48px',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div style={{ maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        <Space size={12}>{getToolbarActions()}</Space>
      </div>
    </div>
  );
};