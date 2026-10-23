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
  Typography,
  Switch,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  SearchOutlined,
  HeartOutlined,
  CalendarOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import { PatientWithHousehold } from '../../types';
import type { BaseTableProps } from '../../types/ui.types';
import dayjs from 'dayjs';
import { formatPatientAge } from '../../utils/patientChart';
import { formatDate } from '../../utils/dateFormatter';
import styles from './Tables.module.css';
import { AlertChips } from '../patient/AlertChips';
import { patientStatus, visiblePatients } from '../../utils/patientChart';
import { speciesLabel } from '../../utils/species';

const { Text } = Typography;

interface PatientTableProps extends Partial<BaseTableProps<PatientWithHousehold>> {
  patients: PatientWithHousehold[];
  loading?: boolean;
  searchText?: string;
  onSearchTextChange?: (text: string) => void;
}

export const PatientTable: React.FC<PatientTableProps> = ({
  patients,
  loading = false,
  searchText: controlledSearchText,
  onSearchTextChange,
}) => {
  const { t } = useTranslation(['patients', 'entities', 'common']);
  const navigate = useNavigate();
  const [internalSearchText, setInternalSearchText] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const isSearchControlled = controlledSearchText !== undefined;
  const searchText = isSearchControlled ? controlledSearchText : internalSearchText;
  const setSearchText = (text: string) => {
    if (!isSearchControlled) setInternalSearchText(text);
    onSearchTextChange?.(text);
  };


  // Filter choices: the species these patients actually have.
  const speciesFilters = Array.from(new Set(patients.map((p) => p.species).filter((s): s is string => !!s)))
    .map((species) => ({ text: speciesLabel(t, species), value: species }))
    .sort((a, b) => a.text.localeCompare(b.text));

  // Filter data based on search
  const filteredData = useMemo(() => {
    const shown = visiblePatients(patients, showInactive);
    if (!searchText) return shown;

    const searchLower = searchText.toLowerCase();
    return shown.filter(patient =>
      patient.name?.toLowerCase().includes(searchLower) ||
      patient.species?.toLowerCase().includes(searchLower) ||
      patient.breed?.toLowerCase().includes(searchLower) ||
      patient.microchipId?.toLowerCase().includes(searchLower)
    );
  }, [patients, searchText, showInactive]);

  const calculateAge = (dateOfBirth: string | undefined) =>
    formatPatientAge(dateOfBirth, t) ?? t('patients:unknownAge');

  const columns: ColumnsType<PatientWithHousehold> = [
    {
      title: t('patients:tableColumns.name'),
      dataIndex: 'name',
      key: 'name',
      width: 150,
      fixed: 'left',
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (text, record) => {
        // Use a localized placeholder when the name is NULL so the row stays
        // clickable. Microchip-only patients show "No name" rather than the
        // chip number, since that's available in its own column.
        const hasName = !!text;
        const display = hasName ? text : t('entities:defaults.noName', 'No name');
        const status = patientStatus(record);
        return (
          <Space size={4} wrap>
            <HeartOutlined className={styles.iconPink} />
            <Button
              type="link"
              className={styles.nameButton}
              onClick={() => navigate(`/patients/${record.id}`)}
              style={hasName ? undefined : { fontStyle: 'italic', opacity: 0.65 }}
            >
              {display}
            </Button>
            {status !== 'active' && (
              <Tag color="default">{t(`patients:chart.status.${status}`)}</Tag>
            )}
            <AlertChips alerts={record.alerts} compact />
          </Space>
        );
      },
    },
    {
      title: t('patients:tableColumns.species'),
      dataIndex: 'species',
      key: 'species',
      width: 120,
      render: (species) => {
        if (!species) return null;

        return <Text>{speciesLabel(t, species)}</Text>;
      },
      filters: speciesFilters,
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
        weight ? <Text>{t('patients:units.weightKg', { weight: weight.toFixed(1) })}</Text> : <Text type="secondary">-</Text>,
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

  // No multi-select row selection since there are no bulk actions

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
          <Space size={6}>
            <Switch size="small" checked={showInactive} onChange={setShowInactive} aria-label={t('patients:chart.list.showInactive')} />
            <Text type="secondary">{t('patients:chart.list.showInactive')}</Text>
          </Space>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={filteredData}
        rowKey="id"
        loading={loading}
        onRow={(record) => (patientStatus(record) === 'active' ? {} : { style: { opacity: 0.55 } })}
        pagination={{
          defaultPageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => t('patients:tableTotal', { start: range[0], end: range[1], total }),
        }}
        scroll={{ x: 1500, y: 'calc(100vh - 300px)' }}
        size="middle"
        bordered
        className="patient-data-table"
      />
    </div>
  );
};
