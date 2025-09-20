/**
 * T021: Patient table component with Ant Design
 */

import React, { useState, useMemo } from 'react';
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
    if (!dateOfBirth) return 'Unknown';
    const years = dayjs().diff(dayjs(dateOfBirth), 'year');
    const months = dayjs().diff(dayjs(dateOfBirth), 'month') % 12;

    if (years > 0) {
      return `${years} year${years > 1 ? 's' : ''}`;
    }
    return `${months} month${months !== 1 ? 's' : ''}`;
  };

  const columns: ColumnsType<PatientWithHousehold> = [
    {
      title: 'Status',
      key: 'status',
      width: 80,
      align: 'center',
      fixed: 'left',
      render: (_, record) => (
        <Tooltip title={record.isActive !== false ? 'Active' : 'Inactive'}>
          <span>
            <Badge
              status={record.isActive !== false ? 'success' : 'default'}
              text=""
            />
          </span>
        </Tooltip>
      ),
      filters: [
        { text: 'Active', value: true },
        { text: 'Inactive', value: false },
      ],
      onFilter: (value, record) => (record.isActive !== false) === value,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      fixed: 'left',
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (text) => (
        <Space>
          <HeartOutlined style={{ color: '#ff69b4' }} />
          <Text strong>{text}</Text>
        </Space>
      ),
    },
    {
      title: 'Species',
      dataIndex: 'species',
      key: 'species',
      width: 100,
      render: (species) => (
        <Tag color={getSpeciesColor(species)}>
          {species}
        </Tag>
      ),
      filters: [
        { text: 'Dog', value: 'Dog' },
        { text: 'Cat', value: 'Cat' },
        { text: 'Bird', value: 'Bird' },
        { text: 'Rabbit', value: 'Rabbit' },
        { text: 'Other', value: 'Other' },
      ],
      onFilter: (value, record) => record.species === value,
    },
    {
      title: 'Breed',
      dataIndex: 'breed',
      key: 'breed',
      width: 120,
      ellipsis: true,
      render: (text) => text || <Text type="secondary">-</Text>,
    },
    {
      title: 'Age',
      key: 'age',
      width: 100,
      render: (_, record) => (
        <Tooltip title={`Born: ${record.dateOfBirth || 'Unknown'}`}>
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
      title: 'Gender',
      dataIndex: 'gender',
      key: 'gender',
      width: 90,
      render: (gender) => {
        const genderColors: Record<string, string> = {
          'Male': 'blue',
          'Female': 'pink',
          'Unknown': 'default',
        };
        return gender ? (
          <Tag color={genderColors[gender] || 'default'}>
            {gender}
          </Tag>
        ) : (
          <Text type="secondary">-</Text>
        );
      },
      filters: [
        { text: 'Male', value: 'Male' },
        { text: 'Female', value: 'Female' },
        { text: 'Unknown', value: 'Unknown' },
      ],
      onFilter: (value, record) => record.gender === value,
    },
    {
      title: 'Weight (kg)',
      dataIndex: 'weight',
      key: 'weight',
      width: 100,
      align: 'right',
      render: (weight) =>
        weight ? <Text>{weight.toFixed(1)} kg</Text> : <Text type="secondary">-</Text>,
      sorter: (a, b) => (a.weight || 0) - (b.weight || 0),
    },
    {
      title: 'Microchip',
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
        <Text type="secondary">Not chipped</Text>
      ),
    },
    {
      title: 'Household',
      key: 'household',
      width: 150,
      ellipsis: true,
      render: (_, record) => {
        if (record.household) {
          return (
            <Tooltip title={record.household.address || 'No address'}>
              <span>
                <Space>
                  <HomeOutlined />
                  <Text>{record.household.householdName}</Text>
                </Space>
              </span>
            </Tooltip>
          );
        }
        return <Text type="secondary">No household</Text>;
      },
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: (date) => dayjs(date).format('MMM D, YYYY'),
      sorter: (a, b) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix(),
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 120,
      render: (_, record) => {
        const menuItems = [
          {
            key: 'view',
            icon: <EyeOutlined />,
            label: 'View Details',
            onClick: () => onView?.(record),
          },
          {
            key: 'edit',
            icon: <EditOutlined />,
            label: 'Edit',
            onClick: () => onEdit?.(record),
          },
          {
            type: 'divider' as const,
          },
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            label: 'Delete',
            danger: true,
            onClick: () => onDelete?.(record),
          },
        ];

        return (
          <Space size="small">
            <Tooltip title="View">
              <span>
                <Button
                  type="text"
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => onView?.(record)}
                />
              </span>
            </Tooltip>
            <Tooltip title="Edit">
              <span>
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => onEdit?.(record)}
                />
              </span>
            </Tooltip>
            <Dropdown
              menu={{ items: menuItems }}
              trigger={['click']}
            >
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined />}
              />
            </Dropdown>
          </Space>
        );
      },
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
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Input
            placeholder="Search patients..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
            allowClear
          />
          {selectedRowKeys.length > 0 && (
            <Text>
              {selectedRowKeys.length} patient{selectedRowKeys.length > 1 ? 's' : ''} selected
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