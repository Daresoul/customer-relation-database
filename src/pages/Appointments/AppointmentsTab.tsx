import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Tabs, Button, Space, Select, Drawer, App, Checkbox, Segmented, Alert } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  CalendarOutlined,
  UnorderedListOutlined,
  PlusOutlined,
  FilterOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import AppointmentCalendar from '../../components/AppointmentCalendar/AppointmentCalendar';
import AppointmentModal from '../../components/AppointmentModal/AppointmentModal';
import TodaysAppointments from '../../components/AppointmentCalendar/TodaysAppointments';
import WaitingRoomList from '../../components/AppointmentCalendar/WaitingRoomList';
import { AppointmentDrawer } from '../../components/AppointmentDrawer/AppointmentDrawer';
import { LoadError } from '../../components/common/LoadError';
import {
  Appointment,
  AppointmentFilter,
  AppointmentStatus,
  CalendarView,
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from '../../types/appointments';
import { useAppointments, useCalendarAppointments } from '../../hooks/useAppointments';
import { useRooms } from '../../hooks/useRooms';
import { usePatients } from '../../hooks/usePatients';
import { useGoogleNeedsReauth } from '../../hooks/useGoogleCalendarStatus';
import { statusLabelKey } from '../../utils/appointmentStatus';
import styles from './Appointments.module.css';
import { patientFilterOptions } from './patientFilterOptions';

const FILTER_STATUSES: AppointmentStatus[] = ['scheduled', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'];

/** Cancelled and no-show visits are shown, greyed and struck out. */
const DEFAULT_FILTER: AppointmentFilter = { includeCancelled: true };

type Range = { start: Date; end: Date };

const AppointmentsTab: React.FC = () => {
  const { t } = useTranslation(['appointments', 'common']);
  const { message } = App.useApp();
  const navigate = useNavigate();
  const googleNeedsReauth = useGoogleNeedsReauth();
  const [activeView, setActiveView] = useState<'calendar' | 'list'>('list');
  const [todayLayout, setTodayLayout] = useState<'list' | 'grid'>('list');
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
  const [calendarRange, setCalendarRange] = useState<Range | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filterDrawerVisible, setFilterDrawerVisible] = useState(false);
  const [initialDate, setInitialDate] = useState<Date>(new Date());
  const [initialEndDate, setInitialEndDate] = useState<Date | undefined>();
  const [filter, setFilter] = useState<AppointmentFilter>(DEFAULT_FILTER);
  const [today, setToday] = useState(() => new Date().toDateString());

  // The app lives in the tray for days, so "today" must follow the clock.
  useEffect(() => {
    const syncToday = () => setToday(new Date().toDateString());
    const timer = setInterval(syncToday, 60_000);
    window.addEventListener('focus', syncToday);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', syncToday);
    };
  }, []);

  const { createAppointment, updateAppointment } = useAppointments();

  // Today shows today; the calendar shows the range its view reports.
  const { startDate, endDate } = useMemo(() => {
    if (activeView === 'calendar') {
      if (calendarRange) return { startDate: calendarRange.start, endDate: calendarRange.end };
      return {
        startDate: dayjs().startOf('month').startOf('week').toDate(),
        endDate: dayjs().endOf('month').endOf('week').toDate(),
      };
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` re-runs this at midnight
  }, [activeView, calendarRange, today]);

  const calendarQuery = useCalendarAppointments(startDate, endDate, {
    includeCancelled: filter.includeCancelled,
    status: filter.status,
    roomId: filter.roomId,
    patientId: filter.patientId,
  });
  const appointments = calendarQuery.data?.appointments ?? [];

  const { data: rooms = [] } = useRooms();
  const { patients } = usePatients();
  const patientOptions = useMemo(() => patientFilterOptions(patients ?? [], t), [patients, t]);

  const handleRangeChange = useCallback((start: Date, end: Date) => {
    setCalendarRange((prev) =>
      prev && prev.start.getTime() === start.getTime() && prev.end.getTime() === end.getTime() ? prev : { start, end },
    );
  }, []);

  const handleCreateAppointment = useCallback((date?: Date, endDate?: Date) => {
    setInitialDate(date || new Date());
    setInitialEndDate(endDate);
    setModalVisible(true);
  }, []);

  const handleSelectAppointment = useCallback((appointment: Appointment) => {
    setSelectedId(appointment.id);
  }, []);

  const handleStatusChange = useCallback(
    async (appointment: Appointment, status: AppointmentStatus) => {
      try {
        await updateAppointment({ id: appointment.id, input: { status } });
        message.success(
          t('appointments:messages.statusChanged', {
            name: appointment.patientName ?? '',
            status: t(statusLabelKey(status)),
          }),
        );
      } catch {
        // useAppointments already reported the failure
      }
    },
    [updateAppointment, message, t],
  );

  const handleSaveAppointment = useCallback(
    async (values: CreateAppointmentInput | UpdateAppointmentInput) => {
      // A failure is reported by useAppointments; rethrow so the modal keeps the form.
      await createAppointment(values as CreateAppointmentInput);
      message.success(t('appointments:messages.createdSuccess'));
      setModalVisible(false);
    },
    [createAppointment, t, message],
  );

  const loadError = calendarQuery.error ? (
    <LoadError
      title={t('appointments:loadFailed')}
      onRetry={() => calendarQuery.refetch()}
      retrying={calendarQuery.isFetching}
      className={styles.loadError}
    />
  ) : null;

  return (
    <div className={styles.fullHeightScroll}>
      {googleNeedsReauth && (
        <Alert
          className={styles.googleBanner}
          type="warning"
          showIcon
          message={t('appointments:google.reauthBanner')}
          action={
            <Button size="small" onClick={() => navigate('/settings?section=appointments')}>
              {t('appointments:google.reconnect')}
            </Button>
          }
        />
      )}
      <Tabs
        activeKey={activeView}
        onChange={(key) => setActiveView(key as 'calendar' | 'list')}
        tabBarExtraContent={
          <Space>
            <Button icon={<FilterOutlined />} onClick={() => setFilterDrawerVisible(true)}>
              {t('appointments:filters.filter')}
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => calendarQuery.refetch()}
              loading={calendarQuery.isFetching && !calendarQuery.isLoading}
            >
              {t('appointments:calendar.refresh')}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleCreateAppointment()}>
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
              <>
                {loadError}
                <Segmented
                  className={styles.layoutToggle}
                  value={todayLayout}
                  onChange={(value) => setTodayLayout(value as 'list' | 'grid')}
                  options={[
                    { value: 'list', label: t('appointments:views.list') },
                    { value: 'grid', label: t('appointments:views.grid') },
                  ]}
                />
                {todayLayout === 'list' ? (
                  <WaitingRoomList
                    appointments={appointments}
                    onSelect={handleSelectAppointment}
                    onStatusChange={handleStatusChange}
                  />
                ) : (
                  <TodaysAppointments
                    appointments={appointments}
                    onSelectAppointment={handleSelectAppointment}
                    onCreateAppointment={handleCreateAppointment}
                    onStatusChange={handleStatusChange}
                  />
                )}
              </>
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
              <>
                {loadError}
                <AppointmentCalendar
                  appointments={appointments}
                  view={calendarView}
                  onViewChange={setCalendarView}
                  onSelectAppointment={handleSelectAppointment}
                  onCreateAppointment={handleCreateAppointment}
                  onRangeChange={handleRangeChange}
                  onStatusChange={handleStatusChange}
                />
              </>
            ),
          },
        ]}
      />

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
                setFilter({ ...filter, status: value && value !== 'all' ? (value as AppointmentStatus) : undefined });
              }}
              value={filter.status || 'all'}
            >
              <Select.Option value="all">{t('appointments:filters.allStatuses')}</Select.Option>
              {FILTER_STATUSES.map((status) => (
                <Select.Option key={status} value={status}>
                  {t(statusLabelKey(status))}
                </Select.Option>
              ))}
            </Select>
          </div>

          <div>
            <div className={styles.filterLabel}>{t('appointments:filters.room')}</div>
            <Select
              className={styles.fullWidth}
              onChange={(value) => {
                setFilter({ ...filter, roomId: value && value !== 'all' ? Number(value) : undefined });
              }}
              value={filter.roomId || 'all'}
            >
              <Select.Option value="all">{t('appointments:filters.allRooms')}</Select.Option>
              {rooms?.map((room) => (
                <Select.Option key={room.id} value={room.id}>
                  {room.name}
                </Select.Option>
              ))}
            </Select>
          </div>

          <div data-testid="patient-filter">
            <div className={styles.filterLabel}>{t('appointments:filters.patient')}</div>
            <Select
              className={styles.fullWidth}
              showSearch
              allowClear
              optionFilterProp="label"
              placeholder={t('appointments:filters.allPatients')}
              options={patientOptions}
              value={filter.patientId}
              onChange={(value) => setFilter({ ...filter, patientId: value ?? undefined })}
            />
          </div>

          <Checkbox
            checked={filter.includeCancelled || false}
            onChange={(e) => setFilter({ ...filter, includeCancelled: e.target.checked || undefined })}
          >
            {t('appointments:filters.includeCancelled')}
          </Checkbox>

          <Button
            onClick={() => {
              setFilter(DEFAULT_FILTER);
              setFilterDrawerVisible(false);
            }}
            block
          >
            {t('appointments:filters.clearFilters')}
          </Button>
        </Space>
      </Drawer>

      <AppointmentModal
        open={modalVisible}
        appointment={null}
        mode="create"
        onCancel={() => {
          setModalVisible(false);
          setInitialEndDate(undefined);
        }}
        onSave={handleSaveAppointment}
        initialDate={initialDate}
        initialEndDate={initialEndDate}
        rooms={rooms}
      />

      <AppointmentDrawer appointmentId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
};

export default AppointmentsTab;
