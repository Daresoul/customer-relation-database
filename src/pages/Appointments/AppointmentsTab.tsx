import React, { useState, useCallback } from 'react';
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
import {
  Appointment,
  AppointmentFilter,
  CalendarView,
} from '../../types/appointments';
import {
  useAppointments,
  useAppointmentDetail,
  useRooms,
} from '../../hooks/useAppointments';

const { RangePicker } = DatePicker;

const AppointmentsTab: React.FC = () => {
  const [activeView, setActiveView] = useState<'calendar' | 'list'>('list');
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
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
          await updateAppointment(selectedAppointment.id, values);
          message.success('Appointment updated successfully');
        } else {
          await createAppointment(values);
          message.success('Appointment created successfully');
        }
        setModalVisible(false);
        setSelectedAppointment(null);
      } catch (error: any) {
        message.error(error.message || 'Failed to save appointment');
      }
    },
    [modalMode, selectedAppointment, updateAppointment, createAppointment]
  );

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
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
                List View
              </span>
            ),
            children: (
              <AppointmentList
                filter={filter}
                onEdit={handleEditAppointment}
                onDelete={handleDeleteAppointment}
                onDuplicate={handleDuplicateAppointment}
                onSelect={handleEditAppointment}
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
        width={400}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <label>Date Range</label>
            <RangePicker
              style={{ width: '100%' }}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setFilter({
                    ...filter,
                    start_date: dates[0].toDate(),
                    end_date: dates[1].toDate(),
                  });
                } else {
                  const { start_date, end_date, ...rest } = filter;
                  setFilter(rest);
                }
              }}
            />
          </div>

          <div>
            <label>Status</label>
            <Select
              style={{ width: '100%' }}
              placeholder="Select status"
              allowClear
              onChange={(value) => {
                if (value) {
                  setFilter({ ...filter, status: value });
                } else {
                  const { status, ...rest } = filter;
                  setFilter(rest);
                }
              }}
            >
              <Select.Option value="scheduled">Scheduled</Select.Option>
              <Select.Option value="in_progress">In Progress</Select.Option>
              <Select.Option value="completed">Completed</Select.Option>
              <Select.Option value="cancelled">Cancelled</Select.Option>
            </Select>
          </div>

          <div>
            <label>Room</label>
            <Select
              style={{ width: '100%' }}
              placeholder="Select room"
              allowClear
              onChange={(value) => {
                if (value) {
                  setFilter({ ...filter, room_id: value });
                } else {
                  const { room_id, ...rest } = filter;
                  setFilter(rest);
                }
              }}
            >
              {rooms?.map((room) => (
                <Select.Option key={room.id} value={room.id}>
                  {room.name}
                </Select.Option>
              ))}
            </Select>
          </div>

          <Button type="primary" onClick={() => setFilterDrawerVisible(false)} block>
            Apply Filters
          </Button>
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
        onCancel={() => {
          setModalVisible(false);
          setSelectedAppointment(null);
        }}
        onSave={handleSaveAppointment}
        initialDate={modalMode === 'create' ? initialDate : undefined}
        rooms={rooms}
      />
    </div>
  );
};

export default AppointmentsTab;