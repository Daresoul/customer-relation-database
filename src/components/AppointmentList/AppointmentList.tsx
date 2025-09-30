import React, { useEffect, useRef } from 'react';
import {
  List,
  Card,
  Tag,
  Button,
  Space,
  Dropdown,
  Typography,
  Spin,
  Empty,
  Avatar,
  Tooltip,
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  MoreOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Appointment } from '../../types/appointments';
import { useAppointments } from '../../hooks/useAppointments';
import appointmentService from '../../services/appointmentService';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import styles from './AppointmentList.module.css';

dayjs.extend(relativeTime);

const { Text, Title } = Typography;

interface AppointmentListProps {
  filter?: any;
  onEdit: (appointment: Appointment) => void;
  onDelete: (appointment: Appointment) => void;
  onDuplicate: (appointment: Appointment) => void;
  onSelect: (appointment: Appointment) => void;
}

const AppointmentList: React.FC<AppointmentListProps> = ({
  filter,
  onEdit,
  onDelete,
  onDuplicate,
  onSelect,
}) => {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const {
    appointments,
    totalCount,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useAppointments(filter);

  // Set up infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const getStatusTag = (status: string) => {
    const statusConfig: Record<string, { color: string; text: string }> = {
      scheduled: { color: 'blue', text: 'Scheduled' },
      in_progress: { color: 'orange', text: 'In Progress' },
      completed: { color: 'green', text: 'Completed' },
      cancelled: { color: 'red', text: 'Cancelled' },
    };

    const config = statusConfig[status] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const getActionItems = (appointment: Appointment) => [
    {
      key: 'edit',
      label: 'Edit',
      icon: <EditOutlined />,
      onClick: () => onEdit(appointment),
      disabled: !appointmentService.isAppointmentEditable(appointment),
    },
    {
      key: 'duplicate',
      label: 'Duplicate',
      icon: <CopyOutlined />,
      onClick: () => onDuplicate(appointment),
    },
    {
      key: 'divider',
      type: 'divider',
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: <DeleteOutlined />,
      onClick: () => onDelete(appointment),
      danger: true,
      disabled: appointment.status !== 'scheduled',
    },
  ];

  const renderAppointmentItem = (appointment: Appointment) => {
    const startTime = dayjs(appointment.start_time);
    const endTime = dayjs(appointment.end_time);
    const duration = appointmentService.calculateDuration(
      appointment.start_time,
      appointment.end_time
    );
    const isToday = startTime.isSame(dayjs(), 'day');
    const isPast = startTime.isBefore(dayjs());

    return (
      <Card
        className={`${styles.appointmentListItem} ${
          isPast ? styles.past : ''
        } ${isToday ? styles.today : ''}`}
        hoverable
        onClick={() => onSelect(appointment)}
      >
        <div className={styles.appointmentListContent}>
          <div className={styles.appointmentListHeader}>
            <Space>
              <Avatar
                icon={<UserOutlined />}
                style={{
                  backgroundColor: appointmentService.getStatusColor(appointment.status),
                }}
              />
              <div>
                <Title level={5} className={styles.appointmentTitle}>
                  {appointment.title}
                </Title>
                <Space size="small">
                  <Text type="secondary">
                    <UserOutlined /> {appointment.patient_name || 'Unknown Patient'}
                  </Text>
                  {appointment.species && (
                    <Text type="secondary">• {appointment.species}</Text>
                  )}
                </Space>
              </div>
            </Space>
            <Space>
              {getStatusTag(appointment.status)}
              <Dropdown
                menu={{ items: getActionItems(appointment) }}
                trigger={['click']}
                placement="bottomRight"
              >
                <Button
                  icon={<MoreOutlined />}
                  type="text"
                  onClick={(e) => e.stopPropagation()}
                />
              </Dropdown>
            </Space>
          </div>

          <div className={styles.appointmentListDetails}>
            <Space size="large">
              <Tooltip title={startTime.format('MMMM DD, YYYY')}>
                <Space size="small">
                  <ClockCircleOutlined />
                  <Text>
                    {startTime.format('MMM DD, HH:mm')} - {endTime.format('HH:mm')}
                  </Text>
                  <Text type="secondary">({duration} min)</Text>
                </Space>
              </Tooltip>

              {appointment.room_id && (
                <Space size="small">
                  <EnvironmentOutlined />
                  <Text>Room {appointment.room_id}</Text>
                </Space>
              )}

              {isToday && (
                <Tag color="processing" icon={<ClockCircleOutlined />}>
                  Today
                </Tag>
              )}
            </Space>
          </div>

          {appointment.description && (
            <div className={styles.appointmentListDescription}>
              <Text type="secondary">{appointment.description}</Text>
            </div>
          )}

          <div className={styles.appointmentListFooter}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Created {dayjs(appointment.created_at).fromNow()} by {appointment.created_by}
            </Text>
          </div>
        </div>
      </Card>
    );
  };

  if (isLoading && appointments.length === 0) {
    return (
      <div className={styles.appointmentListLoading}>
        <Spin size="large" />
      </div>
    );
  }

  if (!isLoading && appointments.length === 0) {
    return (
      <Empty
        description="No appointments found"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  return (
    <div className={styles.appointmentList}>
      <div className={styles.appointmentListHeaderInfo}>
        <Text type="secondary">
          Showing {appointments.length} of {totalCount} appointments
        </Text>
      </div>

      <List
        dataSource={appointments}
        renderItem={renderAppointmentItem}
        itemLayout="vertical"
        split={false}
        className={styles.appointmentListContainer}
      />

      <div ref={loadMoreRef} className={styles.loadMoreTrigger}>
        {isFetchingNextPage && (
          <div className={styles.loadingMore}>
            <Spin />
            <Text type="secondary">Loading more appointments...</Text>
          </div>
        )}
      </div>
    </div>
  );
};

export default AppointmentList;