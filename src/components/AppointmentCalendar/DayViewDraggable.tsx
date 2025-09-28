import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, Tag, Button, Empty, Space, Tooltip } from 'antd';
import { PlusOutlined, ClockCircleOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { Appointment } from '../../types/appointments';
import { useThemeColors } from '../../utils/themeStyles';
import { useRooms } from '../../hooks/useRooms';

interface DayViewDraggableProps {
  selectedDate: Dayjs;
  appointments: Appointment[];
  onSelectAppointment: (appointment: Appointment) => void;
  onCreateAppointment: (startDate: Date, endDate: Date) => void;
  onUpdateAppointment?: (id: number, startDate: Date, endDate: Date) => void;
}

const DayViewDraggable: React.FC<DayViewDraggableProps> = ({
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
  const [resizingAppointment, setResizingAppointment] = useState<number | null>(null);
  const [resizeEdge, setResizeEdge] = useState<'top' | 'bottom' | null>(null);

  // Track if component is mounted to prevent stale events
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Clean up any lingering state
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
      setResizingAppointment(null);
      setResizeEdge(null);
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

  // Get slot from mouse position - exactly like WeekView but for single day
  const getSlotFromMouse = useCallback((clientX: number, clientY: number): number => {
    if (!containerRef.current) return 0;

    const rect = containerRef.current.getBoundingClientRect();
    const scrollTop = containerRef.current.scrollTop;
    const relativeY = clientY - rect.top + scrollTop - 60; // Subtract header height (60px)

    const slotHeight = 20; // 15-minute slot height (80px hour / 4 slots)

    const slot = Math.max(0, Math.min(95, Math.floor(relativeY / slotHeight))); // 24 * 4 - 1

    return slot;
  }, []);

  // Handle mouse down for drag start - exactly like WeekView
  const handleMouseDown = useCallback((e: React.MouseEvent, hourIndex: number) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();

    const slot = getSlotFromMouse(e.clientX, e.clientY);

    setIsDragging(true);
    setDragStart({ slot, y: e.clientY });
    setDragEnd({ slot, y: e.clientY });
  }, [getSlotFromMouse]);

  // Handle mouse move for dragging - exactly like WeekView
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isMountedRef.current) return;
    if (!isDragging && !resizingAppointment) return;

    const slot = getSlotFromMouse(e.clientX, e.clientY);

    if (isDragging && dragStart) {
      setDragEnd({ slot, y: e.clientY });
    }
  }, [isDragging, dragStart, resizingAppointment, getSlotFromMouse]);

  // Handle mouse up for drag end - exactly like WeekView
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
    setResizingAppointment(null);
    setResizeEdge(null);
  }, [isDragging, dragStart, dragEnd, selectedDate, onCreateAppointment]);

  // Add/remove global mouse event listeners
  useEffect(() => {
    if (isDragging || resizingAppointment !== null) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, resizingAppointment, handleMouseMove, handleMouseUp]);

  // Handle appointment resize start
  const handleResizeStart = useCallback((e: React.MouseEvent, appointmentId: number, edge: 'top' | 'bottom') => {
    e.stopPropagation();
    setResizingAppointment(appointmentId);
    setResizeEdge(edge);
  }, []);

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
        <div style={{ marginBottom: '2px' }}>
          <strong>Patient:</strong> {apt.patient_name || 'Unknown Patient'}
        </div>
        <div style={{ marginBottom: '2px' }}>
          <strong>Microchip ID:</strong> {apt.microchip_id || '-'}
        </div>
        <div style={{ marginBottom: '2px' }}>
          <strong>Time:</strong> {dayjs(apt.start_time).format('HH:mm')} - {dayjs(apt.end_time).format('HH:mm')}
        </div>
        <div style={{ marginBottom: '2px' }}>
          <strong>Date:</strong> {dayjs(apt.start_time).format('MMM DD, YYYY')}
        </div>
        {room && (
          <div style={{ marginBottom: '2px' }}>
            <strong>Room:</strong> {room.name}
          </div>
        )}
        <div style={{ marginBottom: '2px' }}>
          <strong>Status:</strong> {apt.status.replace('_', ' ')}
        </div>
        <div style={{ fontWeight: 'bold', marginTop: '4px', marginBottom: '4px' }}>{apt.title}</div>
        {apt.description && (
          <div style={{ fontStyle: 'italic' }}>
            {apt.description}
          </div>
        )}
      </div>
    );
  };

  // Render drag selection overlay - same as WeekView
  const renderDragOverlay = () => {
    if (!isDragging || !dragStart || !dragEnd) return null;

    const startSlot = Math.min(dragStart.slot, dragEnd.slot);
    const endSlot = Math.max(dragStart.slot, dragEnd.slot);
    const slotHeight = 20;

    return (
      <div
        style={{
          position: 'absolute',
          left: 80,
          right: 16,
          top: 60 + startSlot * slotHeight, // Add header height
          height: (endSlot - startSlot + 1) * slotHeight,
          background: 'rgba(24, 144, 255, 0.2)',
          border: '2px solid #1890ff',
          borderRadius: '4px',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />
    );
  };

  return (
    <div className="day-view-draggable" style={{ padding: '16px', background: themeColors.cardBg, borderRadius: '8px' }}>
      <style>{`
        .day-view-draggable {
          user-select: none;
          background: ${themeColors.cardBg};
        }
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
          height: 60px;
          display: flex;
        }
        .day-time-column {
          width: 80px;
          background: ${themeColors.background};
          border-right: 1px solid ${themeColors.border};
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .day-content-column {
          flex: 1;
          position: relative;
          background: ${themeColors.cardBg};
        }
        .day-hour-row {
          height: 80px;
          border-bottom: 1px solid ${themeColors.border};
          position: relative;
          display: flex;
        }
        .day-half-hour-line {
          position: absolute;
          top: 40px;
          left: 0;
          right: 0;
          height: 1px;
          background: ${themeColors.background};
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
          flex: 1;
        }
        .day-cell:hover {
          background: ${themeColors.hover};
        }
        .resize-handle {
          position: absolute;
          left: 0;
          right: 0;
          height: 8px;
          cursor: ns-resize;
          z-index: 30;
        }
        .resize-handle-top {
          top: 0;
        }
        .resize-handle-bottom {
          bottom: 0;
        }
        .resize-handle:hover {
          background: ${themeColors.selected};
        }
        .dragging {
          cursor: grabbing !important;
        }
      `}</style>

      <div className="day-view" style={{ height: '600px', overflow: 'auto', position: 'relative' }}>
        {/* Header with day label */}
        <div className="day-header">
          <div className="day-time-column">
            <span style={{ fontSize: '12px', color: themeColors.textSecondary }}>Time</span>
          </div>
          <div className="day-content-column" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{ fontSize: '12px', color: themeColors.textSecondary }}>
              {selectedDate.format('ddd')}
            </div>
            <div style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color: themeColors.text
            }}>
              {selectedDate.format('D')}
            </div>
          </div>
        </div>

        {/* Time grid */}
        <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {hourSlots.map((hour) => {
            const appointmentsWithLayout = calculateAppointmentLayout(dayAppointments);

            return (
              <div key={hour.hour} className="day-hour-row" style={{ display: 'flex' }}>
                {/* Time label */}
                <div className="day-time-label">
                  <span style={{
                    position: 'absolute',
                    top: '-12px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: themeColors.background,
                    padding: '0 4px',
                    fontWeight: 500
                  }}>
                    {hour.time}
                  </span>
                </div>

                {/* Day column */}
                <div
                  className="day-cell"
                  onMouseDown={(e) => handleMouseDown(e, hour.hour)}
                  style={{ position: 'relative' }}
                >
                  {/* Half-hour divider line */}
                  <div className="day-half-hour-line" />

                  {/* Appointments for this day */}
                  {hour.hour === 0 && appointmentsWithLayout.map(apt => {
                    const style = getAppointmentStyle(apt);
                    const roomColor = getRoomColor(apt);

                    // Calculate position and width based on column layout - positioned from container edge
                    const availableWidth = containerRef.current ? containerRef.current.clientWidth - 80 - 16 : 400; // Container width minus time column and padding
                    const columnWidth = availableWidth / apt.totalColumns;
                    const leftOffset = 80 + apt.column * columnWidth;

                    return (
                      <Tooltip
                        key={apt.id}
                        title={getTooltipContent(apt)}
                        placement="top"
                        mouseEnterDelay={0.5}
                        overlayStyle={{ maxWidth: '300px' }}
                      >
                        <Card
                          size="small"
                          hoverable
                          onClick={() => {
                            onSelectAppointment(apt);
                          }}
                          style={{
                            position: 'absolute',
                            left: leftOffset,
                            width: columnWidth - 2, // Subtract 2px for spacing
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
                          <div style={{
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            lineHeight: '14px',
                          }}>
                            {apt.title}
                          </div>
                          {style.height > 40 && (
                            <div style={{
                              fontSize: '10px',
                              color: themeColors.textSecondary,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}>
                              {dayjs(apt.start_time).format('HH:mm')} - {dayjs(apt.end_time).format('HH:mm')}
                            </div>
                          )}
                        </Card>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Drag overlay */}
        {renderDragOverlay()}
      </div>
    </div>
  );
};

export default DayViewDraggable;