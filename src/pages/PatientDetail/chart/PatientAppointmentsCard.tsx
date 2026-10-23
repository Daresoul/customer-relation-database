import React from 'react';
import { Button, Card, Skeleton, Typography } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import AppointmentService from '../../../services/appointmentService';
import { LoadError } from '../../../components/common/LoadError';
import { formatDateTime } from '../../../utils/dateFormatter';
import type { Appointment } from '../../../types/appointments';
import styles from './PatientChart.module.css';

const { Text } = Typography;

const OPEN_STATUSES = new Set(['scheduled', 'checked_in', 'in_progress']);

/** The next open visit after now, and the latest visit that already started. */
function nextAndLast(appointments: Appointment[], now = dayjs()) {
  const sorted = [...appointments].sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());
  const next = sorted.find((a) => !dayjs(a.startTime).isBefore(now) && OPEN_STATUSES.has(a.status));
  const last = [...sorted]
    .reverse()
    .find((a) => dayjs(a.startTime).isBefore(now) && a.status !== 'cancelled' && a.status !== 'no_show');
  return { next, last };
}

interface Props {
  patientId: number;
  /** Left out when the patient can't be booked (deceased). */
  onBook?: () => void;
}

/** Overview card: the patient's next and last appointment, and Book. */
export const PatientAppointmentsCard: React.FC<Props> = ({ patientId, onBook }) => {
  const { t } = useTranslation(['patients', 'appointments']);
  const query = useQuery({
    queryKey: ['appointments', 'patient-overview', patientId],
    queryFn: async () => (await AppointmentService.getAppointments({ patientId }, 500)).appointments,
  });
  const { next, last } = nextAndLast(query.data ?? []);

  const line = (label: string, apt: Appointment | undefined) => (
    <div className={styles.visitRow}>
      <Text type="secondary">{label}</Text>
      {apt ? (
        <Text>{`${formatDateTime(apt.startTime)} · ${apt.title}`}</Text>
      ) : (
        <Text type="secondary">{t('patients:overview.appointments.none')}</Text>
      )}
    </div>
  );

  return (
    <Card
      size="small"
      className={styles.overviewCard}
      title={t('patients:overview.appointments.title')}
      extra={
        onBook && (
          <Button size="small" icon={<CalendarOutlined />} onClick={onBook}>
            {t('patients:overview.appointments.book')}
          </Button>
        )
      }
    >
      {query.isError ? (
        <LoadError
          title={t('patients:overview.appointments.loadFailed')}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.isLoading ? (
        <Skeleton active paragraph={{ rows: 1 }} title={false} />
      ) : (
        <>
          {line(t('patients:overview.appointments.next'), next)}
          {line(t('patients:overview.appointments.last'), last)}
        </>
      )}
    </Card>
  );
};

export default PatientAppointmentsCard;
