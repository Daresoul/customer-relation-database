import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, Tag, Button, Empty, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { Appointment } from '../../types/appointments';
import { useThemeColors } from '../../utils/themeStyles';
import { useRooms } from '../../hooks/useRooms';

import styles from './DayViewSimple.module.css';
interface DayViewSimpleProps {
  selectedDate: Dayjs;
  appointments: Appointment[];
  onSelectAppointment: (appointment: Appointment) => void;
  onCreateAppointment: (startDate: Date, endDate: Date) => void;
  onUpdateAppointment?: (id: number, startDate: Date, endDate: Date) => void;
}

const DayViewSimple: React.FC<DayViewSimpleProps> = ({
  selectedDate,
  appointments,
  onSelectAppointment,
  onCreateAppointment,
  onUpdateAppointment,
}) => {
  const themeColors = useThemeColors();
  const { data: rooms = [] } = useRooms({ active_only: true });
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ slot: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ slot: number; y: number } | null>(null);

  // Track if component is mounted to prevent stale events
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

  // Generate hourly slots from 00:00 to 23:59 (24 hours) - same as WeekView
  const hourSlots = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    time: `${i.toString().padStart(2, '0')}:00`,
  }));


  // Filter appointments for the selected day
  const dayAppointments = appointments
    .filter(apt => dayjs(apt.start_time).isSame(selectedDate, 'day'))
    .sort((a, b) => dayjs(a.start_time).valueOf() - dayjs(b.start_time).valueOf());



  // Calculate slot index from time (15-minute precision) - same as WeekView
  const getSlotFromTime = (date: Dayjs): number => {
    const hour = date.hour();
    const minute = date.minute();
    const minuteSlot = Math.floor(minute / 15);
    return hour * 4 + minuteSlot;
  };

  // Get slot from mouse position - EXACTLY like WeekView
  const getSlotFromMouse = useCallback((clientX: number, clientY: number): number => {
    if (!containerRef.current) return 0;

    const rect = containerRef.current.getBoundingClientRect();
    const scrollTop = containerRef.current.scrollTop;
    const relativeY = clientY - rect.top + scrollTop - 60; // Subtract header height (60px)

    const slotHeight = 20; // 15-minute slot height (80px hour / 4 slots)

    const slot = Math.max(0, Math.min(95, Math.floor(relativeY / slotHeight))); // 24 * 4 - 1

    return slot;
  }, []);

  // Handle mouse down for drag start - EXACTLY like WeekView
  const handleMouseDown = useCallback((e: React.MouseEvent, hourIndex: number) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();

    const slot = getSlotFromMouse(e.clientX, e.clientY);

    setIsDragging(true);
    setDragStart({ slot, y: e.clientY });
    setDragEnd({ slot, y: e.clientY });
  }, [getSlotFromMouse]);

  // Handle mouse move for dragging - EXACTLY like WeekView
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isMountedRef.current) return;
    if (!isDragging) return;

    const slot = getSlotFromMouse(e.clientX, e.clientY);

    if (isDragging && dragStart) {
      setDragEnd({ slot, y: e.clientY });
    }
  }, [isDragging, dragStart, getSlotFromMouse]);

  // Handle mouse up for drag end - EXACTLY like WeekView
  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!isMountedRef.current) return;


    if (isDragging && dragStart && dragEnd) {
      const startSlot = Math.min(dragStart.slot, dragEnd.slot);
      const endSlot = Math.max(dragStart.slot, dragEnd.slot) + 1; // Add 1 for minimum duration

      const startHour = Math.floor(startSlot / 4);
      const startMinute = (startSlot % 4) * 15;
      const endHour = Math.floor(endSlot / 4);
      const endMinute = (endSlot % 4) * 15;

      const startDate = selectedDate.hour(startHour).minute(startMinute).second(0).millisecond(0);
      const endDate = selectedDate.hour(endHour).minute(endMinute).second(0).millisecond(0);


      onCreateAppointment(startDate.toDate(), endDate.toDate());
    }

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, dragStart, dragEnd, selectedDate, onCreateAppointment]);

  // Add global mouse event listeners - EXACTLY like WeekView
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

  // Calculate appointment position and height - same as WeekView
  const getAppointmentStyle = (apt: Appointment) => {
    const start = dayjs(apt.start_time);
    const end = dayjs(apt.end_time);
    const startSlot = getSlotFromTime(start);
    const endSlot = getSlotFromTime(end);
    const slotHeight = 20; // Height of each 15-minute slot (80px hour / 4)

    return {
      top: startSlot * slotHeight,
      height: Math.max(slotHeight, (endSlot - startSlot) * slotHeight),
    };
  };

  // Get room color for appointment
  const getRoomColor = (appointment: Appointment): string => {
    if (!appointment.room_id) {
      return '#1890ff'; // Default blue color for appointments without rooms
    }

    const room = rooms.find(r => r.id === appointment.room_id);
    return room?.color || '#1890ff'; // Fallback to default blue
  };

  // Create tooltip content for appointment
  const getTooltipContent = (apt: Appointment) => {
    const room = rooms.find(r => r.id === apt.room_id);

    return (
      <div>
        <div className={styles.tooltipInfo}>
          <strong>Patient:</strong> {apt.patient_name || 'Unknown Patient'}
        </div>
        <div className={styles.tooltipInfo}>
          <strong>Microchip ID:</strong> {apt.microchip_id || '-'}
        </div>
        <div className={styles.tooltipInfo}>
          <strong>Time:</strong> {dayjs(apt.start_time).format('HH:mm')} - {dayjs(apt.end_time).format('HH:mm')}
        </div>
        <div className={styles.tooltipInfo}>
          <strong>Date:</strong> {dayjs(apt.start_time).format('MMM DD, YYYY')}
        </div>
        {room && (
          <div className={styles.tooltipInfo}>
            <strong>Room:</strong> {room.name}
          </div>
        )}
        <div className={styles.tooltipInfo}>
          <strong>Status:</strong> {apt.status.replace('_', ' ')}
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

  // Calculate layout for overlapping appointments - same as WeekView
  const calculateAppointmentLayout = (appointments: Appointment[]) => {
    const appointmentsWithLayout = appointments.map(apt => ({
      ...apt,
      startSlot: getSlotFromTime(dayjs(apt.start_time)),
      endSlot: getSlotFromTime(dayjs(apt.end_time)),
      column: 0,
      totalColumns: 1,
    }));

    // Group overlapping appointments
    const groups: typeof appointmentsWithLayout[][] = [];

    appointmentsWithLayout.forEach(apt => {
      // Find existing group that overlaps with this appointment
      let addedToGroup = false;

      for (const group of groups) {
        const overlaps = group.some(existing =>
          apt.startSlot < existing.endSlot && apt.endSlot > existing.startSlot
        );

        if (overlaps) {
          group.push(apt);
          addedToGroup = true;
          break;
        }
      }

      if (!addedToGroup) {
        groups.push([apt]);
      }
    });

    // Assign columns within each group
    groups.forEach(group => {
      group.sort((a, b) => a.startSlot - b.startSlot);

      const columns: typeof appointmentsWithLayout[] = [];

      group.forEach(apt => {
        // Find the first column where this appointment can fit
        let columnIndex = 0;

        while (columnIndex < columns.length) {
          const lastInColumn = columns[columnIndex];
          if (!lastInColumn || lastInColumn.endSlot <= apt.startSlot) {
            break;
          }
          columnIndex++;
        }

        apt.column = columnIndex;
        columns[columnIndex] = apt;

        // Update total columns for all appointments in this group
        group.forEach(groupApt => {
          groupApt.totalColumns = Math.max(groupApt.totalColumns, columnIndex + 1);
        });
      });
    });

    return appointmentsWithLayout;
  };

  // Render drag selection overlay - covers full width for better drag experience
  const renderDragOverlay = () => {
    if (!isDragging || !dragStart || !dragEnd) return null;

    const startSlot = Math.min(dragStart.slot, dragEnd.slot);
    const endSlot = Math.max(dragStart.slot, dragEnd.slot);
    const slotHeight = 20;

    return (
      <div
        className={styles.dragOverlay}
        style={{
          top: 60 + startSlot * slotHeight, // Add header height
          height: (endSlot - startSlot + 1) * slotHeight,
        }}
      />
    );
  };

  // Render appointment card - modified to leave space for dragging
  const renderAppointment = (apt: Appointment & { column: number; totalColumns: number }) => {
    const style = getAppointmentStyle(apt);
    const roomColor = getRoomColor(apt);

    // Calculate position and width - leave 5% on the left for drag area
    const availableWidth = 95; // Use only 95% of the width, leaving 5% for drag area
    const columnWidth = availableWidth / apt.totalColumns;
    const leftOffset = 5 + (apt.column * columnWidth); // Start at 5% from left

    return (
      <Tooltip
        key={apt.id}
        title={getTooltipContent(apt)}
        placement="top"
        mouseEnterDelay={0.5}
        styles={{ root: { maxWidth: '300px' } }}
      >
        <Card
          size="small"
          hoverable
          className={apt.status === 'cancelled' ? 'appointment-cancelled' : ''}
          onClick={() => {
            onSelectAppointment(apt);
          }}
          style={{
            position: 'absolute',
            left: `${leftOffset}%`,
            width: `${columnWidth - 1}%`, // Subtract 1% for spacing
            top: style.top,
            height: style.height,
            minHeight: '20px',
            zIndex: 15,
            cursor: 'pointer',
            borderLeft: `4px solid ${roomColor}`,
            backgroundColor: `${roomColor}10`, // Very light tint of room color
            fontSize: '12px',
            overflow: 'hidden',
          }}
          styles={{
            body: {
              padding: '4px 8px',
              height: '100%',
              overflow: 'hidden',
            }
          }}
        >
          <div className={styles.appointmentTitle}>
            {apt.title}
          </div>
          {style.height > 40 && (
            <div className={styles.appointmentTime}>
              {dayjs(apt.start_time).format('HH:mm')} - {dayjs(apt.end_time).format('HH:mm')}
            </div>
          )}
        </Card>
      </Tooltip>
    );
  };

  const appointmentsWithLayout = calculateAppointmentLayout(dayAppointments);

  return (
    <div className={styles.dayView} ref={containerRef}>
      <style>{`
        .day-view {
          background: ${themeColors.cardBg};
          border-radius: 8px;
        }
        .day-header {
          position: sticky;
          top: 0;
          background: ${themeColors.cardBg};
          z-index: 20;
          border-bottom: 2px solid ${themeColors.border};
        }
        .day-time-column {
          width: 80px;
          background: ${themeColors.background};
          border-right: 1px solid ${themeColors.border};
          flex-shrink: 0;
        }
        .day-content-column {
          flex: 1;
          border-right: 1px solid ${themeColors.border};
          position: relative;
        }
        .day-hour-row {
          height: 80px;
          border-bottom: 1px solid ${themeColors.border};
          position: relative;
        }
        .day-half-hour-line {
          position: absolute;
          top: 40px;
          left: 0;
          right: 0;
          height: 1px;
          border-top: 1px dashed ${themeColors.border};
        }
        .day-time-label {
          width: 80px;
          height: 80px;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 0px;
          font-size: 12px;
          color: ${themeColors.textSecondary};
          background: ${themeColors.background};
          border-right: 1px solid ${themeColors.border};
          flex-shrink: 0;
          position: relative;
        }
        .day-cell {
          height: 80px;
          cursor: crosshair;
          position: relative;
        }
        .day-cell:hover {
          background: ${themeColors.hover};
        }
        .day-cell::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 5%;
          background: linear-gradient(90deg, ${themeColors.hover}20 0%, transparent 100%);
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .day-cell:hover::before {
          opacity: 1;
        }
        .current-time-line {
          position: absolute;
          left: 80px;
          right: 0;
          height: 2px;
          background: #ff4d4f;
          z-index: 15;
          pointer-events: none;
        }
        .current-time-line::before {
          content: '';
          position: absolute;
          left: -6px;
          top: -3px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ff4d4f;
        }
      `}</style>

      {/* Header with day label - EXACTLY like WeekView */}
      <div className={styles.dayHeader}>
        <div className={styles.dayTimeColumn}>
          <span className={styles.secondaryText}>Time</span>
        </div>
        <div className={styles.dayContentColumn}>
          <div className={styles.secondaryText}>
            {selectedDate.format('ddd')}
          </div>
          <div className={styles.dayNumber}>
            {selectedDate.format('D')}
          </div>
        </div>
      </div>

      {/* Time grid - EXACTLY like WeekView structure */}
      <div className={styles.dayContent}>
        {hourSlots.map((hour) => (
          <div key={hour.hour} className={styles.dayHourRow}>
            {/* Time label */}
            <div className="day-time-label">
              <span className={styles.timeLabelSpan}>
                {hour.time}
              </span>
            </div>

            {/* Day column - EXACTLY like WeekView day column */}
            <div
              className={`day-content-column day-cell ${styles.relative}`}
              onMouseDown={(e) => handleMouseDown(e, hour.hour)}
            >
              {/* Half-hour divider line */}
              <div className="day-half-hour-line" />

              {/* Appointments for this day - EXACTLY like WeekView */}
              {hour.hour === 0 && appointmentsWithLayout.map(apt => renderAppointment(apt))}
            </div>
          </div>
        ))}
      </div>

      {/* Current time indicator (only for today) */}
      {selectedDate.isSame(dayjs(), 'day') && (() => {
        const now = dayjs();
        const currentSlot = getSlotFromTime(now);
        const slotHeight = 20;

        return (
          <div
            className="current-time-line"
            style={{ top: 60 + currentSlot * slotHeight }}
          />
        );
      })()}

      {/* Drag overlay */}
      {renderDragOverlay()}
    </div>
  );
};

export default DayViewSimple;