/**
 * T022: Household table component with Ant Design
 */

import React, { useState, useMemo } from 'react';
import { formatDate } from '../../utils/dateFormatter';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import {
  Table,
  Tag,
  Button,
  Space,
  Input,
  Tooltip,
  Badge,
  Typography,
  Avatar,
  List,
} from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import {
  SearchOutlined,
  EditOutlined,
  EyeOutlined,
  DeleteOutlined,
  HomeOutlined,
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
  TeamOutlined,
  HeartOutlined,
} from '@ant-design/icons';
import type { HouseholdTableRecord } from '../../types/ui.types';

const { Text, Link } = Typography;

interface HouseholdTableProps {
  households: HouseholdTableRecord[];
  loading?: boolean;
  onView?: (household: HouseholdTableRecord) => void;
  onEdit?: (household: HouseholdTableRecord) => void;
  onDelete?: (household: HouseholdTableRecord) => void;
  onAddPatient?: (household: HouseholdTableRecord) => void;
}

export const HouseholdTable: React.FC<HouseholdTableProps> = ({
  households,
  loading = false,
  onView,
  onEdit,
  onDelete,
  onAddPatient,
}) => {
  const { t } = useTranslation(['patients', 'entities', 'common']);
  const [searchText, setSearchText] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

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

  // Get activity status color
  const getActivityStatus = (lastActivity?: string) => {
    if (!lastActivity) return { color: 'default', text: t('entities:defaults.noActivity') };

    const daysSince = Math.floor(
      (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSince <= 30) return { color: 'success', text: t('entities:status.active') };
    if (daysSince <= 90) return { color: 'warning', text: t('entities:status.recent') };
    return { color: 'default', text: t('entities:status.inactive') };
  };

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
          <HomeOutlined style={{ color: '#4A90E2' }} />
          <div>
            <RouterLink to={`/households/${record.id}`} style={{ textDecoration: 'none' }}>
              <Text strong style={{ color: '#1890ff', cursor: 'pointer' }}>{text}</Text>
            </RouterLink>
            <br />
            <Text type="secondary" style={{ fontSize: '12px' }}>
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
          <Avatar size="small" icon={<UserOutlined />} style={{ background: '#4A90E2' }}>
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
              <PhoneOutlined style={{ color: '#52C41A' }} />
              <Link href={`tel:${record.phone}`}>{record.phone}</Link>
            </Space>
          )}
          {record.email && (
            <Space size={4}>
              <MailOutlined style={{ color: '#1890ff' }} />
              <Link href={`mailto:${record.email}`} style={{ fontSize: '12px' }}>
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
          <HeartOutlined style={{ fontSize: '20px', color: '#ff69b4' }} />
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
          <Text type="secondary">No address</Text>
        ),
    },
    {
      title: t('patients:tableColumns.status'),
      key: 'status',
      width: 100,
      render: (_, record) => {
        const status = getActivityStatus(record.lastActivity);
        return <Tag color={status.color}>{status.text}</Tag>;
      },
      filters: [
        { text: t('entities:status.active'), value: 'active' },
        { text: t('entities:status.recent'), value: 'recent' },
        { text: t('entities:status.inactive'), value: 'inactive' },
      ],
      onFilter: (value, record) => {
        const status = getActivityStatus(record.lastActivity);
        return status.text.toLowerCase() === value;
      },
    },
    {
      title: t('patients:tableColumns.lastActivity'),
      dataIndex: 'lastActivity',
      key: 'lastActivity',
      width: 120,
      render: (date) =>
        date ? (
          <Tooltip title={new Date(date).toLocaleString()}>
            <Text>{formatDate(date)}</Text>
          </Tooltip>
        ) : (
          <Text type="secondary">{t('common:never')}</Text>
        ),
      sorter: (a, b) => {
        const dateA = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
        const dateB = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
        return dateA - dateB;
      },
    },
  ];

  const expandedRowRender = (record: HouseholdTableRecord) => {
    // Use actual contacts from record if available, otherwise use primary contact
    const contacts = record.contacts && record.contacts.length > 0
      ? record.contacts.map((c, index) => ({
          id: index,
          name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || t('entities:defaults.unknown'),
          role: c.isPrimary ? t('entities:roles.primaryContact') : t('entities:roles.familyMember'),
          phone: c.phone,
          email: c.email,
          relationship: c.relationship
        }))
      : record.primaryContact ? [{
          id: 1,
          name: record.primaryContact,
          role: t('entities:roles.primaryContact'),
          phone: record.phone,
          email: record.email,
          relationship: null
        }] : [];

    return (
      <div style={{ padding: '20px', background: '#1a1a1a', borderRadius: '8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Left Column - Family Members */}
          <div>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Text strong style={{ fontSize: '16px' }}>
                <TeamOutlined /> {t('patients:familyMembers', { count: contacts.length })}
              </Text>
              <List
                size="small"
                dataSource={contacts}
                renderItem={(contact) => (
                  <List.Item style={{ borderBottom: '1px solid #303030' }}>
                    <List.Item.Meta
                      avatar={
                        <Avatar
                          icon={<UserOutlined />}
                          style={{
                            background: contact.role === t('entities:roles.primaryContact') ? '#52C41A' : '#4A90E2',
                            fontSize: '18px'
                          }}
                          size={42}
                        >
                          {contact.name?.charAt(0)?.toUpperCase()}
                        </Avatar>
                      }
                      title={
                        <Space>
                          <Text strong>{contact.name || t('entities:defaults.noName')}</Text>
                          <Tag color={contact.role === t('entities:roles.primaryContact') ? 'green' : 'blue'}>
                            {contact.role}
                          </Tag>
                          {contact.relationship && (
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                              ({contact.relationship})
                            </Text>
                          )}
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={4}>
                          {contact.phone && (
                            <span>
                              <PhoneOutlined style={{ marginRight: 8 }} />
                              {contact.phone}
                            </span>
                          )}
                          {contact.email && (
                            <span>
                              <MailOutlined style={{ marginRight: 8 }} />
                              {contact.email}
                            </span>
                          )}
                          {!contact.phone && !contact.email && (
                            <Text type="secondary" style={{ fontStyle: 'italic' }}>
                              {t('entities:defaults.noContactInfo')}
                            </Text>
                          )}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </Space>
          </div>

          {/* Right Column - Household Details */}
          <div>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Text strong style={{ fontSize: '16px' }}>
                <HomeOutlined /> Household Details
              </Text>

              <div style={{ background: '#262626', padding: '16px', borderRadius: '8px' }}>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <div>
                    <Text type="secondary">Household Name:</Text>
                    <br />
                    <Text strong style={{ fontSize: '16px' }}>{record.lastName || 'Not specified'}</Text>
                  </div>

                  {record.address && (
                    <div>
                      <Text type="secondary">Address:</Text>
                      <br />
                      <Text>{record.address}</Text>
                    </div>
                  )}

                  <div>
                    <Text type="secondary">Number of Pets:</Text>
                    <br />
                    <Badge
                      count={record.petCount || 0}
                      style={{ backgroundColor: record.petCount > 0 ? '#52C41A' : '#595959' }}
                      showZero
                    />
                    {record.petCount > 0 && (
                      <Text type="secondary" style={{ marginLeft: 8 }}>
                        View household page to see all pets
                      </Text>
                    )}
                  </div>

                  <div>
                    <Text type="secondary">Last Activity:</Text>
                    <br />
                    <Text>{record.lastActivity ? formatDate(record.lastActivity) : 'Never'}</Text>
                  </div>

                  <div>
                    <Text type="secondary">Status:</Text>
                    <br />
                    <Tag color={getActivityStatus(record.lastActivity).color}>
                      {getActivityStatus(record.lastActivity).text}
                    </Tag>
                  </div>

                  {record.notes && (
                    <div>
                      <Text type="secondary">Notes:</Text>
                      <br />
                      <Text style={{ fontStyle: 'italic' }}>{record.notes}</Text>
                    </div>
                  )}
                </Space>
              </div>

              {/* Quick Actions */}
              <Space wrap>
                <Button
                  type="primary"
                  icon={<HeartOutlined />}
                  size="small"
                  onClick={() => onAddPatient?.(record)}
                >
                  Add Pet
                </Button>
                <Button
                  icon={<EditOutlined />}
                  size="small"
                  onClick={() => onEdit?.(record)}
                >
                  Edit Household
                </Button>
                <Button
                  icon={<EyeOutlined />}
                  size="small"
                  onClick={() => onView?.(record)}
                >
                  View Full Details
                </Button>
              </Space>
            </Space>
          </div>
        </div>
      </div>
    );
  };

  const rowSelection: TableProps<HouseholdTableRecord>['rowSelection'] = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
  };

  return (
    <div className="household-table-container">
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Input
            placeholder={t('patients:searchHouseholdsPlaceholder')}
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
            allowClear
          />
          {selectedRowKeys.length > 0 && (
            <Text>
              {selectedRowKeys.length} household{selectedRowKeys.length > 1 ? 's' : ''} selected
            </Text>
          )}
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={filteredData}
        rowKey="id"
        loading={loading}
        rowSelection={rowSelection}
        pagination={{
          defaultPageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} households`,
        }}
        scroll={{ x: 1400, y: 'calc(100vh - 300px)' }}
        size="middle"
        bordered
        className="household-data-table"
      />
    </div>
  );
};