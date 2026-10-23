import { useMemo, useState } from 'react';
import { Card, Row, Col, Tag, Alert, Spin, Statistic, Typography, Badge } from 'antd';
import { CalendarOutlined, ExperimentOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { invoke } from '@/services/invoke';
import { useCalendarAppointments } from '@/hooks/useAppointments';
import type { Appointment } from '@/types/appointments';
import { AppointmentDrawer } from '@/components/AppointmentDrawer/AppointmentDrawer';
import { isClosedStatus, statusColor, statusLabelKey } from '@/utils/appointmentStatus';
import styles from './TodayStrip.module.css';

const { Text } = Typography;

export interface TodayStripProps {
  /** Lab results waiting to be attached; the lab inbox owns this count. */
  waitingLabCount: number;
  onOpenLabResults: () => void;
}

function useToday() {
  const day = dayjs().format('YYYY-MM-DD');
  return useMemo(() => {
    const start = dayjs(day).startOf('day').toDate();
    const end = dayjs(day).endOf('day').toDate();
    return { start, end };
  }, [day]);
}

/** Dashboard top: today's appointments, lab results waiting, patients seen today. */
export function TodayStrip({ waitingLabCount, onOpenLabResults }: TodayStripProps) {
  const { t } = useTranslation(['shell', 'appointments']);
  const [openId, setOpenId] = useState<number | null>(null);
  const { start, end } = useToday();
  const appointments = useCalendarAppointments(start, end);
  const seen = useQuery({
    queryKey: ['medical-records', 'seenToday', start.toISOString()],
    queryFn: () =>
      invoke<number>('count_patients_seen', {
        start: start.toISOString(),
        end: dayjs(start).add(1, 'day').toDate().toISOString(),
      }),
    staleTime: 0,
    refetchInterval: 60_000,
  });

  const list: Appointment[] = useMemo(
    () =>
      [...(appointments.data?.appointments ?? [])].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      ),
    [appointments.data],
  );

  let appointmentsBody;
  if (appointments.isError) {
    appointmentsBody = <Alert type="error" showIcon message={t('shell:today.appointmentsFailed')} />;
  } else if (appointments.isLoading) {
    appointmentsBody = <Spin size="small" />;
  } else if (list.length === 0) {
    appointmentsBody = <Text type="secondary">{t('shell:today.noAppointments')}</Text>;
  } else {
    appointmentsBody = (
      <ul className={styles.appointments}>
        {list.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              className={styles.appointment}
              data-closed={isClosedStatus(a.status) ? 'true' : undefined}
              onClick={() => setOpenId(a.id)}
            >
              <Text strong className={styles.time}>{dayjs(a.startTime).format('HH:mm')}</Text>
              <Text className={styles.patient}>{a.patientName || t('shell:today.noName')}</Text>
              <Text type="secondary" ellipsis className={styles.title}>{a.title}</Text>
              <Tag color={statusColor(a.status)}>{t(statusLabelKey(a.status))}</Tag>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card title={t('shell:today.title')} size="small">
      <AppointmentDrawer appointmentId={openId} onClose={() => setOpenId(null)} />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Text type="secondary" className={styles.sectionLabel}>
            <CalendarOutlined /> {t('shell:today.appointments')}
          </Text>
          {appointmentsBody}
        </Col>
        <Col xs={12} lg={4}>
          <button
            type="button"
            className={styles.tile}
            aria-label={`${t('shell:today.labWaiting')}: ${waitingLabCount}. ${t('shell:today.openLabResults')}`}
            onClick={onOpenLabResults}
          >
            <Statistic
              title={t('shell:today.labWaiting')}
              value={waitingLabCount}
              prefix={waitingLabCount > 0 ? <Badge status="warning" /> : <ExperimentOutlined />}
            />
          </button>
        </Col>
        <Col xs={12} lg={4}>
          <div className={styles.tile} data-testid="seen-today">
            <Statistic
              title={t('shell:today.seenToday')}
              value={seen.isError ? t('shell:today.seenFailed') : seen.data ?? '–'}
              prefix={<CheckCircleOutlined />}
            />
          </div>
        </Col>
      </Row>
    </Card>
  );
}
