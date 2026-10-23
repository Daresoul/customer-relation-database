import React, { useEffect, useMemo, useState } from 'react';
import { App, Checkbox, DatePicker, Form, Input, Modal, Skeleton, Typography } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs, { type Dayjs } from 'dayjs';
import { AppointmentService } from '../../../services/appointmentService';
import { LoadError } from '../../../components/common/LoadError';
import { useMarkDeceased } from '../../../hooks/usePatientChart';
import { invalidatePatientData } from '../../../hooks/invalidation';
import { formatDateTime, getDatePickerFormat } from '../../../utils/dateFormatter';

const { Text } = Typography;

interface MarkDeceasedModalProps {
  open: boolean;
  patient: { id: number; name: string };
  onClose: () => void;
}

/**
 * Date of death and an optional note, then the patient's future appointments,
 * ticked, to cancel in the same step.
 */
export const MarkDeceasedModal: React.FC<MarkDeceasedModalProps> = ({ open, patient, onClose }) => {
  const { t } = useTranslation(['patients', 'common']);
  const { notification } = App.useApp();
  const queryClient = useQueryClient();
  const markDeceased = useMarkDeceased();
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [note, setNote] = useState('');
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDate(dayjs());
      setNote('');
      setUnticked(new Set());
    }
  }, [open]);

  const future = useQuery({
    queryKey: ['appointments', 'future-for-patient', patient.id],
    queryFn: async () => {
      const res = await AppointmentService.getAppointments(
        { patientId: patient.id, startDate: dayjs().toISOString() },
        100,
      );
      return res.appointments.filter((a) => a.status !== 'cancelled' && a.status !== 'completed');
    },
    enabled: open,
    staleTime: 0,
  });
  const appointments = useMemo(() => future.data ?? [], [future.data]);

  const toggle = (id: number, checked: boolean) =>
    setUnticked((prev) => {
      const next = new Set(prev);
      if (checked) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = async () => {
    setSaving(true);
    try {
      await markDeceased.mutateAsync({
        id: patient.id,
        name: patient.name,
        deceasedOn: date.format('YYYY-MM-DD'),
        note: note.trim() || null,
      });
    } catch {
      setSaving(false);
      return;
    }

    const toCancel = appointments.filter((a) => !unticked.has(a.id));
    let failed = 0;
    for (const a of toCancel) {
      try {
        await AppointmentService.updateAppointment(a.id, { status: 'cancelled' });
      } catch {
        failed += 1;
      }
    }
    if (toCancel.length > 0) invalidatePatientData(queryClient);
    const cancelled = toCancel.length - failed;
    if (cancelled > 0) {
      notification.info({
        message: t('patients:chart.deceased.cancelled', { count: cancelled }),
        placement: 'bottomRight',
        duration: 4,
      });
    }
    if (failed > 0) {
      notification.warning({
        message: t('patients:chart.deceased.cancelFailed', { count: failed }),
        placement: 'bottomRight',
        duration: 8,
      });
    }
    setSaving(false);
    onClose();
  };

  let appointmentList: React.ReactNode;
  if (future.isError) {
    appointmentList = (
      <LoadError
        title={t('patients:chart.deceased.appointmentsLoadFailed')}
        onRetry={() => future.refetch()}
        retrying={future.isFetching}
      />
    );
  } else if (future.isLoading) {
    appointmentList = <Skeleton active paragraph={{ rows: 1 }} title={false} />;
  } else if (appointments.length === 0) {
    appointmentList = <Text type="secondary">{t('patients:chart.deceased.noFuture')}</Text>;
  } else {
    appointmentList = (
      <>
        <Text type="secondary">{t('patients:chart.deceased.cancelHint')}</Text>
        {appointments.map((a) => (
          <div key={a.id}>
            <Checkbox checked={!unticked.has(a.id)} onChange={(e) => toggle(a.id, e.target.checked)}>
              {formatDateTime(a.startTime)} · {a.title}
            </Checkbox>
          </div>
        ))}
      </>
    );
  }

  return (
    <Modal
      open={open}
      title={t('patients:chart.deceased.title', { name: patient.name })}
      okText={t('patients:chart.deceased.confirm')}
      okButtonProps={{ danger: true, disabled: future.isLoading }}
      cancelText={t('common:cancel')}
      confirmLoading={saving}
      onOk={confirm}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form layout="vertical">
        <Form.Item label={t('patients:chart.deceased.date')} required>
          <DatePicker
            value={date}
            onChange={(d) => d && setDate(d)}
            allowClear={false}
            format={getDatePickerFormat()}
            disabledDate={(d) => d.isAfter(dayjs().endOf('day'))}
            style={{ width: '100%' }}
          />
        </Form.Item>
        <Form.Item label={t('patients:chart.deceased.note')}>
          <Input.TextArea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('patients:chart.deceased.notePlaceholder')}
            maxLength={500}
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        </Form.Item>
        <Form.Item label={t('patients:chart.deceased.futureAppointments')}>{appointmentList}</Form.Item>
      </Form>
    </Modal>
  );
};

export default MarkDeceasedModal;
