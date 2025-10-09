import React, { useState, useCallback, useMemo } from 'react';
import {
  Tabs,
  Button,
  Space,
  Select,
  DatePicker,
  Input,
  Drawer,
  Modal,
  App,
  Row,
  Col,
  Checkbox,
} from 'antd';
import {
  CalendarOutlined,
  UnorderedListOutlined,
  PlusOutlined,
  FilterOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import AppointmentCalendar from '../../components/AppointmentCalendar/AppointmentCalendar';
import AppointmentList from '../../components/AppointmentList/AppointmentList';
import AppointmentModal from '../../components/AppointmentModal/AppointmentModal';
import TodaysAppointments from '../../components/AppointmentCalendar/TodaysAppointments';
import {
  Appointment,
  AppointmentFilter,
  CalendarView,
} from '../../types/appointments';
import {
  useAppointments,
  useAppointmentDetail,
  useRooms,
  useCalendarAppointments,
} from '../../hooks/useAppointments';
import styles from './Appointments.module.css';

const { RangePicker } = DatePicker;

const AppointmentsTab: React.FC = () => {
  const { t } = useTranslation(['appointments', 'common']);
  const { notification, modal } = App.useApp();
  const [activeView, setActiveView] = useState<'calendar' | 'list'>('list');
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [filterDrawerVisible, setFilterDrawerVisible] = useState(false);
  const [initialDate, setInitialDate] = useState<Date>(new Date());
  const [initialEndDate, setInitialEndDate] = useState<Date | undefined>();
  const [filter, setFilter] = useState<AppointmentFilter>({});

  const {
    appointments: listAppointments,
    createAppointment,
    updateAppointment,
    deleteAppointment,
    duplicateAppointment,
    refetch,
    isCreating,
    isUpdating,
    isDeleting,
    isLoading: listLoading,
    error: listError,
  } = useAppointments(filter);

  // Use different data strategies based on view
  const { startDate, endDate } = useMemo(() => {
    if (activeView === 'calendar') {
      const start = new Date();
      start.setMonth(start.getMonth() - 1); // Look back 1 month
      const end = new Date();
      end.setMonth(end.getMonth() + 2); // Look ahead 2 months
      return { startDate: start, endDate: end };
    } else {
      // For list view, just show today's appointments
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return { startDate: start, endDate: end };
    }
  }, [activeView]);

  const { data: calendarData, isLoading: calendarLoading, error: calendarError } = useCalendarAppointments(
    startDate,
    endDate,
    {
      include_cancelled: filter.include_cancelled,
      status: filter.status,
      room_id: filter.room_id,
    }
  );

  // Use calendar data for both views now, as it's more efficient
  const appointments = calendarData?.appointments || [];
  const isLoading = calendarLoading;
  const error = calendarError;



  const { rooms } = useRooms();

  const { data: appointmentDetail } = useAppointmentDetail(
    selectedAppointment?.id
  );

  // Handle create appointment
  const handleCreateAppointment = useCallback((date?: Date, endDate?: Date) => {
    setInitialDate(date || new Date());
    setInitialEndDate(endDate);
    setModalMode('create');
    setSelectedAppointment(null);
    setModalVisible(true);
  }, []);

  // Handle edit appointment
  const handleEditAppointment = useCallback((appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setModalMode('edit');
    setModalVisible(true);
  }, []);

  // Handle delete appointment
  const handleDeleteAppointment = useCallback(
    async (appointment: Appointment) => {
      modal.confirm({
        title: t('appointments:messages.deleteTitle'),
        content: t('appointments:messages.deleteConfirm'),
        okText: t('appointments:actions.delete'),
        okType: 'danger',
        cancelText: t('common:cancel'),
        onOk: async () => {
          try {
            await deleteAppointment(appointment.id);
            notification.success({
        message: t('appointments:messages.deletedSuccess'),
        description: t('appointments:messages.deletedSuccess'),
        placement: 'bottomRight',
        duration: 3,
      });
          } catch (error: any) {
            notification.error({ message: t('common:error'), description: error.message || t('appointments:messages.deleteFailed'), placement: "bottomRight", duration: 5 });
          }
        },
      });
    },
    [deleteAppointment, t, modal, notification]
  );

  // Handle duplicate appointment
  const handleDuplicateAppointment = useCallback(
    async (appointment: Appointment) => {
      try {
        await duplicateAppointment(appointment.id);
        notification.success({
        message: t('appointments:messages.duplicatedSuccess'),
        description: t('appointments:messages.duplicatedSuccess'),
        placement: 'bottomRight',
        duration: 3,
      });
      } catch (error: any) {
        notification.error({ message: t('common:error'), description: error.message || t('appointments:messages.duplicateFailed'), placement: "bottomRight", duration: 5 });
      }
    },
    [duplicateAppointment, t, notification]
  );

  // Handle save appointment (create or update)
  const handleSaveAppointment = useCallback(
    async (values: any) => {
      try {
        if (modalMode === 'edit' && selectedAppointment) {
          await updateAppointment({ id: selectedAppointment.id, input: values });
          notification.success({
        message: t('appointments:messages.updatedSuccess'),
        description: t('appointments:messages.updatedSuccess'),
        placement: 'bottomRight',
        duration: 3,
      });
        } else {
          await createAppointment(values);
          notification.success({
        message: t('appointments:messages.createdSuccess'),
        description: t('appointments:messages.createdSuccess'),
        placement: 'bottomRight',
        duration: 3,
      });
        }
        setModalVisible(false);
        setSelectedAppointment(null);
      } catch (error: any) {
        console.error('AppointmentsTab: Save error:', error);
        notification.error({ message: t('common:error'), description: error.message || t('appointments:messages.saveFailed'), placement: "bottomRight", duration: 5 });
      }
    },
    [modalMode, selectedAppointment, updateAppointment, createAppointment, t, notification]
  );

  return (
    <div className={styles.fullHeightScroll}>
      <Tabs
        activeKey={activeView}
        onChange={(key) => setActiveView(key as 'calendar' | 'list')}
        tabBarExtraContent={
          <Space>
            <Button
              icon={<FilterOutlined />}
              onClick={() => setFilterDrawerVisible(true)}
            >
              {t('appointments:filters.filter')}
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => refetch()}
              loading={false}
            >
              {t('appointments:calendar.refresh')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleCreateAppointment()}
            >
              {t('appointments:newAppointment')}
            </Button>
          </Space>
        }
        items={[
          {
            key: 'list',
            label: (
              <span>
                <UnorderedListOutlined />
                {t('appointments:tabs.todaysAppointments')}
              </span>
            ),
            children: (
              <TodaysAppointments
                appointments={appointments || []}
                onSelectAppointment={handleEditAppointment}
                onCreateAppointment={handleCreateAppointment}
              />
            ),
          },
          {
            key: 'calendar',
            label: (
              <span>
                <CalendarOutlined />
                {t('appointments:tabs.calendarView')}
              </span>
            ),
            children: (
              <AppointmentCalendar
                appointments={appointments || []}
                view={calendarView}
                onViewChange={setCalendarView}
                onSelectAppointment={handleEditAppointment}
                onCreateAppointment={handleCreateAppointment}
                filter={filter}
              />
            ),
          },
        ]}
      />

      {/* Filter Drawer */}
      <Drawer
        title={t('appointments:filters.title')}
        placement="right"
        onClose={() => setFilterDrawerVisible(false)}
        open={filterDrawerVisible}
        width={500}
      >
        <Space direction="vertical" className={styles.fullWidth} size="large">
          <div>
            <div className={styles.filterLabel}>{t('appointments:filters.status')}</div>
            <Select
              className={styles.fullWidth}
              onChange={(value) => {
                if (value && value !== 'all') {
                  setFilter({
                    ...filter,
                    status: value,
                    // Clear include_cancelled when selecting a specific status
                    include_cancelled: value === 'cancelled' ? true : undefined
                  });
                } else {
                  const { status, include_cancelled, ...rest } = filter;
                  setFilter(rest);
                }
              }}
              value={filter.status || 'all'}
            >
              <Select.Option value="all">{t('appointments:filters.allStatuses')}</Select.Option>
              <Select.Option value="scheduled">{t('appointments:status.scheduled')}</Select.Option>
              <Select.Option value="in_progress">{t('appointments:status.inProgress')}</Select.Option>
              <Select.Option value="completed">{t('appointments:status.completed')}</Select.Option>
              <Select.Option value="cancelled">{t('appointments:status.cancelled')}</Select.Option>
            </Select>
          </div>

          <div>
            <div className={styles.filterLabel}>{t('appointments:filters.room')}</div>
            <Select
              className={styles.fullWidth}
              onChange={(value) => {
                if (value && value !== 'all') {
                  setFilter({ ...filter, room_id: value });
                } else {
                  const { room_id, ...rest } = filter;
                  setFilter(rest);
                }
              }}
              value={filter.room_id || 'all'}
            >
              <Select.Option value="all">{t('appointments:filters.allRooms')}</Select.Option>
              {rooms?.map((room) => (
                <Select.Option key={room.id} value={room.id}>
                  {room.name}
                </Select.Option>
              ))}
            </Select>
          </div>

          {/* Include cancelled - Only show when not filtering by cancelled status specifically */}
          {filter.status !== 'cancelled' && (
            <Checkbox
              checked={filter.include_cancelled || false}
              onChange={(e) => {
                if (e.target.checked) {
                  setFilter({ ...filter, include_cancelled: true });
                } else {
                  const { include_cancelled, ...rest } = filter;
                  setFilter(rest);
                }
              }}
            >
              {t('appointments:filters.includeCancelled')}
            </Checkbox>
          )}

          <Button
            onClick={() => {
              setFilter({});
              setFilterDrawerVisible(false);
            }}
            block
          >
            {t('appointments:filters.clearFilters')}
          </Button>
        </Space>
      </Drawer>

      {/* Appointment Modal */}
      <AppointmentModal
        open={modalVisible}
        appointment={selectedAppointment}
        mode={modalMode}
        onCancel={() => {
          setModalVisible(false);
          setSelectedAppointment(null);
          setInitialEndDate(undefined);
        }}
        onSave={handleSaveAppointment}
        initialDate={modalMode === 'create' ? initialDate : undefined}
        initialEndDate={modalMode === 'create' ? initialEndDate : undefined}
        rooms={rooms}
      />

    </div>
  );
};

export default AppointmentsTab;