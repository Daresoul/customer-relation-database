import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, Tag, Button, Empty, Space } from 'antd';
import { PlusOutlined, ClockCircleOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { Appointment } from '../../types/appointments';
import { useThemeColors } from '../../utils/themeStyles';

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

  // Generate 15-minute time slots from 8 AM to 8 PM
  const timeSlots = Array.from({ length: 49 }, (_, i) => {
    const hour = Math.floor(i / 4) + 8; // 8 AM start
    const minute = (i % 4) * 15; // 0, 15, 30, 45 minutes
    return {
      time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
      hour,
      minute,
      slotIndex: i,
    };
  });

  // Filter appointments for the selected day
  const dayAppointments = appointments
    .filter(apt => dayjs(apt.start_time).isSame(selectedDate, 'day'))
    .sort((a, b) => dayjs(a.start_time).valueOf() - dayjs(b.start_time).valueOf());

  // Calculate slot index from time
  const getSlotFromTime = (date: Dayjs): number => {
    const hour = date.hour();
    const minute = date.minute();
    const minuteSlot = Math.floor(minute / 15);
    return Math.max(0, Math.min(48, (hour - 8) * 4 + minuteSlot));
  };

  // Calculate appointment position and height
  const getAppointmentStyle = (apt: Appointment) => {
    const start = dayjs(apt.start_time);
    const end = dayjs(apt.end_time);
    const startSlot = getSlotFromTime(start);
    const endSlot = getSlotFromTime(end);
    const slotHeight = 60; // Height of each 15-minute slot

    return {
      top: startSlot * slotHeight,
      height: Math.max(slotHeight, (endSlot - startSlot) * slotHeight),
    };
  };

  // Get slot index from mouse position
  const getSlotFromMouseY = useCallback((clientY: number): number => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const scrollTop = containerRef.current.scrollTop;
    const relativeY = clientY - rect.top + scrollTop;
    const slotHeight = 60;
    return Math.max(0, Math.min(48, Math.floor(relativeY / slotHeight)));
  }, []);

  // Handle mouse down for drag start
  const handleMouseDown = useCallback((e: React.MouseEvent, slotIndex: number) => {
    if (e.target !== e.currentTarget) return; // Ignore if clicking on appointment
    e.preventDefault();
    const slot = getSlotFromMouseY(e.clientY);
    setIsDragging(true);
    setDragStart({ slot, y: e.clientY });
    setDragEnd({ slot, y: e.clientY });
    console.log('DayViewDraggable: Started dragging at slot', slot);
  }, [getSlotFromMouseY]);

  // Handle mouse move for dragging
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isMountedRef.current) return;

    if (!isDragging && !resizingAppointment) return;

    if (isDragging && dragStart) {
      const slot = getSlotFromMouseY(e.clientY);
      setDragEnd({ slot, y: e.clientY });
    } else if (resizingAppointment !== null) {
      // Handle appointment resizing
      const slot = getSlotFromMouseY(e.clientY);
      // Update preview of resize (would need state management for this)
    }
  }, [isDragging, dragStart, resizingAppointment, getSlotFromMouseY]);

  // Handle mouse up for drag end
  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!isMountedRef.current) return;

    console.log('DayViewDraggable: Mouse up, isDragging:', isDragging, 'dragStart:', dragStart, 'dragEnd:', dragEnd);

    if (isDragging && dragStart && dragEnd) {
      const startSlot = Math.min(dragStart.slot, dragEnd.slot);
      const endSlot = Math.max(dragStart.slot, dragEnd.slot) + 1; // +1 to include the end slot

      // Check if there was actual dragging (not just a click)
      const dragDistance = Math.abs(dragEnd.y - dragStart.y);
      const minDragDistance = 10; // Minimum pixels to consider it a drag

      if (dragDistance < minDragDistance) {
        // Just a click, not a drag - do nothing
        console.log('DayViewDraggable: Click detected (not drag), distance:', dragDistance);
        setIsDragging(false);
        setDragStart(null);
        setDragEnd(null);
        return;
      }

      const startTime = selectedDate
        .hour(Math.floor(startSlot / 4) + 8)
        .minute((startSlot % 4) * 15)
        .second(0);

      const endTime = selectedDate
        .hour(Math.floor(endSlot / 4) + 8)
        .minute((endSlot % 4) * 15)
        .second(0);

      if (endTime.diff(startTime, 'minutes') >= 15) {
        console.log('DayViewDraggable: Creating appointment from', startTime.format(), 'to', endTime.format());
        onCreateAppointment(startTime.toDate(), endTime.toDate());
      }
    }

    // Reset all drag states
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    setResizingAppointment(null);
    setResizeEdge(null);
  }, [isDragging, dragStart, dragEnd, selectedDate, onCreateAppointment]);

  // Add/remove global mouse event listeners
  useEffect(() => {
    if (isDragging || resizingAppointment !== null) {
      console.log('DayViewDraggable: Adding event listeners');
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        console.log('DayViewDraggable: Removing event listeners');
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

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      scheduled: 'blue',
      in_progress: 'orange',
      completed: 'green',
      cancelled: 'red',
    };
    return colors[status] || 'default';
  };

  // Calculate drag preview style
  const getDragPreviewStyle = () => {
    if (!isDragging || !dragStart || !dragEnd) return null;

    const startSlot = Math.min(dragStart.slot, dragEnd.slot);
    const endSlot = Math.max(dragStart.slot, dragEnd.slot);
    const slotHeight = 60;

    return {
      position: 'absolute' as const,
      left: 80,
      right: 16,
      top: startSlot * slotHeight,
      height: (endSlot - startSlot + 1) * slotHeight,
      backgroundColor: 'rgba(24, 144, 255, 0.15)',
      border: '2px dashed #1890ff',
      borderRadius: '4px',
      pointerEvents: 'none' as const,
      zIndex: 100,
    };
  };

  return (
    <div className="day-view-draggable" style={{ padding: '16px', background: '#fff', borderRadius: '8px' }}>
      <style>{`
        .day-view-draggable {
          user-select: none;
        }
        .time-grid {
          position: relative;
          overflow-y: auto;
          max-height: 600px;
        }
        .time-slot-row {
          position: relative;
          height: 60px;
          border-bottom: 1px solid #f0f0f0;
          display: flex;
          cursor: crosshair;
        }
        .time-slot-row:hover {
          background: #fafafa;
        }
        .time-slot-row.empty:hover::after {
          content: 'Drag to create';
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          font-size: 11px;
          color: #999;
          pointer-events: none;
          opacity: 0.6;
          white-space: nowrap;
        }
        .time-label {
          width: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 500;
          color: ${themeColors.textSecondary};
          pointer-events: none;
        }
        .slot-content {
          flex: 1;
          position: relative;
        }
        .appointment-card {
          position: absolute;
          left: 80px;
          right: 16px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          z-index: 10;
        }
        .appointment-card:hover {
          transform: translateX(2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 20;
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
          background: rgba(24, 144, 255, 0.3);
        }
        .dragging {
          cursor: grabbing !important;
        }
      `}</style>

      {dayAppointments.length === 0 && (
        <Card style={{ marginBottom: '16px', background: '#e6f7ff', borderColor: '#1890ff' }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No appointments scheduled for this day"
          >
            <div style={{ fontSize: '12px', color: themeColors.textSecondary, marginTop: '8px' }}>
              <strong>Drag vertically</strong> on the timeline below to create an appointment
            </div>
          </Empty>
        </Card>
      )}

      <div
        ref={containerRef}
        className={`time-grid ${isDragging ? 'dragging' : ''}`}
        style={{ position: 'relative' }}
      >
        {/* Time slots */}
        {timeSlots.map((slot) => {
          const hasAppointments = dayAppointments.some(apt => {
            const start = dayjs(apt.start_time);
            return start.hour() === slot.hour &&
                   start.minute() >= slot.minute &&
                   start.minute() < slot.minute + 15;
          });

          return (
            <div
              key={slot.time}
              className={`time-slot-row ${!hasAppointments ? 'empty' : ''}`}
              onMouseDown={(e) => handleMouseDown(e, slot.slotIndex)}
            >
              <div className="time-label">{slot.time}</div>
              <div className="slot-content" />
            </div>
          );
        })}

        {/* Drag preview */}
        {isDragging && dragStart && dragEnd && (
          <div style={getDragPreviewStyle()!}>
            <div style={{ padding: '8px', color: '#1890ff', fontWeight: 500 }}>
              New Appointment
            </div>
          </div>
        )}

        {/* Appointments */}
        {dayAppointments.map((apt) => {
          const style = getAppointmentStyle(apt);
          return (
            <Card
              key={apt.id}
              className="appointment-card"
              size="small"
              hoverable
              onClick={() => onSelectAppointment(apt)}
              style={{
                ...style,
                borderLeft: `4px solid ${getStatusColor(apt.status) === 'blue' ? '#1890ff' :
                  getStatusColor(apt.status) === 'orange' ? '#faad14' :
                  getStatusColor(apt.status) === 'green' ? '#52c41a' : '#ff4d4f'}`
              }}
            >
              {onUpdateAppointment && (
                <>
                  <div
                    className="resize-handle resize-handle-top"
                    onMouseDown={(e) => handleResizeStart(e, apt.id, 'top')}
                  />
                  <div
                    className="resize-handle resize-handle-bottom"
                    onMouseDown={(e) => handleResizeStart(e, apt.id, 'bottom')}
                  />
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '14px', marginBottom: '4px' }}>
                    {apt.title}
                  </div>
                  <Space size="small">
                    <span style={{ fontSize: '12px', color: themeColors.textSecondary }}>
                      <ClockCircleOutlined /> {dayjs(apt.start_time).format('HH:mm')} - {dayjs(apt.end_time).format('HH:mm')}
                    </span>
                    {apt.room_name && (
                      <span style={{ fontSize: '12px', color: themeColors.textSecondary }}>
                        📍 {apt.room_name}
                      </span>
                    )}
                  </Space>
                </div>
                <Tag color={getStatusColor(apt.status)} style={{ marginLeft: '8px' }}>
                  {apt.status}
                </Tag>
              </div>
              {apt.description && (
                <div style={{ fontSize: '12px', color: themeColors.textSecondary, marginTop: '8px' }}>
                  {apt.description}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default DayViewDraggable;