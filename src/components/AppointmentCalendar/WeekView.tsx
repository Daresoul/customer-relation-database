import React from 'react';
import { Table, Tag, Button, Empty } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { Appointment } from '../../types/appointments';
import { useThemeColors } from '../../utils/themeStyles';

interface WeekViewProps {
  selectedDate: Dayjs;
  appointments: Appointment[];
  onSelectAppointment: (appointment: Appointment) => void;
  onCreateAppointment: (date: Date) => void;
}

const WeekView: React.FC<WeekViewProps> = ({
  selectedDate,
  appointments,
  onSelectAppointment,
  onCreateAppointment,
}) => {
  const themeColors = useThemeColors();

  // Get start and end of week
  const startOfWeek = selectedDate.startOf('week');
  const endOfWeek = selectedDate.endOf('week');

  // Generate time slots with 15-minute intervals (8 AM to 8 PM)
  const timeSlots = Array.from({ length: 49 }, (_, i) => {
    const hour = Math.floor(i / 4) + 8;
    const minute = (i % 4) * 15;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  });

  // Generate columns for each day of the week
  const columns = [
    {
      title: 'Time',
      dataIndex: 'time',
      key: 'time',
      width: 80,
      fixed: 'left' as const,
      render: (time: string) => (
        <div style={{ textAlign: 'center' }}>
          <strong>{time}</strong>
        </div>
      ),
    },
    ...Array.from({ length: 7 }, (_, i) => {
      const date = startOfWeek.add(i, 'day');
      const isToday = date.isSame(dayjs(), 'day');

      return {
        title: (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: themeColors.textSecondary }}>
              {date.format('ddd')}
            </div>
            <div style={{
              fontSize: '16px',
              fontWeight: isToday ? 'bold' : 'normal',
              color: isToday ? '#1890ff' : themeColors.text
            }}>
              {date.format('D')}
            </div>
          </div>
        ),
        dataIndex: date.format('YYYY-MM-DD'),
        key: date.format('YYYY-MM-DD'),
        width: 120,
        render: (_: any, record: any) => {
          const [hour, minute] = record.time.split(':').map(Number);
          const cellDate = date.hour(hour).minute(minute);
          const cellAppointments = appointments.filter(apt => {
            const aptStart = dayjs(apt.start_time);
            // Check if appointment starts within this 15-minute slot
            return aptStart.isSame(date, 'day') &&
                   aptStart.hour() === hour &&
                   aptStart.minute() >= minute &&
                   aptStart.minute() < minute + 15;
          });

          if (cellAppointments.length === 0) {
            return (
              <div
                style={{
                  minHeight: '40px',
                  cursor: 'pointer',
                  padding: '2px',
                  border: '1px solid transparent',
                  borderRadius: '4px',
                  transition: 'all 0.2s'
                }}
                className="week-cell-empty"
                onClick={() => onCreateAppointment(cellDate.toDate())}
              >
                <Button
                  size="small"
                  type="text"
                  icon={<PlusOutlined />}
                  style={{ opacity: 0, transition: 'opacity 0.2s' }}
                  className="add-appointment-btn"
                />
              </div>
            );
          }

          return (
            <div style={{ minHeight: '40px', padding: '2px' }}>
              {cellAppointments.map((apt) => (
                <Tag
                  key={apt.id}
                  color={getStatusColor(apt.status)}
                  style={{
                    cursor: 'pointer',
                    marginBottom: '4px',
                    display: 'block',
                    whiteSpace: 'normal',
                    height: 'auto'
                  }}
                  onClick={() => onSelectAppointment(apt)}
                >
                  <div style={{ fontSize: '11px' }}>
                    {dayjs(apt.start_time).format('HH:mm')}
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 500 }}>
                    {apt.title}
                  </div>
                </Tag>
              ))}
            </div>
          );
        },
      };
    }),
  ];

  const dataSource = timeSlots.map((time) => ({
    key: time,
    time,
  }));

  return (
    <div className="week-view">
      <style>{`
        .week-view .ant-table-cell {
          padding: 0 !important;
        }
        .week-cell-empty:hover {
          background: #f5f5f5;
          border-color: #d9d9d9 !important;
        }
        .week-cell-empty:hover .add-appointment-btn {
          opacity: 1 !important;
        }
      `}</style>
      <Table
        columns={columns}
        dataSource={dataSource}
        pagination={false}
        size="small"
        bordered
        scroll={{ x: 920 }}
      />
    </div>
  );
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

export default WeekView;