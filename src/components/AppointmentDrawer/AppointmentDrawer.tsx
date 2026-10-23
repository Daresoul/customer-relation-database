import React, { useEffect, useState } from 'react';
import { App, Button, DatePicker, Descriptions, Divider, Drawer, Form, Modal, Space, Spin, Tag, TimePicker, Typography } from 'antd';
import {
  CalendarOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  FileTextOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs, { type Dayjs } from 'dayjs';
import { useAppointmentDetail, useAppointments } from '@/hooks/useAppointments';
import { usePatientDetail } from '@/hooks/usePatient';
import { CREATE_RECORD_MUTATION_KEY } from '@/hooks/useMedicalRecords';
import { AlertChips } from '@/components/patient/AlertChips';
import { LoadError } from '@/components/common/LoadError';
import AppointmentModal from '@/components/AppointmentModal/AppointmentModal';
import MedicalRecordModal from '@/components/MedicalRecordModal/MedicalRecordModal';
import type { PatientDetail } from '@/types/patient';
import type { AppointmentStatus, UpdateAppointmentInput } from '@/types/appointments';
import {
  isClosedStatus,
  nextStatuses,
  statusActionKey,
  statusColor,
  statusLabelKey,
  waitingMinutes,
} from '@/utils/appointmentStatus';
import styles from './AppointmentDrawer.module.css';
import { speciesLabel } from '../../utils/species';
import { formatDayMonth, getDatePickerFormat } from '@/utils/dateFormatter';

const { Text } = Typography;

export interface AppointmentDrawerProps {
  /** The appointment to show; null keeps the panel closed. */
  appointmentId: number | null;
  onClose: () => void;
}

type Dialog = 'edit' | 'reschedule' | 'duplicate' | 'delete' | 'record' | null;

const GOOGLE_STATE_KEY: Record<string, string> = {
  off: 'off',
  synced: 'synced',
  not_synced: 'notSynced',
  reconnect: 'reconnect',
};

function ownerOf(patient: PatientDetail | null | undefined): { name?: string; phone?: string } {
  const owner = patient?.household?.primaryContact;
  if (!owner) return {};
  const phones = owner.contacts.filter((c) => c.type === 'phone' || c.type === 'mobile');
  return {
    name: [owner.firstName, owner.lastName].filter(Boolean).join(' '),
    phone: (phones.find((c) => c.isPrimary) ?? phones[0])?.value,
  };
}

/**
 * The appointment panel: who, when, where and why, plus every action on the
 * visit (status, open patient, start a record, edit, move, copy, delete).
 * Calendar cards, the Today list and the dashboard strip all open it.
 */
export const AppointmentDrawer: React.FC<AppointmentDrawerProps> = ({ appointmentId, onClose }) => {
  const { t } = useTranslation(['appointments', 'common']);
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);

  const detail = useAppointmentDetail(appointmentId);
  const apt = appointmentId ? detail.data : undefined;
  const { data: patient } = usePatientDetail(apt?.patientId ?? 0);
  const { updateAppointment, deleteAppointment, duplicateAppointment } = useAppointments();

  const patientName = apt?.patientName || apt?.patient?.name || t('appointments:details.unknownPatient');
  const owner = ownerOf(patient);

  // A record saved from "Start medical record" is linked to this visit.
  useEffect(() => {
    if (dialog !== 'record' || !apt) return;
    const { id, patientId } = apt;
    const wanted = JSON.stringify(CREATE_RECORD_MUTATION_KEY);
    return queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const { mutation } = event;
      if (JSON.stringify(mutation.options.mutationKey) !== wanted) return;
      if ((mutation.state.variables as { patientId?: number } | undefined)?.patientId !== patientId) return;
      const recordId = (mutation.state.data as { id?: number } | undefined)?.id;
      if (recordId) updateAppointment({ id, input: { medicalRecordId: recordId } }).catch(() => {});
    });
  }, [dialog, apt, queryClient, updateAppointment]);

  const update = async (input: UpdateAppointmentInput) => {
    if (!apt) return;
    setBusy(true);
    try {
      await updateAppointment({ id: apt.id, input });
      return true;
    } catch {
      // useAppointments reported the failure
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: AppointmentStatus) => {
    if (await update({ status })) {
      message.success(t('appointments:messages.statusChanged', { name: patientName, status: t(statusLabelKey(status)) }));
    }
  };

  const startRecord = () => {
    if (!apt) return;
    setDialog('record');
    if (apt.status === 'scheduled' || apt.status === 'checked_in') {
      void update({ status: 'in_progress' });
    }
  };

  const remove = async () => {
    if (!apt) return;
    try {
      await deleteAppointment(apt.id);
      message.success(t('appointments:messages.deletedSuccess'));
      setDialog(null);
      onClose();
    } catch {
      // useAppointments reported the failure
    }
  };

  const duplicateTo = async (date: Dayjs) => {
    if (!apt) return;
    try {
      await duplicateAppointment({ appointmentId: apt.id, targetDate: date.startOf('day').toISOString() });
      message.success(t('appointments:messages.duplicatedSuccess'));
      setDialog(null);
    } catch {
      // useAppointments reported the failure
    }
  };

  const moveTo = async (start: Dayjs) => {
    if (!apt) return;
    const length = dayjs(apt.endTime).diff(dayjs(apt.startTime), 'minute');
    const ok = await update({
      startTime: start.toISOString(),
      endTime: start.add(length, 'minute').toISOString(),
    });
    if (ok) {
      message.success(t('appointments:messages.rescheduledSuccess'));
      setDialog(null);
    }
  };

  let body: React.ReactNode;
  if (detail.isError) {
    body = <LoadError title={t('appointments:drawer.loadFailed')} onRetry={() => detail.refetch()} retrying={detail.isFetching} />;
  } else if (!apt) {
    body = <Spin />;
  } else {
    const status = apt.status;
    const waited = status === 'checked_in' ? waitingMinutes(apt.checkedInAt) : null;
    const googleKey = GOOGLE_STATE_KEY[apt.googleSyncState] ?? 'off';
    const moves = nextStatuses(status);
    body = (
      <>
        <Space wrap className={styles.statusRow}>
          <Tag color={statusColor(status)}>{t(statusLabelKey(status))}</Tag>
          {apt.checkedInAt && status !== 'scheduled' && (
            <Text type="secondary">{t('appointments:drawer.arrived', { time: dayjs(apt.checkedInAt).format('HH:mm') })}</Text>
          )}
          {waited !== null && <Text type="warning">{t('appointments:drawer.waiting', { minutes: waited })}</Text>}
        </Space>

        <Space wrap className={styles.actions}>
          {moves.map((next, i) => (
            <Button
              key={next}
              type={i === 0 && !isClosedStatus(next) ? 'primary' : 'default'}
              danger={next === 'cancelled'}
              loading={busy && i === 0}
              onClick={() => changeStatus(next)}
            >
              {t(statusActionKey(next))}
            </Button>
          ))}
        </Space>

        <Descriptions column={1} size="small" bordered className={styles.facts}>
          <Descriptions.Item label={t('appointments:drawer.time')}>
            {dayjs(apt.startTime).format('ddd D MMM YYYY, HH:mm')}–{dayjs(apt.endTime).format('HH:mm')}
          </Descriptions.Item>
          <Descriptions.Item label={t('appointments:drawer.room')}>
            {apt.room?.name ?? <Text type="secondary">{t('appointments:drawer.noRoom')}</Text>}
          </Descriptions.Item>
          <Descriptions.Item label={t('appointments:drawer.patient')}>
            <Space direction="vertical" size={4}>
              <Text strong>
                {patientName}
                {apt.species ? ` · ${speciesLabel(t, apt.species)}` : ''}
              </Text>
              {patient?.alerts && patient.alerts.length > 0 && (
                <div>
                  <AlertChips alerts={patient.alerts} />
                </div>
              )}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label={t('appointments:drawer.owner')}>
            {owner.name ? (
              <Space direction="vertical" size={0}>
                <Text>{owner.name}</Text>
                {owner.phone && <Text copyable>{owner.phone}</Text>}
              </Space>
            ) : (
              <Text type="secondary">{t('appointments:drawer.noOwner')}</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label={t('appointments:drawer.reason')}>{apt.title}</Descriptions.Item>
          {apt.description && (
            <Descriptions.Item label={t('appointments:drawer.notes')}>
              <Text className={styles.notes}>{apt.description}</Text>
            </Descriptions.Item>
          )}
          <Descriptions.Item label={t('appointments:drawer.googleLabel')}>
            <Space direction="vertical" size={0}>
              <Text type={googleKey === 'reconnect' ? 'danger' : undefined}>
                {t(`appointments:drawer.google.${googleKey}`)}
              </Text>
              {apt.googleSyncedAt && googleKey === 'synced' && (
                <Text type="secondary">
                  {t('appointments:drawer.googleSyncedAt', { time: formatDayMonth(apt.googleSyncedAt, true) })}
                </Text>
              )}
            </Space>
          </Descriptions.Item>
          {apt.medicalRecordId && (
            <Descriptions.Item label={t('appointments:drawer.record')}>
              <Button
                type="link"
                icon={<FileTextOutlined />}
                className={styles.inlineLink}
                onClick={() => navigate(`/medical-records/${apt.medicalRecordId}`)}
              >
                {t('appointments:drawer.openRecord')}
              </Button>
            </Descriptions.Item>
          )}
        </Descriptions>

        <Space wrap className={styles.actions}>
          <Button icon={<UserOutlined />} onClick={() => navigate(`/patients/${apt.patientId}`)}>
            {t('appointments:actions.openPatient')}
          </Button>
          <Button icon={<FileAddOutlined />} onClick={startRecord}>
            {t('appointments:actions.startRecord')}
          </Button>
        </Space>

        <Divider className={styles.divider} />

        <Space wrap>
          <Button icon={<EditOutlined />} onClick={() => setDialog('edit')}>
            {t('appointments:actions.edit')}
          </Button>
          <Button icon={<CalendarOutlined />} onClick={() => setDialog('reschedule')}>
            {t('appointments:actions.reschedule')}
          </Button>
          <Button icon={<CopyOutlined />} onClick={() => setDialog('duplicate')}>
            {t('appointments:actions.duplicate')}
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={() => setDialog('delete')}>
            {t('appointments:actions.delete')}
          </Button>
        </Space>
      </>
    );
  }

  return (
    <>
      <Drawer
        open={appointmentId !== null}
        onClose={onClose}
        width={460}
        title={apt ? `${patientName} · ${dayjs(apt.startTime).format('HH:mm')}` : t('appointments:details.title')}
        destroyOnHidden
      >
        {body}
      </Drawer>

      {apt && dialog === 'edit' && (
        <AppointmentModal
          open
          mode="edit"
          appointment={apt}
          onCancel={() => setDialog(null)}
          onSave={async (values) => {
            // A failure is reported by useAppointments; rethrow so the form stays filled.
            await updateAppointment({ id: apt.id, input: values as UpdateAppointmentInput });
            message.success(t('appointments:messages.updatedSuccess'));
            setDialog(null);
          }}
        />
      )}

      {apt && dialog === 'reschedule' && (
        <RescheduleDialog
          start={dayjs(apt.startTime)}
          minutes={dayjs(apt.endTime).diff(dayjs(apt.startTime), 'minute')}
          saving={busy}
          onCancel={() => setDialog(null)}
          onSave={moveTo}
        />
      )}

      {apt && dialog === 'duplicate' && (
        <DuplicateDialog onCancel={() => setDialog(null)} onSave={duplicateTo} />
      )}

      <Modal
        open={dialog === 'delete'}
        title={t('appointments:messages.deleteTitle')}
        okText={t('appointments:actions.delete')}
        okButtonProps={{ danger: true }}
        cancelText={t('common:cancel')}
        onOk={remove}
        onCancel={() => setDialog(null)}
      >
        {t('appointments:messages.deleteConfirm')}
      </Modal>

      {apt && (
        <MedicalRecordModal
          open={dialog === 'record'}
          onClose={() => setDialog(null)}
          patientId={apt.patientId}
          patientName={patientName}
          recordId={null}
          defaultTitle={apt.title}
        />
      )}
    </>
  );
};

const RescheduleDialog: React.FC<{
  start: Dayjs;
  minutes: number;
  saving: boolean;
  onCancel: () => void;
  onSave: (start: Dayjs) => void;
}> = ({ start, minutes, saving, onCancel, onSave }) => {
  const { t } = useTranslation(['appointments', 'common']);
  const [date, setDate] = useState<Dayjs | null>(start);
  const [time, setTime] = useState<Dayjs | null>(start);
  const ready = date && time;
  return (
    <Modal
      open
      title={t('appointments:reschedule.title')}
      okText={t('appointments:reschedule.save')}
      cancelText={t('common:cancel')}
      okButtonProps={{ disabled: !ready }}
      confirmLoading={saving}
      onCancel={onCancel}
      onOk={() => {
        if (date && time) onSave(date.hour(time.hour()).minute(time.minute()).second(0).millisecond(0));
      }}
    >
      <Form layout="vertical">
        <Form.Item label={t('appointments:reschedule.date')}>
          <DatePicker value={date} onChange={setDate} format={getDatePickerFormat()} className={styles.fullWidth} />
        </Form.Item>
        <Form.Item label={t('appointments:reschedule.time')} extra={t('appointments:reschedule.keepsLength', { minutes })}>
          <TimePicker value={time} onChange={setTime} format="HH:mm" minuteStep={15} className={styles.fullWidth} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

const DuplicateDialog: React.FC<{ onCancel: () => void; onSave: (date: Dayjs) => void }> = ({ onCancel, onSave }) => {
  const { t } = useTranslation(['appointments', 'common']);
  const [date, setDate] = useState<Dayjs | null>(null);
  return (
    <Modal
      open
      title={t('appointments:messages.duplicateTitle')}
      okText={t('appointments:actions.duplicate')}
      cancelText={t('common:cancel')}
      okButtonProps={{ disabled: !date }}
      onCancel={onCancel}
      onOk={() => date && onSave(date)}
    >
      <p>{t('appointments:messages.duplicateSelectDate')}</p>
      <DatePicker
        value={date}
        onChange={setDate}
        format={getDatePickerFormat()}
        disabledDate={(d) => d < dayjs().startOf('day')}
        className={styles.fullWidth}
      />
    </Modal>
  );
};

export default AppointmentDrawer;
