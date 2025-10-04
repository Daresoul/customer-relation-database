import React, { useState, useCallback } from 'react';
import {
  Layout,
  Tabs,
  Button,
  Space,
  Select,
  DatePicker,
  Input,
  Drawer,
  Modal,
  App,
  Card,
  Statistic,
  Row,
  Col,
} from 'antd';
import {
  CalendarOutlined,
  UnorderedListOutlined,
  PlusOutlined,
  FilterOutlined,
  ReloadOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import AppointmentCalendar from '../../components/AppointmentCalendar/AppointmentCalendar';
import AppointmentList from '../../components/AppointmentList/AppointmentList';
import AppointmentModal from '../../components/AppointmentModal/AppointmentModal';
import {
  Appointment,
  AppointmentFilter,
  CalendarView,
  CreateAppointmentInput,
  UpdateAppointmentInput,
  DuplicateAppointmentInput,
} from '../../types/appointments';
import {
  useAppointments,
  useAppointmentDetail,
  useRooms,
} from '../../hooks/useAppointments';
import styles from './Appointments.module.css';

const { Header, Content, Sider } = Layout;
const { RangePicker } = DatePicker;
const { Search } = Input;
const { Option } = Select;

const Appointments: React.FC = () => {
  const { message } = App.useApp();
  const [activeTab, setActiveTab] = useState<'calendar' | 'list'>('calendar');
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false);
  const [filterDrawerVisible, setFilterDrawerVisible] = useState(false);
  const [initialDate, setInitialDate] = useState<Date>(new Date());
  const [filter, setFilter] = useState<AppointmentFilter>({});

  const {
    appointments,
    createAppointment,
    updateAppointment,
    deleteAppointment,
    duplicateAppointment,
    refetch,
    isCreating,
    isUpdating,
    isDeleting,
  } = useAppointments(filter);

  const { rooms } = useRooms();

  const { data: appointmentDetail } = useAppointmentDetail(
    selectedAppointment?.id
  );

  // Handle appointment selection
  const handleSelectAppointment = useCallback((appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setDetailDrawerVisible(true);
  }, []);

  // Handle create appointment
  const handleCreateAppointment = useCallback((date?: Date) => {
    setInitialDate(date || new Date());
    setModalMode('create');
    setSelectedAppointment(null);
    setModalVisible(true);
  }, []);

  // Handle edit appointment
  const handleEditAppointment = useCallback((appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setModalMode('edit');
    setModalVisible(true);
    setDetailDrawerVisible(false);
  }, []);

  // Handle delete appointment
  const handleDeleteAppointment = useCallback(
    async (appointment: Appointment) => {
      Modal.confirm({
        title: 'Delete Appointment',
        content: `Are you sure you want to delete the appointment "${appointment.title}"?`,
        okText: 'Delete',
        okType: 'danger',
        onOk: async () => {
          try {
            await deleteAppointment(appointment.id);
            message.success('Appointment deleted successfully');
            setDetailDrawerVisible(false);
          } catch (error) {
            message.error('Failed to delete appointment');
          }
        },
      });
    },
    [deleteAppointment]
  );

  // Handle duplicate appointment
  const handleDuplicateAppointment = useCallback(
    async (appointment: Appointment) => {
      const targetDate = await new Promise<Date | null>((resolve) => {
        let selectedDate: Date | null = null;
        Modal.confirm({
          title: 'Duplicate Appointment',
          content: (
            <div>
              <p>Select a date to duplicate this appointment to:</p>
              <DatePicker
                onChange={(date) => {
                  selectedDate = date?.toDate() || null;
                }}
                disabledDate={(current) =>
                  current && current < dayjs().startOf('day')
                }
              />
            </div>
          ),
          onOk: () => resolve(selectedDate),
          onCancel: () => resolve(null),
        });
      });

      if (targetDate) {
        try {
          const input: DuplicateAppointmentInput = {
            appointment_id: appointment.id,
            target_date: targetDate.toISOString(),
          };
          await duplicateAppointment(input);
          message.success('Appointment duplicated successfully');
        } catch (error) {
          message.error('Failed to duplicate appointment');
        }
      }
    },
    [duplicateAppointment]
  );

  // Handle save appointment (create or update)
  const handleSaveAppointment = async (
    data: CreateAppointmentInput | UpdateAppointmentInput
  ) => {
    try {
      if (modalMode === 'create') {
        await createAppointment(data as CreateAppointmentInput);
        message.success('Appointment created successfully');
      } else if (selectedAppointment) {
        await updateAppointment({
          id: selectedAppointment.id,
          input: data as UpdateAppointmentInput,
        });
        message.success('Appointment updated successfully');
      }
      setModalVisible(false);
      refetch();
    } catch (error) {
      message.error(
        `Failed to ${modalMode === 'create' ? 'create' : 'update'} appointment`
      );
      throw error;
    }
  };

  // Apply filters
  const handleApplyFilters = (newFilter: AppointmentFilter) => {
    setFilter(newFilter);
    setFilterDrawerVisible(false);
  };

  // Calculate statistics
  const todayCount = appointments.filter((apt) =>
    dayjs(apt.start_time).isSame(dayjs(), 'day')
  ).length;

  const weekCount = appointments.filter((apt) =>
    dayjs(apt.start_time).isSame(dayjs(), 'week')
  ).length;

  const scheduledCount = appointments.filter(
    (apt) => apt.status === 'scheduled'
  ).length;

  return (
    <Layout className={styles.appointmentsPage}>
      <Header className={styles.appointmentsHeader}>
        <div className={styles.appointmentsHeaderContent}>
          <div className={styles.appointmentsHeaderLeft}>
            <h1>Appointments</h1>
            <Space size="large">
              <Statistic title="Today" value={todayCount} />
              <Statistic title="This Week" value={weekCount} />
              <Statistic title="Scheduled" value={scheduledCount} />
            </Space>
          </div>
          <Space>
            <Button
              icon={<FilterOutlined />}
              onClick={() => setFilterDrawerVisible(true)}
            >
              Filters
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              Refresh
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleCreateAppointment()}
              loading={isCreating}
            >
              New Appointment
            </Button>
          </Space>
        </div>
      </Header>

      <Content className={styles.appointmentsContent}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'calendar' | 'list')}
          items={[
            {
              key: 'calendar',
              label: (
                <span>
                  <CalendarOutlined /> Calendar View
                </span>
              ),
              children: (
                <AppointmentCalendar
                  onSelectAppointment={handleSelectAppointment}
                  onCreateAppointment={handleCreateAppointment}
                  selectedRoomId={filter.room_id}
                  view={calendarView}
                  onViewChange={setCalendarView}
                />
              ),
            },
            {
              key: 'list',
              label: (
                <span>
                  <UnorderedListOutlined /> List View
                </span>
              ),
              children: (
                <AppointmentList
                  filter={filter}
                  onEdit={handleEditAppointment}
                  onDelete={handleDeleteAppointment}
                  onDuplicate={handleDuplicateAppointment}
                  onSelect={handleSelectAppointment}
                />
              ),
            },
          ]}
        />
      </Content>

      <AppointmentModal
        visible={modalVisible}
        appointment={selectedAppointment}
        initialDate={initialDate}
        mode={modalMode}
        onCancel={() => setModalVisible(false)}
        onSave={handleSaveAppointment}
      />

      <Drawer
        title="Appointment Details"
        placement="right"
        width={400}
        open={detailDrawerVisible}
        onClose={() => setDetailDrawerVisible(false)}
        extra={
          <Space>
            <Button
              type="primary"
              onClick={() => handleEditAppointment(selectedAppointment!)}
              disabled={!selectedAppointment}
            >
              Edit
            </Button>
            <Button
              danger
              onClick={() => handleDeleteAppointment(selectedAppointment!)}
              disabled={!selectedAppointment}
            >
              Delete
            </Button>
          </Space>
        }
      >
        {appointmentDetail && (
          <div className={styles.appointmentDetail}>
            <Card>
              <h3>{appointmentDetail.appointment.title}</h3>
              <p>{appointmentDetail.appointment.description}</p>
              <div className={styles.detailInfo}>
                <div>
                  <strong>Patient:</strong> {appointmentDetail.patient?.name}
                </div>
                <div>
                  <strong>Date:</strong>{' '}
                  {dayjs(appointmentDetail.appointment.start_time).format(
                    'MMMM DD, YYYY'
                  )}
                </div>
                <div>
                  <strong>Time:</strong>{' '}
                  {dayjs(appointmentDetail.appointment.start_time).format('HH:mm')} -{' '}
                  {dayjs(appointmentDetail.appointment.end_time).format('HH:mm')}
                </div>
                {appointmentDetail.room && (
                  <div>
                    <strong>Room:</strong> {appointmentDetail.room.name}
                  </div>
                )}
                <div>
                  <strong>Status:</strong> {appointmentDetail.appointment.status}
                </div>
              </div>
            </Card>
          </div>
        )}
      </Drawer>

      <Drawer
        title="Filter Appointments"
        placement="left"
        width={300}
        open={filterDrawerVisible}
        onClose={() => setFilterDrawerVisible(false)}
        footer={
          <Space>
            <Button onClick={() => setFilter({})}>Clear</Button>
            <Button type="primary" onClick={() => handleApplyFilters(filter)}>
              Apply
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" className={styles.fullWidth}>
          <div>
            <label>Date Range</label>
            <RangePicker
              className={styles.fullWidth}
              onChange={(dates) => {
                if (dates) {
                  setFilter({
                    ...filter,
                    start_date: dates[0]?.toISOString(),
                    end_date: dates[1]?.toISOString(),
                  });
                }
              }}
            />
          </div>
          <div>
            <label>Room</label>
            <Select
              className={styles.fullWidth}
              placeholder="All rooms"
              allowClear
              onChange={(value) => setFilter({ ...filter, room_id: value })}
            >
              {rooms.map((room) => (
                <Option key={room.id} value={room.id}>
                  {room.name}
                </Option>
              ))}
            </Select>
          </div>
          <div>
            <label>Status</label>
            <Select
              className={styles.fullWidth}
              placeholder="All statuses"
              allowClear
              onChange={(value) => setFilter({ ...filter, status: value })}
            >
              <Option value="scheduled">Scheduled</Option>
              <Option value="in_progress">In Progress</Option>
              <Option value="completed">Completed</Option>
              <Option value="cancelled">Cancelled</Option>
            </Select>
          </div>
        </Space>
      </Drawer>
    </Layout>
  );
};

export default Appointments;