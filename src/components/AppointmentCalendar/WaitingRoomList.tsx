import React, { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import type { Appointment, AppointmentStatus } from '../../types/appointments';
import { useRooms } from '../../hooks/useRooms';
import {
  isClosedStatus,
  forwardStep,
  statusActionKey,
  statusColor,
  statusLabelKey,
  waitingMinutes,
} from '../../utils/appointmentStatus';
import styles from './WaitingRoomList.module.css';

const { Text } = Typography;

interface WaitingRoomListProps {
  appointments: Appointment[];
  onSelect: (appointment: Appointment) => void;
  onStatusChange: (appointment: Appointment, status: AppointmentStatus) => void;
}

/** Re-render every minute so the wait times move. */
function useMinuteTick(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * Today as a front-desk list: time, patient, reason, room, status and the wait
 * since check-in, with the next step of the visit one click away.
 */
const WaitingRoomList: React.FC<WaitingRoomListProps> = ({ appointments, onSelect, onStatusChange }) => {
  const { t } = useTranslation(['appointments']);
  const { data: rooms = [] } = useRooms({ activeOnly: false });
  const now = useMinuteTick();

  const rows = useMemo(
    () => [...appointments].sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf()),
    [appointments],
  );

  if (rows.length === 0) {
    return <Empty description={t('appointments:waiting.empty')} />;
  }

  return (
    <ul className={styles.list}>
      {rows.map((apt) => {
        const closed = isClosedStatus(apt.status);
        const room = rooms.find((r) => r.id === apt.roomId);
        const waited = apt.status === 'checked_in' ? waitingMinutes(apt.checkedInAt, now) : null;
        const next = forwardStep(apt.status);
        return (
          <li key={apt.id} className={styles.row} data-closed={closed ? 'true' : undefined}>
            <button type="button" className={styles.main} onClick={() => onSelect(apt)}>
              <Text strong className={styles.time}>{dayjs(apt.startTime).format('HH:mm')}</Text>
              <Text strong className={styles.patient}>{apt.patientName || t('appointments:details.unknownPatient')}</Text>
              <Text type="secondary" ellipsis className={styles.reason}>{apt.title}</Text>
              {room && <Text type="secondary" className={styles.room}>{room.name}</Text>}
            </button>
            <Space size={4} className={styles.side}>
              {waited !== null && (
                <Text type="warning" className={styles.wait}>
                  {t('appointments:waiting.waitingFor', { minutes: waited })}
                </Text>
              )}
              <Tag color={statusColor(apt.status)}>{t(statusLabelKey(apt.status))}</Tag>
              {next && !closed && (
                <Button size="small" onClick={() => onStatusChange(apt, next)}>
                  {t(statusActionKey(next))}
                </Button>
              )}
            </Space>
          </li>
        );
      })}
    </ul>
  );
};

export default WaitingRoomList;
