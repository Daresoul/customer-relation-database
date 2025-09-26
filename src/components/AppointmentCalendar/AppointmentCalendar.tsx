import React, { useState, useMemo } from 'react';
import { Calendar, Badge, Button, Space, Tooltip, Tag, Radio } from 'antd';
import { CalendarMode } from 'antd/es/calendar/generateCalendar';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { LeftOutlined, RightOutlined, PlusOutlined } from '@ant-design/icons';
import { Appointment, CalendarView } from '../../types/appointments';
import { useCalendarAppointments } from '../../hooks/useAppointments';
import appointmentService from '../../services/appointmentService';
import WeekView from './WeekView';
import DayView from './DayView';
import DayViewDraggable from './DayViewDraggable';
import './AppointmentCalendar.css';

interface AppointmentCalendarProps {
  onSelectAppointment: (appointment: Appointment) => void;
  onCreateAppointment: (date: Date, endDate?: Date) => void;
  selectedRoomId?: number;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
}

const AppointmentCalendar: React.FC<AppointmentCalendarProps> = ({
  onSelectAppointment,
  onCreateAppointment,
  selectedRoomId,
  view,
  onViewChange,
}) => {
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());

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
        start = selectedDate.startOf('month');
        end = selectedDate.endOf('month');
        break;
    }

    return {
      startDate: start.toDate(),
      endDate: end.toDate(),
    };
  }, [selectedDate, view]);

  // Fetch appointments for the current view
  const { data, isLoading } = useCalendarAppointments(startDate, endDate);
  const appointments = data?.appointments || [];

  // Filter appointments by room if selected
  const filteredAppointments = useMemo(() => {
    if (!selectedRoomId) return appointments;
    return appointments.filter((apt) => apt.room_id === selectedRoomId);
  }, [appointments, selectedRoomId]);

  // Group appointments by date
  const appointmentsByDate = useMemo(() => {
    const grouped: Record<string, Appointment[]> = {};
    filteredAppointments.forEach((apt) => {
      const dateKey = dayjs(apt.start_time).format('YYYY-MM-DD');
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(apt);
    });
    return grouped;
  }, [filteredAppointments]);

  // Custom cell renderer for calendar
  const dateCellRender = (date: Dayjs) => {
    const dateKey = date.format('YYYY-MM-DD');
    const dayAppointments = appointmentsByDate[dateKey] || [];

    if (view === 'month') {
      // Month view: show badges
      return (
        <div className="appointments-cell">
          {dayAppointments.slice(0, 3).map((apt) => (
            <div
              key={apt.id}
              className="appointment-badge"
              onClick={(e) => {
                e.stopPropagation();
                onSelectAppointment(apt);
              }}
            >
              <Badge
                status="processing"
                color={appointmentService.getStatusColor(apt.status)}
                text={
                  <Tooltip title={`${apt.title} - ${apt.patient_name || 'Patient'}`}>
                    <span className="appointment-text">
                      {dayjs(apt.start_time).format('HH:mm')} - {apt.title}
                    </span>
                  </Tooltip>
                }
              />
            </div>
          ))}
          {dayAppointments.length > 3 && (
            <div className="more-appointments">+{dayAppointments.length - 3} more</div>
          )}
        </div>
      );
    }

    // Week/Day view: show detailed list
    return (
      <div className="appointments-list">
        {dayAppointments.map((apt) => (
          <div
            key={apt.id}
            className="appointment-item"
            style={{ borderLeft: `3px solid ${appointmentService.getStatusColor(apt.status)}` }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectAppointment(apt);
            }}
          >
            <div className="appointment-time">
              {dayjs(apt.start_time).format('HH:mm')} - {dayjs(apt.end_time).format('HH:mm')}
            </div>
            <div className="appointment-title">{apt.title}</div>
            <div className="appointment-patient">{apt.patient_name || 'Patient'}</div>
            <Tag color={appointmentService.getStatusColor(apt.status)}>
              {apt.status.replace('_', ' ')}
            </Tag>
          </div>
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

  // Custom header for the calendar
  const headerRender = () => {
    const title = view === 'month'
      ? selectedDate.format('MMMM YYYY')
      : view === 'week'
      ? `Week of ${selectedDate.startOf('week').format('MMM DD, YYYY')}`
      : selectedDate.format('dddd, MMMM DD, YYYY');

    return (
      <div className="calendar-header">
        <Space size="small">
          <Radio.Group
            value={view}
            onChange={(e) => onViewChange(e.target.value)}
            buttonStyle="solid"
            size="small"
          >
            <Radio.Button value="month">Month</Radio.Button>
            <Radio.Button value="week">Week</Radio.Button>
            <Radio.Button value="day">Day</Radio.Button>
          </Radio.Group>
        </Space>

        <div className="calendar-navigation-buttons">
          <Button
            size="small"
            icon={<LeftOutlined />}
            onClick={handlePrevious}
          />
          <span className="calendar-title">{title}</span>
          <Button
            size="small"
            icon={<RightOutlined />}
            onClick={handleNext}
          />
        </div>

        <Space size="small">
          <Button size="small" onClick={handleToday}>Today</Button>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => onCreateAppointment(selectedDate.toDate())}
          >
            New Appointment
          </Button>
        </Space>
      </div>
    );
  };

  const renderCalendarContent = () => {
    switch (view) {
      case 'week':
        return (
          <WeekView
            selectedDate={selectedDate}
            appointments={appointments || []}
            onSelectAppointment={onSelectAppointment}
            onCreateAppointment={onCreateAppointment}
          />
        );
      case 'day':
        return (
          <DayViewDraggable
            selectedDate={selectedDate}
            appointments={appointments || []}
            onSelectAppointment={onSelectAppointment}
            onCreateAppointment={(startDate, endDate) => {
              // Pass the start date for now, modal will handle end time
              onCreateAppointment(startDate);
            }}
          />
        );
      default:
        return (
          <Calendar
            value={selectedDate}
            onSelect={handleSelect}
            dateCellRender={dateCellRender}
            mode="month"
            headerRender={() => null} // We use custom header
            fullscreen={true}
          />
        );
    }
  };

  return (
    <div className="appointment-calendar">
      {headerRender()}
      {renderCalendarContent()}
    </div>
  );
};

export default AppointmentCalendar;