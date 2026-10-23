import React, { useState } from 'react';
import { App, Button, Dropdown, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  AlertOutlined,
  DeleteOutlined,
  DownOutlined,
  HomeOutlined,
  PlusOutlined,
  PoweroffOutlined,
  StopOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { PatientDetail } from '../../../types/patient';
import { AlertChips } from '../../../components/patient/AlertChips';
import { WeightSparkline } from '../../../components/patient/WeightSparkline';
import { usePatientWeights, useReactivatePatient } from '../../../hooks/usePatientChart';
import { formatPatientAge, patientStatus, sexLabel } from '../../../utils/patientChart';
import { formatDate } from '../../../utils/dateFormatter';
import { formatKg } from './WeightLogCard';
import { AddWeightModal } from './AddWeightModal';
import { AlertsModal } from './AlertsModal';
import { MarkDeceasedModal } from './MarkDeceasedModal';
import { MarkInactiveModal } from './MarkInactiveModal';
import styles from './PatientChart.module.css';

const { Text } = Typography;

interface PatientBannerProps {
  patient: PatientDetail;
  /** Hard delete; the backend refuses it for a patient with history. */
  onDelete: () => void;
}

type Dialog = 'weight' | 'alerts' | 'deceased' | 'inactive' | null;

function ownerPhone(patient: PatientDetail): string | undefined {
  const contacts = patient.household?.primaryContact?.contacts ?? [];
  const phones = contacts.filter((c) => c.type === 'phone' || c.type === 'mobile');
  return (phones.find((c) => c.isPrimary) ?? phones[0])?.value;
}

/** Who this animal is, in the first glance: signalment, weight, owner, alerts and status. */
export const PatientBanner: React.FC<PatientBannerProps> = ({ patient, onDelete }) => {
  const { t } = useTranslation(['patients', 'entities', 'common']);
  const { modal } = App.useApp();
  const [dialog, setDialog] = useState<Dialog>(null);
  const { data: weights = [] } = usePatientWeights(patient.id);
  const reactivate = useReactivatePatient();

  const name = patient.name || t('entities:defaults.noName');
  const status = patientStatus(patient);
  const deceased = status === 'deceased';
  const alerts = patient.alerts ?? [];

  const species = patient.species
    ? t(`entities:species.${patient.species.toLowerCase()}`, { defaultValue: patient.species })
    : null;
  const signalment = [species, patient.breed].filter(Boolean).join(' · ');
  const sex = sexLabel(patient.gender, patient.neutered, t);
  const age = formatPatientAge(patient.dateOfBirth, t, deceased ? dayjs(patient.deceasedAt) : undefined);
  const owner = patient.household?.primaryContact;
  const phone = ownerPhone(patient);

  const confirmReactivate = () =>
    modal.confirm({
      title: t('patients:chart.reactivate.title', { name }),
      content: t('patients:chart.reactivate.body'),
      okText: t('patients:chart.reactivate.confirm'),
      cancelText: t('common:cancel'),
      onOk: () => reactivate.mutateAsync({ id: patient.id, name }).catch(() => {}),
    });

  const menuItems: MenuProps['items'] = [
    ...(status === 'active'
      ? [
          { key: 'deceased', icon: <StopOutlined />, label: t('patients:chart.banner.markDeceased') },
          { key: 'inactive', icon: <PoweroffOutlined />, label: t('patients:chart.banner.markInactive') },
        ]
      : [{ key: 'reactivate', icon: <UndoOutlined />, label: t('patients:chart.banner.reactivate') }]),
    ...(status === 'inactive'
      ? [{ key: 'deceased', icon: <StopOutlined />, label: t('patients:chart.banner.markDeceased') }]
      : []),
    { type: 'divider' as const },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      danger: true,
      label: t('patients:deletePatient'),
      title: t('patients:chart.banner.deleteHint'),
    },
  ];

  const onMenu: MenuProps['onClick'] = ({ key }) => {
    if (key === 'deceased') setDialog('deceased');
    else if (key === 'inactive') setDialog('inactive');
    else if (key === 'reactivate') confirmReactivate();
    else if (key === 'delete') onDelete();
  };

  return (
    <section
      className={styles.banner}
      data-status={status}
      data-alert={alerts.length > 0 && status === 'active' ? 'true' : undefined}
      aria-label={name}
    >
      <div className={styles.topRow}>
        <div className={styles.identity}>
          <Typography.Title level={3} className={styles.name}>
            {name}
          </Typography.Title>
          {deceased && (
            <Tag color="default">
              {t('patients:chart.status.deceasedOn', { date: formatDate(patient.deceasedAt) })}
            </Tag>
          )}
          {status === 'inactive' && <Tag color="default">{t('patients:chart.status.inactive')}</Tag>}
          <AlertChips alerts={alerts} />
        </div>
        <div className={styles.actions}>
          {!deceased && (
            <Button icon={<PlusOutlined />} onClick={() => setDialog('weight')}>
              {t('patients:chart.banner.addWeight')}
            </Button>
          )}
          <Button icon={<AlertOutlined />} onClick={() => setDialog('alerts')}>
            {t('patients:chart.banner.editAlerts')}
          </Button>
          <Dropdown menu={{ items: menuItems, onClick: onMenu }} trigger={['click']}>
            <Button aria-label={t('patients:chart.banner.more')}>
              {t('patients:chart.banner.more')} <DownOutlined />
            </Button>
          </Dropdown>
        </div>
      </div>

      <div className={styles.facts}>
        {signalment && <span className={styles.fact}>{signalment}</span>}
        {sex && <span className={styles.fact}>{sex}</span>}
        {age && (
          <span className={styles.fact} title={deceased ? t('patients:chart.age.atDeath') : undefined}>
            {age}
          </span>
        )}
        <span className={styles.fact}>
          {patient.weight ? (
            <Text>
              {patient.lastWeightAt
                ? t('patients:chart.banner.weightOn', { weight: formatKg(patient.weight), date: formatDate(patient.lastWeightAt) })
                : t('patients:units.weightKg', { weight: formatKg(patient.weight) })}
            </Text>
          ) : (
            <Text type="secondary">{t('patients:chart.banner.noWeight')}</Text>
          )}
          <WeightSparkline weights={weights} label={t('patients:chart.weights.trend')} />
        </span>
        <span className={styles.fact}>
          <HomeOutlined />
          {owner ? (
            <>
              <Link to={`/households/${patient.household!.id}`}>{`${owner.firstName} ${owner.lastName}`.trim()}</Link>
              {phone && (
                <Text copyable={{ text: phone, tooltips: [t('patients:chart.banner.copyPhone'), t('patients:chart.banner.phoneCopied')] }}>
                  {phone}
                </Text>
              )}
            </>
          ) : (
            <Text type="secondary">{t('patients:chart.banner.noOwner')}</Text>
          )}
        </span>
      </div>

      {(patient.deceasedNote || (status === 'inactive' && patient.inactiveReason)) && (
        <div className={styles.statusNote}>
          <Text type="secondary">
            {deceased
              ? patient.deceasedNote
              : t('patients:chart.status.inactiveReason', { reason: patient.inactiveReason })}
          </Text>
        </div>
      )}

      <AddWeightModal open={dialog === 'weight'} patient={{ id: patient.id, name }} onClose={() => setDialog(null)} />
      <AlertsModal
        open={dialog === 'alerts'}
        patient={{ id: patient.id, name, alerts }}
        onClose={() => setDialog(null)}
      />
      <MarkDeceasedModal open={dialog === 'deceased'} patient={{ id: patient.id, name }} onClose={() => setDialog(null)} />
      <MarkInactiveModal open={dialog === 'inactive'} patient={{ id: patient.id, name }} onClose={() => setDialog(null)} />
    </section>
  );
};

export default PatientBanner;
