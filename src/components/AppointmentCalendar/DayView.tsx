import React from 'react';
import { Timeline, Card, Tag, Button, Empty, Space } from 'antd';
import { PlusOutlined, ClockCircleOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { Appointment } from '../../types/appointments';
import { useThemeColors } from '../../utils/themeStyles';
import { useTranslation } from 'react-i18next';

import styles from './DayView.module.css';
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
  const { t } = useTranslation('appointments');
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
        <div className={styles.timeSlotContainer}>
          <div className={styles.timeLabel}>
            {slot.time}
          </div>
          <div className={styles.flex1}>
            {slotAppointments.length === 0 ? (
              <div
                className={styles.emptySlot}
                onClick={() => onCreateAppointment(slotDate.toDate())}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined />}
                  className={styles.faded}
                  className="add-btn"
                >
                  Add appointment
                </Button>
              </div>
            ) : (
              <Space direction="vertical" className={styles.fullWidth}>
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
                    <div className={styles.appointmentCardHeader}>
                      <div>
                        <div className={styles.appointmentCardTitle}>
                          {apt.title}
                        </div>
                        <Space size="small">
                          <span className={styles.secondaryText}>
                            <ClockCircleOutlined /> {dayjs(apt.start_time).format('HH:mm')} - {dayjs(apt.end_time).format('HH:mm')}
                          </span>
                          {apt.room_name && (
                            <span className={styles.secondaryText}>
                              📍 {apt.room_name}
                            </span>
                          )}
                        </Space>
                      </div>
                      <Tag color={getStatusColor(apt.status)} className={styles.tagMarginLeft}>
                        {apt.status}
                      </Tag>
                    </div>
                    {apt.description && (
                      <div className={styles.appointmentDescription}>
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
    <div className={styles.dayView}>
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
        <Card className={styles.notificationCard}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('noAppointmentsDay')}
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