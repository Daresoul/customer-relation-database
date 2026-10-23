import React, { useEffect, useMemo, useRef } from 'react';
import { Select, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useMedicalRecords } from '@/hooks/useMedicalRecords';
import type { MedicalRecord } from '@/types/medical';
import { formatDate } from '@/utils/dateFormatter';

/** Picked when the result should go on a new record instead. */
export const NEW_RECORD = -1;

interface PatientRecordSelectProps {
  patientId?: number;
  value?: number;
  onChange: (recordId?: number) => void;
  /** Offer "New lab record" as an option. */
  allowNew?: boolean;
  'data-testid'?: string;
}

const isToday = (iso: string) => dayjs(iso).isSame(dayjs(), 'day');

/**
 * The patient's records, newest first, for attaching a lab result. Picks
 * today's record by itself when the patient has one.
 */
const PatientRecordSelect: React.FC<PatientRecordSelectProps> = ({
  patientId,
  value,
  onChange,
  allowNew,
  'data-testid': testId = 'record-select',
}) => {
  const { t } = useTranslation('devices');
  const { data, isLoading, isError } = useMedicalRecords(patientId ?? 0);

  const records = useMemo(
    () =>
      ((data?.records ?? []) as MedicalRecord[])
        .filter((r) => !r.isArchived)
        .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf()),
    [data],
  );

  const defaultedFor = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!patientId || !data || defaultedFor.current === patientId) return;
    defaultedFor.current = patientId;
    const today = records.find((r) => isToday(r.createdAt));
    onChange(today?.id ?? (allowNew ? NEW_RECORD : undefined));
  }, [patientId, data, records, allowNew, onChange]);

  if (isError) {
    return <Typography.Text type="danger">{t('devices:inbox.recordsLoadFailed')}</Typography.Text>;
  }

  return (
    <Select
      data-testid={testId}
      value={value}
      onChange={(v: number) => onChange(v)}
      loading={isLoading}
      disabled={!patientId}
      placeholder={t('devices:inbox.pickRecord')}
      notFoundContent={t('devices:inbox.noRecords')}
      style={{ width: '100%' }}
      options={[
        ...(allowNew ? [{ value: NEW_RECORD, label: t('devices:inbox.newLabRecord') }] : []),
        ...records.map((r) => ({
          value: r.id,
          label: `${r.name} · ${formatDate(r.createdAt)}${isToday(r.createdAt) ? ` (${t('devices:inbox.today')})` : ''}`,
        })),
      ]}
    />
  );
};

export default PatientRecordSelect;
