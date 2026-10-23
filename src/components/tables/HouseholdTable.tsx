/**
 * T022: Household table component with Ant Design
 */

import React, { useState, useMemo } from 'react';
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
import styles from './Tables.module.css';

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
      <div className={styles.expandedRow}>
        <div className={styles.expandedGrid}>
          {/* Left Column - Family Members */}
          <div>
            <Space direction="vertical" className={styles.fullWidth} size="middle">
              <Text strong className={styles.textMedium}>
                <TeamOutlined /> {t('patients:familyMembers', { count: contacts.length })}
              </Text>
              <List
                size="small"
                dataSource={contacts}
                renderItem={(contact) => (
                  <List.Item className={styles.listItem}>
                    <List.Item.Meta
                      avatar={
                        <Avatar
                          icon={<UserOutlined />}
                          className={styles.avatarPrimary}
                          style={{
                            background: contact.role === t('entities:roles.primaryContact') ? '#52C41A' : '#4A90E2',
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
                            <Text type="secondary" className={styles.textSmall}>
                              ({contact.relationship})
                            </Text>
                          )}
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={4}>
                          {contact.phone && (
                            <span>
                              <PhoneOutlined className={styles.marginRight8} />
                              {contact.phone}
                            </span>
                          )}
                          {contact.email && (
                            <span>
                              <MailOutlined className={styles.marginRight8} />
                              {contact.email}
                            </span>
                          )}
                          {!contact.phone && !contact.email && (
                            <Text type="secondary" className={styles.textItalic}>
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
            <Space direction="vertical" className={styles.fullWidth} size="middle">
              <Text strong className={styles.textMedium}>
                <HomeOutlined /> {t('households:table.details')}
              </Text>

              <div className={styles.detailCard}>
                <Space direction="vertical" size="middle" className={styles.fullWidth}>
                  <div>
                    <Text type="secondary">{t('households:table.householdName')}</Text>
                    <br />
                    <Text strong className={styles.textMedium}>{record.lastName || t('households:table.notSpecified')}</Text>
                  </div>

                  {record.address && (
                    <div>
                      <Text type="secondary">{t('households:table.address')}</Text>
                      <br />
                      <Text>{record.address}</Text>
                    </div>
                  )}

                  <div>
                    <Text type="secondary">{t('households:table.petCount')}</Text>
                    <br />
                    <Badge
                      count={record.petCount || 0}
                      style={{ backgroundColor: record.petCount > 0 ? '#52C41A' : '#595959' }}
                      showZero
                    />
                    {record.petCount > 0 && (
                      <Text type="secondary" className={styles.marginLeft8}>
                        {t('households:table.viewPetsHint')}
                      </Text>
                    )}
                  </div>

                  {record.notes && (
                    <div>
                      <Text type="secondary">{t('households:table.notes')}</Text>
                      <br />
                      <Text className={styles.textItalic}>{record.notes}</Text>
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
                  {t('households:table.addPet')}
                </Button>
                <Button
                  icon={<EditOutlined />}
                  size="small"
                  onClick={() => onEdit?.(record)}
                >
                  {t('patients:editHousehold')}
                </Button>
                <Button
                  icon={<EyeOutlined />}
                  size="small"
                  onClick={() => onView?.(record)}
                >
                  {t('households:table.viewFullDetails')}
                </Button>
              </Space>
            </Space>
          </div>
        </div>
      </div>
    );
  };

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
