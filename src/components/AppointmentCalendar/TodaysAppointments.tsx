import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import DayViewSimple from './DayViewSimple';
import { Appointment } from '../../types/appointments';
import styles from './TodaysAppointments.module.css';

interface TodaysAppointmentsProps {
  appointments: Appointment[];
  onSelectAppointment: (appointment: Appointment) => void;
  onCreateAppointment: (startDate: Date, endDate?: Date) => void;
}

const TodaysAppointments: React.FC<TodaysAppointmentsProps> = ({
  appointments: allAppointments,
  onSelectAppointment,
  onCreateAppointment,
}) => {
  const { t } = useTranslation('appointments');
  const today = dayjs();

  // Filter appointments to only show today's appointments
  const todaysAppointments = useMemo(() => {
    return allAppointments.filter(appointment => {
      const appointmentDate = dayjs(appointment.start_time);
      return appointmentDate.isSame(today, 'day');
    });
  }, [allAppointments, today]);

  return (
    <div className={styles.container}>
      <h3 className={styles.header}>
        {t('tabs.todaysAppointments')}
      </h3>
      <DayViewSimple
        selectedDate={today}
        appointments={todaysAppointments}
        onSelectAppointment={onSelectAppointment}
        onCreateAppointment={onCreateAppointment}
      />
    </div>
  );
};

export default TodaysAppointments;