import React, { useState } from 'react';
import { Table, Typography, Tag, Empty, Button, Modal, App, Skeleton, Dropdown, Space } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { invalidatePatientData } from '../../hooks/invalidation';
import { useTranslation } from 'react-i18next';
import { Patient } from '../../types/household';
import { PlusOutlined, MoreOutlined, LinkOutlined } from '@ant-design/icons';
import { MovePetModal, LinkPetModal } from './MovePetModal';
import PatientFormWithOwner from '../../components/forms/PatientFormWithOwner';
import { LoadError } from '../../components/common/LoadError';
import { PatientService } from '../../services/patientService';
import type { CreatePatientInput, UpdatePatientInput } from '../../types';
import styles from './HouseholdDetail.module.css';
import { formatDate } from '../../utils/dateFormatter';
import { formatPatientAge } from '../../utils/patientChart';
import dayjs from 'dayjs';

const { Title } = Typography;

interface AnimalsSectionProps {
  patients: Patient[];
  householdId: number;
  loading?: boolean;
  loadFailed?: boolean;
  retrying?: boolean;
  onRetry?: () => void;
}

export const AnimalsSection: React.FC<AnimalsSectionProps> = ({
  patients,
  householdId,
  loading = false,
  loadFailed = false,
  retrying = false,
  onRetry = () => {},
}) => {
  const { t } = useTranslation('households');
  const navigate = useNavigate();
  const { notification } = App.useApp();
  const queryClient = useQueryClient();
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [movingPet, setMovingPet] = useState<{ id: number; name: string } | null>(null);
  const [isLinkOpen, setIsLinkOpen] = useState(false);

  // A failure goes back to PatientFormWithOwner, which keeps the input and shows why.
  const handleCreatePatient = async (data: CreatePatientInput | UpdatePatientInput) => {
    setSubmitting(true);
    try {
      const patientData = {
        ...data,
        householdId: householdId,
      } as CreatePatientInput;

      const newPatient = await PatientService.createPatient(patientData);
      invalidatePatientData(queryClient);
      notification.success({
        message: t('common:success'),
        description: t('detail.animals.patientCreated'),
        placement: 'bottomRight',
      });
      setIsPatientModalOpen(false);
      navigate(`/patients/${newPatient.id}`);
    } finally {
      setSubmitting(false);
    }
  };

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
        // Frozen at the date of death, like the patient banner.
        const until = record.deceasedAt ? dayjs(record.deceasedAt) : undefined;
        return formatPatientAge(record.dateOfBirth, t, until) ?? '-';
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
      render: (status: string | undefined, record: Patient) => {
        if (status === 'deceased') {
          return (
            <Tag color="default" title={formatDate(record.deceasedAt)}>
              {t('patients:chart.status.deceased')}
            </Tag>
          );
        }
        const isActive = status === 'active' || !status;
        return (
          <Tag color={isActive ? 'green' : 'default'}>
            {isActive ? t('detail.animals.status.active') : t('detail.animals.status.inactive')}
          </Tag>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 56,
      render: (record: Patient) => (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [{ key: 'move', label: t('detail.animals.moveToAnother') }],
            onClick: () => setMovingPet({ id: record.id, name: record.name }),
          }}
        >
          <Button type="text" icon={<MoreOutlined />} aria-label={t('detail.animals.actions')} />
        </Dropdown>
      ),
    },
  ];

  return (
    <div className={styles.sectionContainer}>
      <div className={styles.sectionHeaderRow}>
        <Title level={4}>{t('detail.animals.title')}</Title>
        <Space>
          <Button icon={<LinkOutlined />} onClick={() => setIsLinkOpen(true)}>
            {t('detail.animals.linkExisting')}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsPatientModalOpen(true)}
          >
            {t('detail.animals.registerNewPet')}
          </Button>
        </Space>
      </div>

      <MovePetModal pet={movingPet} householdId={householdId} onClose={() => setMovingPet(null)} />
      <LinkPetModal open={isLinkOpen} householdId={householdId} onClose={() => setIsLinkOpen(false)} />

      {loadFailed ? (
        <LoadError
          title={t('detail.animals.loadFailed')}
          onRetry={onRetry}
          retrying={retrying}
          className={styles.marginBottom24}
        />
      ) : loading ? (
        <Skeleton active className={styles.marginBottom24} />
      ) : patients.length > 0 ? (
        <Table
          columns={columns}
          dataSource={patients}
          rowKey="id"
          pagination={false}
          onRow={(record) => (record.status && record.status !== 'active' ? { style: { opacity: 0.55 } } : {})}
        />
      ) : (
        <Empty
          description={t('detail.animals.noAnimals')}
          className={styles.marginBottom24}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsPatientModalOpen(true)}>
            {t('detail.animals.registerFirstPet')}
          </Button>
        </Empty>
      )}

      <Modal
        title={t('detail.animals.registerNewPet')}
        open={isPatientModalOpen}
        onCancel={() => setIsPatientModalOpen(false)}
        footer={null}
        width={800}
        destroyOnHidden
      >
        <PatientFormWithOwner
          hideHouseholdPicker
          onSubmit={handleCreatePatient}
          onCancel={() => setIsPatientModalOpen(false)}
          loading={submitting}
        />
      </Modal>
    </div>
  );
};