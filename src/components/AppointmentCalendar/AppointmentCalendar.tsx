import React, { useState, useMemo, useEffect } from 'react';
import { Calendar, Badge, Button, Space, Tooltip, Tag, Radio } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import updateLocale from 'dayjs/plugin/updateLocale';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Appointment, AppointmentStatus, CalendarView } from '../../types/appointments';
import { isClosedStatus, statusColor, statusLabelKey } from '../../utils/appointmentStatus';
import { AppointmentStatusMenu } from './AppointmentStatusMenu';
import cardStyles from './AppointmentCard.module.css';
import { useRooms } from '../../hooks/useRooms';
import { useThemeColors } from '../../utils/themeStyles';
import WeekView from './WeekView';
import DayViewSimple from './DayViewSimple';
import { useTranslation } from 'react-i18next';
import styles from './AppointmentCalendar.module.css';

// Configure dayjs to start week on Monday
dayjs.extend(updateLocale);
dayjs.updateLocale('en', {
  weekStart: 1, // Monday as first day of week
});

interface AppointmentCalendarProps {
  appointments: Appointment[];
  onSelectAppointment: (appointment: Appointment) => void;
  onCreateAppointment: (date: Date, endDate?: Date) => void;
  selectedRoomId?: number;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  onDateChange?: (date: Dayjs) => void;
  /** The dates the current view shows; the parent fetches exactly this range. */
  onRangeChange?: (start: Date, end: Date) => void;
  onStatusChange?: (appointment: Appointment, status: AppointmentStatus) => void;
}

