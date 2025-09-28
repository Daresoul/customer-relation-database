import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import DayViewSimple from './DayViewSimple';
import { Appointment } from '../../types/appointments';
import { useThemeColors } from '../../utils/themeStyles';

interface TodaysAppointmentsProps {
  appointments: Appointment[];
  onSelectAppointment: (appointment: Appointment) => void;
  onCreateAppointment: (startDate: Date, endDate: Date) => void;
}

const TodaysAppointments: React.FC<TodaysAppointmentsProps> = ({
  appointments: allAppointments,
  onSelectAppointment,
  onCreateAppointment,
}) => {
  const themeColors = useThemeColors();
  const today = dayjs();

  // Filter appointments to only show today's appointments
  const todaysAppointments = useMemo(() => {
    const todayStart = today.startOf('day');
    const todayEnd = today.endOf('day');

    return allAppointments.filter(appointment => {
      const appointmentDate = dayjs(appointment.start_time);
      return appointmentDate.isBetween(todayStart, todayEnd, null, '[]');
    });
  }, [allAppointments, today]);


  return (
    <div style={{
      padding: '16px',
      background: themeColors.cardBg,
      borderRadius: '8px',
      height: '100%',
      border: `1px solid ${themeColors.border}`
    }}>
      <h3 style={{
        margin: '0 0 16px 0',
        fontSize: '16px',
        color: themeColors.text,
        borderBottom: `1px solid ${themeColors.border}`,
        paddingBottom: '8px'
      }}>
        Today's Appointments
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