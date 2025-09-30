/**
 * T021: Patient table component with Ant Design
 */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  Tag,
  Button,
  Space,
  Input,
  Tooltip,
  Badge,
  Typography,
  Dropdown,
} from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import {
  SearchOutlined,
  EditOutlined,
  EyeOutlined,
  DeleteOutlined,
  MoreOutlined,
  HeartOutlined,
  CalendarOutlined,
  UserOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import { Patient, PatientWithHousehold } from '../../types';
import type { BaseTableProps } from '../../types/ui.types';
import dayjs from 'dayjs';
import { formatDate } from '../../utils/dateFormatter';
import styles from './Tables.module.css';

const { Text } = Typography;

interface PatientTableProps extends Partial<BaseTableProps<PatientWithHousehold>> {
  patients: PatientWithHousehold[];
  loading?: boolean;
  onView?: (patient: PatientWithHousehold) => void;
  onEdit?: (patient: PatientWithHousehold) => void;
  onDelete?: (patient: PatientWithHousehold) => void;
}

export const PatientTable: React.FC<PatientTableProps> = ({
  patients,
  loading = false,
  onView,
  onEdit,
  onDelete,
}) => {
  const { t } = useTranslation(['patients', 'entities', 'common']);
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!searchText) return patients;

    const searchLower = searchText.toLowerCase();
    return patients.filter(patient =>
      patient.name?.toLowerCase().includes(searchLower) ||
      patient.species?.toLowerCase().includes(searchLower) ||
      patient.breed?.toLowerCase().includes(searchLower) ||
      patient.microchipId?.toLowerCase().includes(searchLower)
    );
  }, [patients, searchText]);

  // Get status color
  const getStatusColor = (isActive: boolean | undefined) => {
    return isActive !== false ? 'success' : 'default';
  };

  // Get species icon/color
  const getSpeciesColor = (species: string) => {
    const speciesColors: Record<string, string> = {
      'Dog': 'blue',
      'Cat': 'purple',
      'Bird': 'cyan',
      'Rabbit': 'magenta',
      'Reptile': 'green',
      'Fish': 'geekblue',
      'Hamster': 'orange',
      'Other': 'default',
    };
    return speciesColors[species] || 'default';
  };

  // Calculate age from date of birth
  const calculateAge = (dateOfBirth: string | undefined) => {
    if (!dateOfBirth) return t('patients:unknownAge');
    const years = dayjs().diff(dayjs(dateOfBirth), 'year');
    const months = dayjs().diff(dayjs(dateOfBirth), 'month') % 12;

    if (years > 0) {
      return `${years} year${years > 1 ? 's' : ''}`;
    }
    return `${months} month${months !== 1 ? 's' : ''}`;
  };

  const columns: ColumnsType<PatientWithHousehold> = [
    {
      title: t('patients:tableColumns.name'),
      dataIndex: 'name',
      key: 'name',
      width: 150,
      fixed: 'left',
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (text, record) => (
        <Space>
          <HeartOutlined className={styles.iconPink} />
          <Button
            type="link"
            className={styles.nameButton}
            onClick={() => navigate(`/patients/${record.id}`)}
          >
            {text}
          </Button>
        </Space>
      ),
    },
    {
      title: t('patients:tableColumns.species'),
      dataIndex: 'species',
      key: 'species',
      width: 100,
      render: (species) => {
        if (!species) return null;

        // Convert species to translation key format
        // Try different formats to find a matching translation
        let speciesKey = species.toLowerCase();

        // For species with spaces, also try with underscore
        if (species.includes(' ')) {
          const underscoreKey = species.toLowerCase().replace(/\s+/g, '_');
          // Try underscore version first, then space version, then camelCase
          const camelKey = species === 'Guinea Pig' ? 'guineaPig' : speciesKey;

          // Try to find which key has a translation
          if (t(`entities:species.${underscoreKey}`, { defaultValue: '' }) !== '') {
            speciesKey = underscoreKey;
          } else if (t(`entities:species.${camelKey}`, { defaultValue: '' }) !== '') {
            speciesKey = camelKey;
          }
        }

        // Try to get the translation, fallback to original species name if not found
        const translatedSpecies = t(`entities:species.${speciesKey}`, { defaultValue: species });

        return (
          <Tag color={getSpeciesColor(species)}>
            {translatedSpecies}
          </Tag>
        );
      },
      filters: [
        { text: t('entities:species.dog'), value: 'Dog' },
        { text: t('entities:species.cat'), value: 'Cat' },
        { text: t('entities:species.bird'), value: 'Bird' },
        { text: t('entities:species.rabbit'), value: 'Rabbit' },
        { text: t('entities:species.other'), value: 'Other' },
      ],
      onFilter: (value, record) => record.species === value,
    },
    {
      title: t('patients:tableColumns.breed'),
      dataIndex: 'breed',
      key: 'breed',
      width: 120,
      ellipsis: true,
      render: (text) => text || <Text type="secondary">-</Text>,
    },
    {
      title: t('patients:tableColumns.age'),
      key: 'age',
      width: 100,
      render: (_, record) => (
        <Tooltip title={t('patients:bornOn', { date: record.dateOfBirth || t('patients:unknownAge') })}>
          <span>
            <Space>
              <CalendarOutlined />
              <Text>{calculateAge(record.dateOfBirth)}</Text>
            </Space>
          </span>
        </Tooltip>
      ),
      sorter: (a, b) => {
        const dateA = a.dateOfBirth ? dayjs(a.dateOfBirth).unix() : 0;
        const dateB = b.dateOfBirth ? dayjs(b.dateOfBirth).unix() : 0;
        return dateA - dateB;
      },
    },
    {
      title: t('patients:tableColumns.gender'),
      dataIndex: 'gender',
      key: 'gender',
      width: 90,
      render: (gender) => {
        const genderColors: Record<string, string> = {
          'Male': 'blue',
          'Female': 'pink',
          'Unknown': 'default',
        };
        const genderKey = gender ? gender.toLowerCase() : null;
        const translatedGender = genderKey ? t(`entities:gender.${genderKey}`) : null;

        return gender ? (
          <Tag color={genderColors[gender] || 'default'}>
            {translatedGender || gender}
          </Tag>
        ) : (
          <Text type="secondary">-</Text>
        );
      },
      filters: [
        { text: t('entities:gender.male'), value: 'Male' },
        { text: t('entities:gender.female'), value: 'Female' },
        { text: t('entities:gender.unknown'), value: 'Unknown' },
      ],
      onFilter: (value, record) => record.gender === value,
    },
    {
      title: t('patients:tableColumns.weight'),
      dataIndex: 'weight',
      key: 'weight',
      width: 100,
      align: 'right',
      render: (weight) =>
        weight ? <Text>{weight.toFixed(1)} kg</Text> : <Text type="secondary">-</Text>,
      sorter: (a, b) => (a.weight || 0) - (b.weight || 0),
    },
    {
      title: t('patients:tableColumns.microchip'),
      dataIndex: 'microchipId',
      key: 'microchipId',
      width: 140,
      ellipsis: true,
      render: (text) => text ? (
        <Tooltip title={text}>
          <span>
            <Text code>{text}</Text>
          </span>
        </Tooltip>
      ) : (
        <Text type="secondary">{t('patients:notChipped')}</Text>
      ),
    },
    {
      title: t('patients:tableColumns.household'),
      key: 'household',
      width: 150,
      ellipsis: true,
      render: (_, record) => {
        if (record.household) {
          return (
            <Tooltip title={record.household.address || t('entities:defaults.noAddress')}>
              <span>
                <Space>
                  <HomeOutlined />
                  <Text>{record.household.householdName}</Text>
                </Space>
              </span>
            </Tooltip>
          );
        }
        return <Text type="secondary">{t('entities:defaults.noHousehold')}</Text>;
      },
    },
    {
      title: t('patients:tableColumns.created'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: (date) => formatDate(date),
      sorter: (a, b) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix(),
    },
  ];

  const rowSelection: TableProps<PatientWithHousehold>['rowSelection'] = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
  };

  return (
    <div className="patient-table-container">
      <div className={styles.searchContainer}>
        <Space>
          <Input
            placeholder={t('patients:searchPlaceholder')}
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className={styles.searchInput}
            allowClear
          />
          {selectedRowKeys.length > 0 && (
            <Text>
              {t('patients:selectedCount', { count: selectedRowKeys.length })}
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
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} patients`,
        }}
        scroll={{ x: 1500, y: 'calc(100vh - 300px)' }}
        size="middle"
        bordered
        className="patient-data-table"
      />
    </div>
  );
};