const AppointmentCalendar: React.FC<AppointmentCalendarProps> = ({
  appointments: allAppointments,
  onSelectAppointment,
  onCreateAppointment,
  selectedRoomId,
  view,
  onViewChange,
  onDateChange,
  onRangeChange,
  onStatusChange,
}) => {
  const { t } = useTranslation('appointments');
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const themeColors = useThemeColors();
  const statusLabel = (status: AppointmentStatus) => t(statusLabelKey(status));


  // Fetch room data for colors
  const { data: rooms = [] } = useRooms({ activeOnly: true });

  // Helper function to get room color
  const getRoomColor = (appointment: Appointment): string => {
    if (!appointment.roomId) {
      return '#1890ff'; // Default blue color for appointments without rooms
    }

    const room = rooms.find(r => r.id === appointment.roomId);
    return room?.color || '#1890ff'; // Fallback to default blue
  };

  // Create tooltip content for appointment
  const getTooltipContent = (apt: Appointment) => {
    const room = rooms.find(r => r.id === apt.roomId);

    return (
      <div>
        <div className={styles.tooltipLine}>
          <strong>{t('details.patient')}:</strong> {apt.patientName || t('details.unknownPatient')}
        </div>
        <div className={styles.tooltipLine}>
          <strong>{t('patients:fields.microchipId')}:</strong> {apt.microchipId || '-'}
        </div>
        <div className={styles.tooltipLine}>
          <strong>{t('details.time')}:</strong> {dayjs(apt.startTime).format('HH:mm')} - {dayjs(apt.endTime).format('HH:mm')}
        </div>
        <div className={styles.tooltipLine}>
          <strong>{t('fields.date')}:</strong> {dayjs(apt.startTime).format('MMM DD, YYYY')}
        </div>
        {room && (
          <div className={styles.tooltipLine}>
            <strong>{t('details.room')}:</strong> {room.name}
          </div>
        )}
        <div className={styles.tooltipLine}>
          <strong>{t('fields.status')}:</strong> {statusLabel(apt.status)}
        </div>
        <div className={styles.tooltipTitle}>{apt.title}</div>
        {apt.description && (
          <div className={styles.tooltipDescription}>
            {apt.description}
          </div>
        )}
      </div>
    );
  };

  // Calculate date range based on view
  const { startDate, endDate } = useMemo(() => {
    let start: Dayjs;
    let end: Dayjs;

    switch (view) {
      case 'day':
        start = selectedDate.startOf('day');
        end = selectedDate.endOf('day');
        break;
      case 'week':
        start = selectedDate.startOf('week');
        end = selectedDate.endOf('week');
        break;
      case 'month':
      default:
        // The month grid also shows the edges of the weeks around it.
        start = selectedDate.startOf('month').startOf('week');
        end = selectedDate.endOf('month').endOf('week');
        break;
    }

    return {
      startDate: start.toDate(),
      endDate: end.toDate(),
    };
  }, [selectedDate, view]);

  useEffect(() => {
    onRangeChange?.(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report a new range only
  }, [startDate.getTime(), endDate.getTime()]);

  // Filter appointments by room if selected
  const filteredAppointments = useMemo(() => {
    const filtered = !selectedRoomId ? allAppointments : allAppointments.filter((apt) => apt.roomId === selectedRoomId);


    return filtered;
  }, [allAppointments, selectedRoomId]);

  // Group appointments by date
  const appointmentsByDate = useMemo(() => {
    const grouped: Record<string, Appointment[]> = {};
    filteredAppointments.forEach((apt) => {
      const dateKey = dayjs(apt.startTime).format('YYYY-MM-DD');
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(apt);
    });
    return grouped;
  }, [filteredAppointments]);

  // Custom cell renderer for calendar
  const cellRender = (date: Dayjs) => {
    const dateKey = date.format('YYYY-MM-DD');
    const dayAppointments = appointmentsByDate[dateKey] || [];

    if (view === 'month') {
      // Month view: show badges
      return (
        <div className={styles.appointmentsCell}>
          {dayAppointments.slice(0, 3).map((apt) => (
            <AppointmentStatusMenu key={apt.id} appointment={apt} onStatusChange={onStatusChange}>
            <Tooltip
              title={getTooltipContent(apt)}
              placement="top"
              mouseEnterDelay={0.5}
              styles={{ root: { maxWidth: '300px' } }}
            >
              <div
                className={`${styles.appointmentBadge} ${isClosedStatus(apt.status) ? cardStyles.closed : ''}`}
                data-status={apt.status}
                data-closed={isClosedStatus(apt.status) ? 'true' : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAppointment(apt);
                }}
              >
                <Badge
                  status="processing"
                  color={getRoomColor(apt)}
                  text={
                    <span className={styles.appointmentText}>
                      {dayjs(apt.startTime).format('HH:mm')}{' '}
                      <span className={cardStyles.patientName}>{apt.patientName || t('details.unknownPatient')}</span>
                      {' · '}
                      <span className={cardStyles.title}>{apt.title}</span>
                    </span>
                  }
                />
              </div>
            </Tooltip>
            </AppointmentStatusMenu>
          ))}
          {dayAppointments.length > 3 && (
            <div className={styles.moreAppointments}>{t('calendar.more', { count: dayAppointments.length - 3 })}</div>
          )}
        </div>
      );
    }

    // Week/Day view: show detailed list
    return (
      <div className={styles.appointmentsList}>
        {dayAppointments.map((apt) => (
          <Tooltip
            key={apt.id}
            title={getTooltipContent(apt)}
            placement="right"
            mouseEnterDelay={0.5}
            styles={{ root: { maxWidth: '300px' } }}
          >
            <div
              className={`${styles.appointmentItem} ${apt.status === 'cancelled' ? styles.appointmentCancelled : ''}`}
              style={{ borderLeft: `3px solid ${getRoomColor(apt)}` }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectAppointment(apt);
              }}
            >
              <div className={styles.appointmentTime}>
                {dayjs(apt.startTime).format('HH:mm')} - {dayjs(apt.endTime).format('HH:mm')}
              </div>
              <div className={styles.appointmentTitle}>{apt.title}</div>
              <div className={styles.appointmentPatient}>{apt.patientName || t('details.patient')}</div>
              <Tag color={statusColor(apt.status)}>
                {statusLabel(apt.status)}
              </Tag>
            </div>
          </Tooltip>
        ))}
      </div>
    );
  };

  // Handle date selection
  const handleSelect = (date: Dayjs) => {
    setSelectedDate(date);
    // If clicking on a date in month view, switch to day view
    if (view === 'month') {
      onViewChange('day');
    }
  };

  // Handle date cell click for creating appointments
  const handleDateClick = (date: Dayjs) => {
    onCreateAppointment(date.toDate());
  };

  // Navigation handlers
  const handlePrevious = () => {
    switch (view) {
      case 'day':
        setSelectedDate(selectedDate.subtract(1, 'day'));
        break;
      case 'week':
        setSelectedDate(selectedDate.subtract(1, 'week'));
        break;
      case 'month':
        setSelectedDate(selectedDate.subtract(1, 'month'));
        break;
    }
  };

  const handleNext = () => {
    switch (view) {
      case 'day':
        setSelectedDate(selectedDate.add(1, 'day'));
        break;
      case 'week':
        setSelectedDate(selectedDate.add(1, 'week'));
        break;
      case 'month':
        setSelectedDate(selectedDate.add(1, 'month'));
        break;
    }
  };

  const handleToday = () => {
    setSelectedDate(dayjs());
  };

  // Handle day header click in week view to switch to day view
  const handleDayHeaderClick = (date: Dayjs) => {
    setSelectedDate(date);
    onViewChange('day');
    if (onDateChange) {
      onDateChange(date);
    }
  };

  // Custom header for the calendar
  const headerRender = () => {
    const title = view === 'month'
      ? selectedDate.format('MMMM YYYY')
      : view === 'week'
      ? t('calendar.weekOf', { date: selectedDate.startOf('week').format('MMM DD, YYYY') })
      : selectedDate.format('dddd, MMMM DD, YYYY');

    return (
      <div className={styles.calendarHeader}>
        <Space size="small">
          <Radio.Group
            value={view}
            onChange={(e) => onViewChange(e.target.value)}
            buttonStyle="solid"
            size="small"
          >
            <Radio.Button value="month">{t('views.month')}</Radio.Button>
            <Radio.Button value="week">{t('views.week')}</Radio.Button>
            <Radio.Button value="day">{t('views.day')}</Radio.Button>
          </Radio.Group>
        </Space>

        <div className={styles.calendarNavigationButtons}>
          <Button
            size="small"
            icon={<LeftOutlined />}
            onClick={handlePrevious}
          />
          <span className={styles.calendarTitle}>{title}</span>
          <Button
            size="small"
            icon={<RightOutlined />}
            onClick={handleNext}
          />
        </div>

        <Button size="small" onClick={handleToday}>{t('calendar.today')}</Button>
      </div>
    );
  };

  const renderCalendarContent = () => {
    switch (view) {
      case 'week':
        return (
          <WeekView
            selectedDate={selectedDate}
            appointments={filteredAppointments}
            onSelectAppointment={onSelectAppointment}
            onCreateAppointment={(startDate, endDate) => {
              // Pass both dates to parent
              onCreateAppointment(startDate, endDate);
            }}
            onDayHeaderClick={handleDayHeaderClick}
            onStatusChange={onStatusChange}
          />
        );
      case 'day':
        return (
          <DayViewSimple
            selectedDate={selectedDate}
            appointments={filteredAppointments}
            onSelectAppointment={onSelectAppointment}
            onCreateAppointment={(startDate, endDate) => {
              // Pass both dates to parent
              onCreateAppointment(startDate, endDate);
            }}
            onStatusChange={onStatusChange}
          />
        );
      default:
        return (
          <Calendar
            value={selectedDate}
            onSelect={handleSelect}
            cellRender={cellRender}
            mode="month"
            headerRender={() => null} // We use custom header
            fullscreen={true}
          />
        );
    }
  };

  return (
    <div className={styles.appointmentCalendar}>
      {headerRender()}
      {renderCalendarContent()}
    </div>
  );
};

export default AppointmentCalendar;