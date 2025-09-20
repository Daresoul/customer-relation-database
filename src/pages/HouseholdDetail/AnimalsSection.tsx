import React from 'react';
import { Table, Typography, Tag, Empty, Button } from 'antd';
import { Link } from 'react-router-dom';
import { Patient } from '../../types/household';
import { PlusOutlined } from '@ant-design/icons';

const { Title } = Typography;

interface AnimalsSectionProps {
  patients: Patient[];
  householdId: number;
}

export const AnimalsSection: React.FC<AnimalsSectionProps> = ({ patients, householdId }) => {
  console.log(`AnimalsSection: Received ${patients.length} patients for household ${householdId}:`, patients);

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Patient) => (
        <Link to={`/patients/${record.id}`}>{text}</Link>
      ),
    },
    {
      title: 'Species',
      dataIndex: 'species',
      key: 'species',
      render: (text: string) => text.charAt(0).toUpperCase() + text.slice(1),
    },
    {
      title: 'Breed',
      dataIndex: 'breed',
      key: 'breed',
      render: (text: string | null) => text || '-',
    },
    {
      title: 'Age',
      key: 'age',
      render: (record: Patient) => {
        if (!record.dateOfBirth) return '-';
        const birthDate = new Date(record.dateOfBirth);
        const today = new Date();
        const ageInYears = Math.floor((today.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

        if (ageInYears < 1) {
          const ageInMonths = Math.floor((today.getTime() - birthDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
          return `${ageInMonths} month${ageInMonths !== 1 ? 's' : ''}`;
        }
        return `${ageInYears} year${ageInYears !== 1 ? 's' : ''}`;
      },
    },
    {
      title: 'Gender',
      dataIndex: 'gender',
      key: 'gender',
      render: (gender: string | undefined) => {
        if (!gender) return '-';
        const colors: Record<string, string> = {
          male: 'blue',
          female: 'pink',
          unknown: 'default'
        };
        return <Tag color={colors[gender] || 'default'}>{gender.charAt(0).toUpperCase() + gender.slice(1)}</Tag>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string | undefined) => {
        const isActive = status === 'active' || !status;
        return (
          <Tag color={isActive ? 'green' : 'default'}>
            {isActive ? 'Active' : 'Inactive'}
          </Tag>
        );
      },
    },
  ];

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4}>Associated Animals</Title>
        <Link to={`/patients/new?householdId=${householdId}`}>
          <Button type="primary" icon={<PlusOutlined />}>
            Register New Pet
          </Button>
        </Link>
      </div>

      {patients.length > 0 ? (
        <Table
          columns={columns}
          dataSource={patients}
          rowKey="id"
          pagination={false}
        />
      ) : (
        <Empty
          description="No pets registered for this household"
          style={{ marginBottom: 24 }}
        >
          <Link to={`/patients/new?householdId=${householdId}`}>
            <Button type="primary">Register First Pet</Button>
          </Link>
        </Empty>
      )}
    </div>
  );
};