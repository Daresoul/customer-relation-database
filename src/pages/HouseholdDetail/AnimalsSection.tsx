import React from 'react';
import { Table, Typography, Tag, Empty, Button } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Patient } from '../../types/household';
import { PlusOutlined } from '@ant-design/icons';

const { Title } = Typography;

interface AnimalsSectionProps {
  patients: Patient[];
  householdId: number;
}

export const AnimalsSection: React.FC<AnimalsSectionProps> = ({ patients, householdId }) => {
  const { t } = useTranslation('households');

  const columns = [
    {
      title: t('detail.animals.columns.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Patient) => (
        <Link to={`/patients/${record.id}`}>{text}</Link>
      ),
    },
    {
      title: t('detail.animals.columns.species'),
      dataIndex: 'species',
      key: 'species',
      render: (text: string) => {
        const speciesKey = text ? text.toLowerCase() : null;
        return speciesKey ? t(`entities:species.${speciesKey}`, { defaultValue: text }) : '-';
      },
    },
    {
      title: t('detail.animals.columns.breed'),
      dataIndex: 'breed',
      key: 'breed',
      render: (text: string | null) => text || '-',
    },
    {
      title: t('detail.animals.columns.age'),
      key: 'age',
      render: (record: Patient) => {
        if (!record.dateOfBirth) return '-';
        const birthDate = new Date(record.dateOfBirth);
        const today = new Date();
        const ageInYears = Math.floor((today.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

        if (ageInYears < 1) {
          const ageInMonths = Math.floor((today.getTime() - birthDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
          return t('detail.animals.age.months', { count: ageInMonths });
        }
        return t('detail.animals.age.years', { count: ageInYears });
      },
    },
    {
      title: t('detail.animals.columns.gender'),
      dataIndex: 'gender',
      key: 'gender',
      render: (gender: string | undefined) => {
        if (!gender) return '-';
        const colors: Record<string, string> = {
          male: 'blue',
          female: 'pink',
          unknown: 'default'
        };
        const genderKey = gender.toLowerCase();
        const translatedGender = t(`entities:gender.${genderKey}`, { defaultValue: gender });
        return <Tag color={colors[gender] || 'default'}>{translatedGender}</Tag>;
      },
    },
    {
      title: t('detail.animals.columns.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string | undefined) => {
        const isActive = status === 'active' || !status;
        return (
          <Tag color={isActive ? 'green' : 'default'}>
            {isActive ? t('detail.animals.status.active') : t('detail.animals.status.inactive')}
          </Tag>
        );
      },
    },
  ];

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4}>{t('detail.animals.title')}</Title>
        <Link to={`/patients/new?householdId=${householdId}`}>
          <Button type="primary" icon={<PlusOutlined />}>
            {t('detail.animals.registerNewPet')}
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
          description={t('detail.animals.noAnimals')}
          style={{ marginBottom: 24 }}
        >
          <Link to={`/patients/new?householdId=${householdId}`}>
            <Button type="primary">{t('detail.animals.registerFirstPet')}</Button>
          </Link>
        </Empty>
      )}
    </div>
  );
};