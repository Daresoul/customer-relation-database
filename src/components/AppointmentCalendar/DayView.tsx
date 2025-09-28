import React from 'react';
import { Timeline, Card, Tag, Button, Empty, Space } from 'antd';
import { PlusOutlined, ClockCircleOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { Appointment } from '../../types/appointments';
import { useThemeColors } from '../../utils/themeStyles';

interface DayViewProps {
  selectedDate: Dayjs;
  appointments: Appointment[];
  onSelectAppointment: (appointment: Appointment) => void;
  onCreateAppointment: (date: Date) => void;
}

const DayView: React.FC<DayViewProps> = ({
  selectedDate,
  appointments,
  onSelectAppointment,
  onCreateAppointment,
}) => {
  const themeColors = useThemeColors();


  // Filter appointments for the selected day
  const dayAppointments = appointments
    .filter(apt => dayjs(apt.start_time).isSame(selectedDate, 'day'))
    .sort((a, b) => dayjs(a.start_time).valueOf() - dayjs(b.start_time).valueOf());


  // Generate 15-minute time slots from 8 AM to 8 PM
  const timeSlots = Array.from({ length: 49 }, (_, i) => {
    const hour = Math.floor(i / 4) + 8; // 8 AM start
    const minute = (i % 4) * 15; // 0, 15, 30, 45 minutes
    return {
      time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
      hour,
      minute,
    };
  });

  const getAppointmentsForSlot = (hour: number, minute: number) => {
    return dayAppointments.filter(apt => {
      const aptStart = dayjs(apt.start_time);
      return aptStart.hour() === hour &&
             aptStart.minute() >= minute &&
             aptStart.minute() < minute + 15;
    });
  };

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      scheduled: 'blue',
      in_progress: 'orange',
      completed: 'green',
      cancelled: 'red',
    };
    return colors[status] || 'default';
  };

  const renderTimeSlot = (slot: { time: string; hour: number; minute: number }) => {
    const slotAppointments = getAppointmentsForSlot(slot.hour, slot.minute);
    const slotDate = selectedDate.hour(slot.hour).minute(slot.minute);

    return (
      <div key={slot.time} className="day-view-slot">
        <div style={{
          display: 'flex',
          gap: '16px',
          minHeight: '60px',
          borderBottom: '1px solid #f0f0f0',
          padding: '8px 0'
        }}>
          <div style={{
            width: '80px',
            flexShrink: 0,
            fontWeight: 500,
            color: themeColors.textSecondary,
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {slot.time}
          </div>
          <div style={{ flex: 1 }}>
            {slotAppointments.length === 0 ? (
              <div
                style={{
                  border: '1px dashed #d9d9d9',
                  borderRadius: '4px',
                  padding: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  minHeight: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                className="empty-slot"
                onClick={() => onCreateAppointment(slotDate.toDate())}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined />}
                  style={{ opacity: 0.5 }}
                  className="add-btn"
                >
                  Add appointment
                </Button>
              </div>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                {slotAppointments.map((apt) => (
                  <Card
                    key={apt.id}
                    size="small"
                    hoverable
                    onClick={() => onSelectAppointment(apt)}
                    style={{
                      borderLeft: `4px solid ${getStatusColor(apt.status) === 'blue' ? '#1890ff' :
                        getStatusColor(apt.status) === 'orange' ? '#faad14' :
                        getStatusColor(apt.status) === 'green' ? '#52c41a' : '#ff4d4f'}`
                    }}
                  >
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
                ))}
              </Space>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="day-view" style={{ padding: '16px', background: '#fff', borderRadius: '8px' }}>
      <style>{`
        .empty-slot:hover {
          background: #f5f5f5;
          border-color: #1890ff !important;
        }
        .empty-slot:hover .add-btn {
          opacity: 1 !important;
        }
        .day-view-slot:hover {
          background: #fafafa;
        }
      `}</style>

      {dayAppointments.length === 0 && (
        <Card style={{ marginBottom: '16px', background: '#e6f7ff', borderColor: '#1890ff' }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No appointments scheduled for this day"
          >
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => onCreateAppointment(selectedDate.hour(9).toDate())}
            >
              Schedule First Appointment
            </Button>
          </Empty>
        </Card>
      )}

      <div>
        {timeSlots.map(renderTimeSlot)}
      </div>
    </div>
  );
};

export default DayView;