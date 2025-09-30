import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Table, Tag, Empty, Card } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { Appointment } from '../../types/appointments';
import { useThemeColors } from '../../utils/themeStyles';

import styles from './WeekViewDraggable.module.css';
interface WeekViewDraggableProps {
  selectedDate: Dayjs;
  appointments: Appointment[];
  onSelectAppointment: (appointment: Appointment) => void;
  onCreateAppointment: (date: Date, endDate?: Date) => void;
}

const WeekViewDraggable: React.FC<WeekViewDraggableProps> = ({
  selectedDate,
  appointments,
  onSelectAppointment,
  onCreateAppointment,
}) => {
  const themeColors = useThemeColors();
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ day: number; slot: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ day: number; slot: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    };
  }, []);

  // Get start and end of week
  const startOfWeek = selectedDate.startOf('week');
  const endOfWeek = selectedDate.endOf('week');

  // Generate time slots with 15-minute intervals (8 AM to 8 PM)
  const timeSlots = Array.from({ length: 49 }, (_, i) => {
    const hour = Math.floor(i / 4) + 8;
    const minute = (i % 4) * 15;
    return {
      time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
      hour,
      minute,
      slotIndex: i,
    };
  });

  // Days of the week
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = startOfWeek.add(i, 'day');
    return {
      date,
      dayIndex: i,
      isToday: date.isSame(dayjs(), 'day'),
    };
  });

  // Filter appointments for the week
  const weekAppointments = appointments.filter(apt =>
    dayjs(apt.start_time).isAfter(startOfWeek.subtract(1, 'second')) &&
    dayjs(apt.start_time).isBefore(endOfWeek.add(1, 'second'))
  );

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      scheduled: 'blue',
      in_progress: 'orange',
      completed: 'green',
      cancelled: 'red',
    };
    return colors[status] || 'default';
  };

  // Get appointments for a specific time slot
  const getAppointmentsForSlot = (dayDate: Dayjs, hour: number, minute: number) => {
    return weekAppointments.filter(apt => {
      const aptStart = dayjs(apt.start_time);
      return aptStart.isSame(dayDate, 'day') &&
             aptStart.hour() === hour &&
             aptStart.minute() >= minute &&
             aptStart.minute() < minute + 15;
    });
  };

  // Handle mouse down for drag start
  const handleMouseDown = useCallback((e: React.MouseEvent, dayIndex: number, slotIndex: number) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ day: dayIndex, slot: slotIndex, y: e.clientY });
    setDragEnd({ day: dayIndex, slot: slotIndex, y: e.clientY });
  }, []);

  // Handle mouse move
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isMountedRef.current || !isDragging || !dragStart) return;

    // Calculate which slot we're over
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const relativeY = e.clientY - rect.top;
    const slotHeight = 40;
    const newSlot = Math.max(0, Math.min(48, Math.floor(relativeY / slotHeight)));

    setDragEnd({ ...dragEnd!, slot: newSlot, y: e.clientY });
  }, [isDragging, dragStart, dragEnd]);

  // Handle mouse up
  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!isMountedRef.current) return;


    if (isDragging && dragStart && dragEnd) {
      // Check if there was actual dragging
      const dragDistance = Math.abs(dragEnd.y - dragStart.y);
      const minDragDistance = 10;

      if (dragDistance < minDragDistance) {
        setIsDragging(false);
        setDragStart(null);
        setDragEnd(null);
        return;
      }

      const startSlot = Math.min(dragStart.slot, dragEnd.slot);
      const endSlot = Math.max(dragStart.slot, dragEnd.slot) + 1;

      const dayDate = weekDays[dragStart.day].date;
      const startTime = dayDate
        .hour(Math.floor(startSlot / 4) + 8)
        .minute((startSlot % 4) * 15)
        .second(0);

      const endTime = dayDate
        .hour(Math.floor(endSlot / 4) + 8)
        .minute((endSlot % 4) * 15)
        .second(0);

      if (endTime.diff(startTime, 'minutes') >= 15) {
        onCreateAppointment(startTime.toDate(), endTime.toDate());
      }
    }

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, dragStart, dragEnd, weekDays, onCreateAppointment]);

  // Add/remove event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Calculate drag preview style
  const getDragPreviewStyle = () => {
    if (!isDragging || !dragStart || !dragEnd) return null;

    const startSlot = Math.min(dragStart.slot, dragEnd.slot);
    const endSlot = Math.max(dragStart.slot, dragEnd.slot);
    const slotHeight = 40;
    const dayWidth = `${100 / 7}%`;
    const dayOffset = `${(dragStart.day * 100) / 7}%`;

    return {
      position: 'absolute' as const,
      left: `calc(80px + ${dayOffset})`,
      width: dayWidth,
      top: startSlot * slotHeight,
      height: (endSlot - startSlot + 1) * slotHeight,
      backgroundColor: 'rgba(24, 144, 255, 0.15)',
      border: `2px dashed ${themeColors.primary || '#1890ff'}`,
      borderRadius: '4px',
      pointerEvents: 'none' as const,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    };
  };

  return (
    <div className={styles.weekViewDraggable}>
      <style>{`
        .week-view-draggable {
          user-select: none;
        }
        .week-grid {
          position: relative;
          overflow-y: auto;
          max-height: 600px;
        }
        .week-row {
          display: flex;
          border-bottom: 1px solid ${themeColors.border};
          min-height: 40px;
        }
        .week-row:hover {
          background: ${themeColors.hover};
        }
        .time-cell {
          width: 80px;
          padding: 8px;
          text-align: center;
          font-weight: 500;
          color: ${themeColors.textSecondary};
          border-right: 1px solid ${themeColors.border};
        }
        .day-cell {
          flex: 1;
          padding: 4px;
          cursor: crosshair;
          position: relative;
          border-right: 1px solid ${themeColors.border};
        }
        .day-cell:last-child {
          border-right: none;
        }
        .day-cell.empty:hover::after {
          content: 'Drag';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 10px;
          color: ${themeColors.textSecondary};
          opacity: 0.5;
        }
        .week-header {
          display: flex;
          border-bottom: 2px solid ${themeColors.border};
          margin-bottom: 0;
          background: ${themeColors.background};
        }
        .week-header-cell {
          flex: 1;
          padding: 12px 8px;
          text-align: center;
          font-weight: 600;
        }
        .week-header-time {
          width: 80px;
        }
        .is-today {
          color: ${themeColors.primary || '#1890ff'};
          font-weight: bold;
        }
        .dragging {
          cursor: grabbing !important;
        }
      `}</style>

      {weekAppointments.length === 0 && (
        <Card className={styles.notificationCard}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No appointments scheduled for this week"
          >
            <div className={styles.notificationDescription}>
              <strong>Drag vertically</strong> in any day column to create an appointment
            </div>
          </Empty>
        </Card>
      )}

      <div ref={containerRef} className={`week-grid ${isDragging ? 'dragging' : ''}`}>
        {/* Header row with days */}
        <div className="week-header">
          <div className="week-header-time week-header-cell"></div>
          {weekDays.map((day) => (
            <div key={day.dayIndex} className={`week-header-cell ${day.isToday ? 'is-today' : ''}`}>
              <div className={styles.secondaryText}>
                {day.date.format('ddd')}
              </div>
              <div className={styles.dayNumber}>
                {day.date.format('D')}
              </div>
            </div>
          ))}
        </div>

        {/* Time slots */}
        <div className={styles.relative}>
          {timeSlots.map((slot) => (
            <div key={slot.time} className="week-row">
              <div className="time-cell">{slot.time}</div>
              {weekDays.map((day) => {
                const slotAppointments = getAppointmentsForSlot(day.date, slot.hour, slot.minute);
                const isEmpty = slotAppointments.length === 0;

                return (
                  <div
                    key={day.dayIndex}
                    className={`day-cell ${isEmpty ? 'empty' : ''}`}
                    onMouseDown={(e) => isEmpty && handleMouseDown(e, day.dayIndex, slot.slotIndex)}
                  >
                    {slotAppointments.map((apt) => (
                      <Tag
                        key={apt.id}
                        color={getStatusColor(apt.status)}
                        className={styles.appointmentTag}
                        onClick={() => onSelectAppointment(apt)}
                      >
                        <div>{dayjs(apt.start_time).format('HH:mm')}</div>
                        <div className={styles.appointmentTitle}>{apt.title}</div>
                      </Tag>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Drag preview */}
          {isDragging && dragStart && dragEnd && (
            <div style={getDragPreviewStyle()!}>
              <span className={styles.dragText}>
                New Appointment
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WeekViewDraggable;