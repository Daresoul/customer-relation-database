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
  message,
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
      Modal.confirm({
        title: 'Delete Appointment',
        content: `Are you sure you want to delete the appointment for ${appointment.title}?`,
        okText: 'Delete',
        okType: 'danger',
        onOk: async () => {
          try {
            await deleteAppointment(appointment.id);
            message.success('Appointment deleted successfully');
          } catch (error: any) {
            message.error(error.message || 'Failed to delete appointment');
          }
        },
      });
    },
    [deleteAppointment]
  );

  // Handle duplicate appointment
  const handleDuplicateAppointment = useCallback(
    async (appointment: Appointment) => {
      try {
        await duplicateAppointment(appointment.id);
        message.success('Appointment duplicated successfully');
      } catch (error: any) {
        message.error(error.message || 'Failed to duplicate appointment');
      }
    },
    [duplicateAppointment]
  );

  // Handle save appointment (create or update)
  const handleSaveAppointment = useCallback(
    async (values: any) => {
      try {
        if (modalMode === 'edit' && selectedAppointment) {
          await updateAppointment({ id: selectedAppointment.id, input: values });
          message.success('Appointment updated successfully');
        } else {
          await createAppointment(values);
          message.success('Appointment created successfully');
        }
        setModalVisible(false);
        setSelectedAppointment(null);
      } catch (error: any) {
        console.error('AppointmentsTab: Save error:', error);
        message.error(error.message || 'Failed to save appointment');
      }
    },
    [modalMode, selectedAppointment, updateAppointment, createAppointment]
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
              Filter
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => refetch()}
              loading={false}
            >
              Refresh
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleCreateAppointment()}
            >
              New Appointment
            </Button>
          </Space>
        }
        items={[
          {
            key: 'list',
            label: (
              <span>
                <UnorderedListOutlined />
                Today's Appointments
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
                Calendar View
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
        title="Filter Appointments"
        placement="right"
        onClose={() => setFilterDrawerVisible(false)}
        open={filterDrawerVisible}
        width={500}
      >
        <Space direction="vertical" className={styles.fullWidth} size="large">
          <div>
            <div className={styles.filterLabel}>Status</div>
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
              <Select.Option value="all">All statuses</Select.Option>
              <Select.Option value="scheduled">Scheduled</Select.Option>
              <Select.Option value="in_progress">In Progress</Select.Option>
              <Select.Option value="completed">Completed</Select.Option>
              <Select.Option value="cancelled">Cancelled</Select.Option>
            </Select>
          </div>

          <div>
            <div className={styles.filterLabel}>Room</div>
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
              <Select.Option value="all">All rooms</Select.Option>
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
              Include cancelled appointments
            </Checkbox>
          )}

          <Button
            onClick={() => {
              setFilter({});
              setFilterDrawerVisible(false);
            }}
            block
          >
            Clear Filters
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