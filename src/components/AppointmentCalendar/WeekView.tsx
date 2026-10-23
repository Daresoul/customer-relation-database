import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, Tooltip } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { Appointment, AppointmentStatus } from '../../types/appointments';
import { useThemeColors } from '../../utils/themeStyles';
import { useRooms } from '../../hooks/useRooms';
import { isClosedStatus, statusLabelKey } from '../../utils/appointmentStatus';
import { AppointmentStatusMenu } from './AppointmentStatusMenu';

import { useNow } from '../../hooks/useNow';
import styles from './WeekView.module.css';
import cardStyles from './AppointmentCard.module.css';
interface WeekViewProps {
  selectedDate: Dayjs;
  appointments: Appointment[];
  onSelectAppointment: (appointment: Appointment) => void;
  onCreateAppointment: (startDate: Date, endDate: Date) => void;
  onUpdateAppointment?: (id: number, startDate: Date, endDate: Date) => void;
  onDayHeaderClick?: (date: Dayjs) => void;
  onStatusChange?: (appointment: Appointment, status: AppointmentStatus) => void;
}

const WeekView: React.FC<WeekViewProps> = ({
  selectedDate,
  appointments,
  onSelectAppointment,
  onCreateAppointment,
  onDayHeaderClick,
  onStatusChange,
}) => {
  const { t } = useTranslation('appointments');
  const themeColors = useThemeColors();
  const { data: rooms = [] } = useRooms({ activeOnly: true });
  const containerRef = useRef<HTMLDivElement>(null);
  const now = useNow();
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ day: number; slot: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ day: number; slot: number; y: number } | null>(null);
  const [resizingAppointment, setResizingAppointment] = useState<number | null>(null);

  // Track if component is mounted to prevent stale events
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      setResizingAppointment(null);
    };
  }, []);

  // Get start and end of week
  const startOfWeek = selectedDate.startOf('week');
  const weekDays = Array.from({ length: 7 }, (_, i) => startOfWeek.add(i, 'day'));

  // Generate hourly slots from 00:00 to 23:59 (24 hours)
  const hourSlots = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    time: `${i.toString().padStart(2, '0')}:00`,
  }));

  // Filter appointments for the week
  const weekAppointments = appointments.filter(apt => {
    const aptDate = dayjs(apt.startTime);
    return aptDate.isSame(startOfWeek, 'week');
  });

  // Calculate slot index from time (15-minute precision)
  const getSlotFromTime = (date: Dayjs): number => {
    const hour = date.hour();
    const minute = date.minute();
    const minuteSlot = Math.floor(minute / 15);
    return hour * 4 + minuteSlot;
  };

  // Calculate appointment position and height
  const getAppointmentStyle = (apt: Appointment) => {
    const start = dayjs(apt.startTime);
    const end = dayjs(apt.endTime);
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
    if (!appointment.roomId) {
      return '#1890ff'; // Default blue color for appointments without rooms
    }

    const room = rooms.find(r => r.id === appointment.roomId);
    return room?.color || '#1890ff'; // Fallback to default blue
  };

  // Get slot and day from mouse position
  const getSlotAndDayFromMouse = useCallback((clientX: number, clientY: number): { day: number; slot: number } => {
    if (!containerRef.current) return { day: 0, slot: 0 };

    const rect = containerRef.current.getBoundingClientRect();
    const scrollTop = containerRef.current.scrollTop;
    const relativeY = clientY - rect.top + scrollTop - 60; // Subtract header height (60px)
    const relativeX = clientX - rect.left;

    const slotHeight = 20; // 15-minute slot height (80px hour / 4 slots)
    const dayWidth = (rect.width - 80) / 7; // Subtract time column width

    const slot = Math.max(0, Math.min(95, Math.floor(relativeY / slotHeight))); // 24 * 4 - 1
    const day = Math.max(0, Math.min(6, Math.floor((relativeX - 80) / dayWidth)));

    return { day, slot };
  }, []);

  // Handle mouse down for drag start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();

    const { day, slot } = getSlotAndDayFromMouse(e.clientX, e.clientY);

    setIsDragging(true);
    setDragStart({ day, slot, y: e.clientY });
    setDragEnd({ day, slot, y: e.clientY });
  }, [getSlotAndDayFromMouse]);

  // Handle mouse move for dragging
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isMountedRef.current) return;
    if (!isDragging && !resizingAppointment) return;

    const { day, slot } = getSlotAndDayFromMouse(e.clientX, e.clientY);

    if (isDragging && dragStart) {
      setDragEnd({ day, slot, y: e.clientY });
    }
  }, [isDragging, dragStart, resizingAppointment, getSlotAndDayFromMouse]);

  // Handle mouse up for drag end
  const handleMouseUp = useCallback(() => {
    if (!isMountedRef.current) return;


    if (isDragging && dragStart && dragEnd) {
      const startSlot = Math.min(dragStart.slot, dragEnd.slot);
      const endSlot = Math.max(dragStart.slot, dragEnd.slot) + 1; // Add 1 for minimum duration

      const startHour = Math.floor(startSlot / 4);
      const startMinute = (startSlot % 4) * 15;
      const endHour = Math.floor(endSlot / 4);
      const endMinute = (endSlot % 4) * 15;

      const dayDate = weekDays[dragEnd.day];
      const startDate = dayDate.hour(startHour).minute(startMinute).second(0).millisecond(0);
      const endDate = dayDate.hour(endHour).minute(endMinute).second(0).millisecond(0);


      onCreateAppointment(startDate.toDate(), endDate.toDate());
    }

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    setResizingAppointment(null);
  }, [isDragging, dragStart, dragEnd, weekDays, onCreateAppointment]);

  // Add global mouse event listeners
  useEffect(() => {
    if (isDragging || resizingAppointment) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, resizingAppointment, handleMouseMove, handleMouseUp]);

  // Render drag selection overlay
  const renderDragOverlay = () => {
    if (!isDragging || !dragStart || !dragEnd) return null;

    const startSlot = Math.min(dragStart.slot, dragEnd.slot);
    const endSlot = Math.max(dragStart.slot, dragEnd.slot);
    const slotHeight = 20;

    return (
      <div
        className={styles.dragOverlay}
        style={{
          left: 80 + dragEnd.day * ((document.querySelector('.week-view')?.clientWidth || 800) - 80) / 7,
          top: 60 + startSlot * slotHeight, // Add header height
          width: ((document.querySelector('.week-view')?.clientWidth || 800) - 80) / 7,
          height: (endSlot - startSlot + 1) * slotHeight,
        }}
      />
    );
  };

  // Get appointments for a specific day
  const getAppointmentsForDay = (dayIndex: number) => {
    const dayDate = weekDays[dayIndex];
    return weekAppointments.filter(apt =>
      dayjs(apt.startTime).isSame(dayDate, 'day')
    ).sort((a, b) =>
      dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf()
    );
  };

  // Calculate layout for overlapping appointments
  const calculateAppointmentLayout = (appointments: Appointment[]) => {
    const appointmentsWithLayout = appointments.map(apt => ({
      ...apt,
      startSlot: getSlotFromTime(dayjs(apt.startTime)),
      endSlot: getSlotFromTime(dayjs(apt.endTime)),
      column: 0,
      totalColumns: 1,
    }));

    // Group overlapping appointments
    const groups: (typeof appointmentsWithLayout[number])[][] = [];

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

      const columns: (typeof appointmentsWithLayout[number] | undefined)[] = [];

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

  // Create tooltip content for appointment
  const getTooltipContent = (apt: Appointment) => {
    const room = rooms.find(r => r.id === apt.roomId);

    return (
      <div>
        <div className={styles.tooltipInfo}>
          <strong>{t('details.patient')}:</strong> {apt.patientName || t('details.unknownPatient')}
        </div>
        <div className={styles.tooltipInfo}>
          <strong>{t('patients:fields.microchipId')}:</strong> {apt.microchipId || '-'}
        </div>
        <div className={styles.tooltipInfo}>
          <strong>{t('details.time')}:</strong> {dayjs(apt.startTime).format('HH:mm')} - {dayjs(apt.endTime).format('HH:mm')}
        </div>
        <div className={styles.tooltipInfo}>
          <strong>{t('fields.date')}:</strong> {dayjs(apt.startTime).format('MMM DD, YYYY')}
        </div>
        {room && (
          <div className={styles.tooltipInfo}>
            <strong>{t('details.room')}:</strong> {room.name}
          </div>
        )}
        <div className={styles.tooltipInfo}>
          <strong>{t('fields.status')}:</strong> {t(statusLabelKey(apt.status))}
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

  // Render appointment card
  const renderAppointment = (apt: Appointment & { column: number; totalColumns: number }) => {
    const style = getAppointmentStyle(apt);
    const roomColor = getRoomColor(apt);

    // Calculate position and width based on column layout
    const columnWidth = 100 / apt.totalColumns;
    const leftOffset = apt.column * columnWidth;

    const closed = isClosedStatus(apt.status);

    return (
      <AppointmentStatusMenu key={apt.id} appointment={apt} onStatusChange={onStatusChange}>
      <Tooltip
        title={getTooltipContent(apt)}
        placement="top"
        mouseEnterDelay={0.5}
        styles={{ root: { maxWidth: '300px' } }}
      >
        <Card
          size="small"
          hoverable
          className={`${styles.appointmentCard} ${closed ? cardStyles.closed : ''}`}
          data-status={apt.status}
          data-closed={closed ? 'true' : undefined}
          onClick={() => {
            onSelectAppointment(apt);
          }}
          style={{
            left: `${leftOffset}%`,
            width: `${columnWidth - 1}%`, // Subtract 1% for spacing
            top: style.top,
            height: style.height,
            borderLeft: `4px solid ${roomColor}`,
            backgroundColor: `${roomColor}10`, // Very light tint of room color
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
            <span className={cardStyles.statusDot} data-status={apt.status} title={t(statusLabelKey(apt.status))} />
            <span className={cardStyles.patientName}>{apt.patientName || t('details.unknownPatient')}</span>
          </div>
          <div className={`${styles.appointmentTime} ${cardStyles.title}`}>{apt.title}</div>
          {style.height > 40 && (
            <div className={styles.appointmentTime}>
              {dayjs(apt.startTime).format('HH:mm')} - {dayjs(apt.endTime).format('HH:mm')}
            </div>
          )}
        </Card>
      </Tooltip>
      </AppointmentStatusMenu>
    );
  };

  return (
    <div className={styles.weekView} ref={containerRef}>
      <style>{`
        .week-view {
          background: ${themeColors.cardBg};
          border-radius: 8px;
        }
        .week-header {
          position: sticky;
          top: 0;
          background: ${themeColors.cardBg};
          z-index: 20;
          border-bottom: 2px solid ${themeColors.border};
        }
        .week-time-column {
          width: 80px;
          background: ${themeColors.background};
          border-right: 1px solid ${themeColors.border};
          flex-shrink: 0;
        }
        .week-day-column {
          flex: 1;
          border-right: 1px solid ${themeColors.border};
          position: relative;
        }
        .week-day-column:last-child {
          border-right: none;
        }
        .week-hour-row {
          height: 80px;
          border-bottom: 1px solid ${themeColors.border};
          position: relative;
        }
        .week-half-hour-line {
          position: absolute;
          top: 40px;
          left: 0;
          right: 0;
          height: 1px;
          border-top: 1px dashed ${themeColors.border};
        }
        .week-time-label {
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
        .week-cell {
          height: 80px;
          cursor: crosshair;
          position: relative;
        }
        .week-cell:hover {
          background: ${themeColors.hover};
        }
        .today-column {
          background: ${themeColors.primary}08;
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

      {/* Header with day labels */}
      <div className={styles.weekHeader}>
        <div className={styles.weekTimeColumn}>
          <span className={styles.secondaryText}>{t('calendar.timeLabel')}</span>
        </div>
        {weekDays.map((day, index) => {
          const isToday = day.isSame(dayjs(), 'day');
          return (
            <div
              key={index}
              className={styles.dayHeader}
              onClick={() => onDayHeaderClick && onDayHeaderClick(day)}
              style={{
                background: isToday ? `${themeColors.primary || '#1890ff'}15` : 'transparent',
                borderTop: isToday ? `2px solid ${themeColors.primary || '#1890ff'}` : 'none',
                cursor: onDayHeaderClick ? 'pointer' : 'default',
              }}
              onMouseEnter={(e) => {
                if (onDayHeaderClick) {
                  e.currentTarget.style.background = themeColors.hover;
                }
              }}
              onMouseLeave={(e) => {
                if (onDayHeaderClick) {
                  e.currentTarget.style.background = isToday ? `${themeColors.primary || '#1890ff'}15` : 'transparent';
                }
              }}
            >
              <div className={styles.secondaryText}>
                {day.format('ddd')}
              </div>
              <div
                className={styles.dayNumber}
                style={{
                  fontWeight: isToday ? 'bold' : 'normal',
                  color: isToday ? themeColors.primary || '#1890ff' : themeColors.text
                }}
              >
                {day.format('D')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className={styles.timeGridContainer}>
        {hourSlots.map((hour) => (
          <div key={hour.hour} className={styles.weekHourRow}>
            {/* Time label */}
            <div className="week-time-label">
              <span className={styles.timeLabelSpan}>
                {hour.time}
              </span>
            </div>

            {/* Day columns */}
            {weekDays.map((day, dayIndex) => {
              const isToday = day.isSame(dayjs(), 'day');
              const dayAppointments = getAppointmentsForDay(dayIndex);
              const appointmentsWithLayout = calculateAppointmentLayout(dayAppointments);

              return (
                <div
                  key={dayIndex}
                  className={`week-day-column week-cell ${isToday ? 'today-column' : ''} ${styles.relative}`}
                  onMouseDown={handleMouseDown}
                >
                  {/* Half-hour divider line */}
                  <div className="week-half-hour-line" />

                  {/* Appointments for this day */}
                  {hour.hour === 0 && appointmentsWithLayout.map(apt => renderAppointment(apt))}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Current time indicator (only for today) */}
      {weekDays.some(day => day.isSame(now, 'day')) && (() => {
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

export default WeekView;