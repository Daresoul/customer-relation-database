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
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('appointments');
  const { notification, modal } = App.useApp();
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
      modal.confirm({
        title: t('messages.deleteTitle'),
        content: t('messages.deleteConfirm'),
        okText: t('actions.delete'),
        okType: 'danger',
        onOk: async () => {
          try {
            await deleteAppointment(appointment.id);
            notification.success({
        message: t('messages.deletedSuccess'),
        description: t('messages.deletedSuccess'),
        placement: 'bottomRight',
        duration: 3,
      });
            setDetailDrawerVisible(false);
          } catch (error) {
            notification.error({
        message: 'Error',
        description: t('messages.deleteFailed'),
        placement: 'bottomRight',
        duration: 5,
      });
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
        modal.confirm({
          title: t('messages.duplicateTitle'),
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
          notification.success({
        message: t('messages.duplicatedSuccess'),
        description: t('messages.duplicatedSuccess'),
        placement: 'bottomRight',
        duration: 3,
      });
        } catch (error) {
          notification.error({
        message: 'Error',
        description: t('messages.duplicateFailed'),
        placement: 'bottomRight',
        duration: 5,
      });
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
        notification.success({
        message: t('messages.createdSuccess'),
        description: t('messages.createdSuccess'),
        placement: 'bottomRight',
        duration: 3,
      });
      } else if (selectedAppointment) {
        await updateAppointment({
          id: selectedAppointment.id,
          input: data as UpdateAppointmentInput,
        });
        notification.success({
        message: t('messages.updatedSuccess'),
        description: t('messages.updatedSuccess'),
        placement: 'bottomRight',
        duration: 3,
      });
      }
      setModalVisible(false);
      refetch();
    } catch (error) {
      notification.error({ message: "Error", description:
        t(modalMode === 'create' ? 'messages.createFailed' : 'messages.updateFailed')
      , placement: "bottomRight", duration: 5 });
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
            <h1>{t('title')}</h1>
            <Space size="large">
              <Statistic title={t('stats.today')} value={todayCount} />
              <Statistic title={t('stats.thisWeek')} value={weekCount} />
              <Statistic title={t('status.scheduled')} value={scheduledCount} />
            </Space>
          </div>
          <Space>
            <Button
              icon={<FilterOutlined />}
              onClick={() => setFilterDrawerVisible(true)}
            >
              {t('filters.title')}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              {t('calendar.refresh')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleCreateAppointment()}
              loading={isCreating}
            >
              {t('newAppointment')}
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
                  <CalendarOutlined /> {t('tabs.calendar')}
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
                  <UnorderedListOutlined /> {t('tabs.list')}
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
        title={t('details.title')}
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
              {t('actions.update')}
            </Button>
            <Button
              danger
              onClick={() => handleDeleteAppointment(selectedAppointment!)}
              disabled={!selectedAppointment}
            >
              {t('actions.delete')}
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
                  <strong>{t('details.patient')}:</strong> {appointmentDetail.patient?.name}
                </div>
                <div>
                  <strong>{t('fields.date')}:</strong>{' '}
                  {dayjs(appointmentDetail.appointment.start_time).format(
                    'MMMM DD, YYYY'
                  )}
                </div>
                <div>
                  <strong>{t('details.time')}:</strong>{' '}
                  {dayjs(appointmentDetail.appointment.start_time).format('HH:mm')} -{' '}
                  {dayjs(appointmentDetail.appointment.end_time).format('HH:mm')}
                </div>
                {appointmentDetail.room && (
                  <div>
                    <strong>{t('details.room')}:</strong> {appointmentDetail.room.name}
                  </div>
                )}
                <div>
                  <strong>{t('fields.status')}:</strong> {appointmentDetail.appointment.status}
                </div>
              </div>
            </Card>
          </div>
        )}
      </Drawer>

      <Drawer
        title={t('filters.title')}
        placement="left"
        width={300}
        open={filterDrawerVisible}
        onClose={() => setFilterDrawerVisible(false)}
        footer={
          <Space>
            <Button onClick={() => setFilter({})}>{t('calendar.clear')}</Button>
            <Button type="primary" onClick={() => handleApplyFilters(filter)}>
              {t('calendar.apply')}
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" className={styles.fullWidth}>
          <div>
            <label>{t('calendar.dateRange')}</label>
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
            <label>{t('details.room')}</label>
            <Select
              className={styles.fullWidth}
              placeholder={t('filters.allRooms')}
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
            <label>{t('fields.status')}</label>
            <Select
              className={styles.fullWidth}
              placeholder={t('filters.allStatuses')}
              allowClear
              onChange={(value) => setFilter({ ...filter, status: value })}
            >
              <Option value="scheduled">{t('status.scheduled')}</Option>
              <Option value="in_progress">{t('status.inProgress')}</Option>
              <Option value="completed">{t('status.completed')}</Option>
              <Option value="cancelled">{t('status.cancelled')}</Option>
            </Select>
          </div>
        </Space>
      </Drawer>
    </Layout>
  );
};

export default Appointments;