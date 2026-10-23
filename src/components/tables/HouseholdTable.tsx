/**
 * T022: Household table component with Ant Design
 */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import {
  Table,
  Space,
  Input,
  Tooltip,
  Badge,
  Typography,
  Avatar,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  SearchOutlined,
  HomeOutlined,
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
  HeartOutlined,
} from '@ant-design/icons';
import type { HouseholdTableRecord } from '../../types/ui.types';
import styles from './Tables.module.css';

const { Text, Link } = Typography;

interface HouseholdTableProps {
  households: HouseholdTableRecord[];
  loading?: boolean;
}

export const HouseholdTable: React.FC<HouseholdTableProps> = ({
  households,
  loading = false,
}) => {
  const { t } = useTranslation(['patients', 'entities', 'common']);
  const [searchText, setSearchText] = useState('');

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!searchText) return households;

    const searchLower = searchText.toLowerCase();
    return households.filter(household =>
      household.lastName?.toLowerCase().includes(searchLower) ||
      household.primaryContact?.toLowerCase().includes(searchLower) ||
      household.phone?.toLowerCase().includes(searchLower) ||
      household.email?.toLowerCase().includes(searchLower) ||
      household.address?.toLowerCase().includes(searchLower)
    );
  }, [households, searchText]);

  const columns: ColumnsType<HouseholdTableRecord> = [
    {
      title: t('patients:tableColumns.household'),
      dataIndex: 'lastName',
      key: 'lastName',
      width: 200,
      fixed: 'left',
      sorter: (a, b) => (a.lastName || '').localeCompare(b.lastName || ''),
      render: (text, record) => (
        <Space>
          <HomeOutlined className={styles.iconBlue} />
          <div>
            <RouterLink to={`/households/${record.id}`} className={styles.linkClean}>
              <Text strong className={styles.textPrimary}>{text}</Text>
            </RouterLink>
            <br />
            <Text type="secondary" className={styles.textSmall}>
              ID: #{record.id}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: t('patients:tableColumns.primaryContact'),
      dataIndex: 'primaryContact',
      key: 'primaryContact',
      width: 180,
      render: (text) => (
        <Space>
          <Avatar size="small" icon={<UserOutlined />} className={styles.avatarBlue}>
            {text?.charAt(0)}
          </Avatar>
          <Text>{text || t('entities:defaults.noPrimaryContact')}</Text>
        </Space>
      ),
      sorter: (a, b) => (a.primaryContact || '').localeCompare(b.primaryContact || ''),
    },
    {
      title: t('patients:tableColumns.contactInfo'),
      key: 'contactInfo',
      width: 250,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          {record.phone && (
            <Space size={4}>
              <PhoneOutlined className={styles.iconGreen} />
              <Link href={`tel:${record.phone}`}>{record.phone}</Link>
            </Space>
          )}
          {record.email && (
            <Space size={4}>
              <MailOutlined className={styles.iconPrimary} />
              <Link href={`mailto:${record.email}`} className={styles.textSmall}>
                {record.email}
              </Link>
            </Space>
          )}
          {!record.phone && !record.email && (
            <Text type="secondary">{t('entities:defaults.noContactInfo')}</Text>
          )}
        </Space>
      ),
    },
    {
      title: t('patients:tableColumns.pets'),
      dataIndex: 'petCount',
      key: 'petCount',
      width: 100,
      align: 'center',
      render: (count) => (
        <Badge
          count={count || 0}
          style={{
            backgroundColor: count > 0 ? '#52C41A' : '#d9d9d9',
          }}
          overflowCount={99}
        >
          <HeartOutlined className={styles.iconLarge} />
        </Badge>
      ),
      sorter: (a, b) => (a.petCount || 0) - (b.petCount || 0),
    },
    {
      title: t('patients:tableColumns.address'),
      dataIndex: 'address',
      key: 'address',
      width: 200,
      ellipsis: true,
      render: (text) =>
        text ? (
          <Tooltip title={text}>
            <Text ellipsis>{text}</Text>
          </Tooltip>
        ) : (
          <Text type="secondary">{t('entities:defaults.noAddress')}</Text>
        ),
    },
  ];

  // No multi-select row selection since there are no bulk actions

  return (
    <div className="household-table-container">
      <div className={styles.searchContainer}>
        <Space>
          <Input
            placeholder={t('patients:searchHouseholdsPlaceholder')}
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className={styles.searchInput}
            allowClear
          />
          {/* No bulk selection count */}
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={filteredData}
        rowKey="id"
        loading={loading}
        pagination={{
          defaultPageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => t('households:table.total', { start: range[0], end: range[1], total }),
        }}
        scroll={{ x: 1400, y: 'calc(100vh - 300px)' }}
        size="middle"
        bordered
        className="household-data-table"
      />
    </div>
  );
};
