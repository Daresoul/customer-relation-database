import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  Form,
  Input,
  DatePicker,
  Select,
  TimePicker,
  Button,
  Space,
  Alert,
  Row,
  Col,
  Typography,
  Divider,
  App,
} from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  UserOutlined,
  EnvironmentOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import {
  Appointment,
  CreateAppointmentInput,
  UpdateAppointmentInput,
  ConflictCheckInput,
} from '../../types/appointments';
import { useRooms } from '../../hooks/useAppointments';
import appointmentService from '../../services/appointmentService';
import { usePatients } from '../../hooks/usePatients';
import { useTranslation } from 'react-i18next';
import styles from './AppointmentModal.module.css';

const { TextArea } = Input;
const { Text } = Typography;
const { Option } = Select;

interface AppointmentModalProps {
  visible?: boolean; // For backward compatibility
  open?: boolean; // Preferred prop name
  appointment?: Appointment | null;
  initialDate?: Date;
  initialEndDate?: Date;
  onCancel: () => void;
  onSave: (data: CreateAppointmentInput | UpdateAppointmentInput) => Promise<void>;
  mode?: 'create' | 'edit';
  rooms?: any[];
}

// Inner component that only renders when modal is open
const AppointmentModalContent: React.FC<Omit<AppointmentModalProps, 'visible' | 'open'> & { isVisible: boolean }> = ({
  isVisible,
  appointment,
  initialDate,
  initialEndDate,
  onCancel,
  onSave,
  mode = 'create',
  rooms: propsRooms,
}) => {
  const { t } = useTranslation(['appointments', 'common']);
  const { notification, modal } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [conflicts, setConflicts] = useState<Appointment[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  const { rooms: hookRooms } = useRooms({ active_only: true });
  const rooms = propsRooms || hookRooms;
  const { patients } = usePatients();

  // Time slot options (15-minute intervals)
  const timeSlots = useMemo(
    () => appointmentService.generateTimeSlots(7, 20, 15),
    []
  );

  // Initialize form values
  useEffect(() => {
    if (isVisible) {
      if (mode === 'edit' && appointment) {
        form.setFieldsValue({
          patient_id: appointment.patient_id,
          title: appointment.title,
          description: appointment.description,
          date: dayjs(appointment.start_time),
          start_time: dayjs(appointment.start_time),
          end_time: dayjs(appointment.end_time),
          room_id: appointment.room_id,
          status: appointment.status,
        });
      } else if (mode === 'create') {
        const defaultDate = initialDate ? dayjs(initialDate) : dayjs();
        let defaultStartTime = defaultDate
          .hour(9)
          .minute(0)
          .second(0)
          .millisecond(0);
        let defaultEndTime = defaultStartTime.add(30, 'minutes');

        // If dragged from calendar, use the exact times
        if (initialDate && initialEndDate) {
          defaultStartTime = dayjs(initialDate);
          defaultEndTime = dayjs(initialEndDate);
        }

        form.setFieldsValue({
          date: defaultDate,
          start_time: defaultStartTime,
          end_time: defaultEndTime,
        });
      }
    }
  }, [isVisible, appointment, mode, initialDate, initialEndDate, form]);

  // Check for conflicts when room or time changes
  const checkConflicts = async () => {
    const values = form.getFieldsValue(['date', 'start_time', 'end_time', 'room_id']);
    
    if (!values.date || !values.start_time || !values.end_time || !values.room_id) {
      setConflicts([]);
      return;
    }

    setCheckingConflicts(true);
    try {
      const startDateTime = dayjs(values.date)
        .hour(values.start_time.hour())
        .minute(values.start_time.minute());
      const endDateTime = dayjs(values.date)
        .hour(values.end_time.hour())
        .minute(values.end_time.minute());

      const input: ConflictCheckInput = {
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        room_id: values.room_id,
        exclude_appointment_id: mode === 'edit' ? appointment?.id : undefined,
      };

      const response = await appointmentService.checkConflicts(input);
      setConflicts(response.conflicts || []);
    } catch (error) {
      console.error('Failed to check conflicts:', error);
      // Clear conflicts and show warning instead of blocking
      setConflicts([]);
      notification.warning({
        message: t('common:error'),
        description: t('appointments:validation.unableToCheckConflicts'),
        placement: 'bottomRight',
        duration: 4,
      });
    } finally {
      setCheckingConflicts(false);
    }
  };

  // Handle form submission
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      // Combine date and time
      const startDateTime = dayjs(values.date)
        .hour(values.start_time.hour())
        .minute(values.start_time.minute())
        .second(0)
        .millisecond(0);
      const endDateTime = dayjs(values.date)
        .hour(values.end_time.hour())
        .minute(values.end_time.minute())
        .second(0)
        .millisecond(0);

      // Validate time range
      if (endDateTime.isBefore(startDateTime) || endDateTime.isSame(startDateTime)) {
        notification.error({
        message: t('common:error'),
        description: t('appointments:validation.endTimeAfterStart'),
        placement: 'bottomRight',
        duration: 5,
      });
        setLoading(false);
        return;
      }

      // Validate 15-minute intervals
      if (
        startDateTime.minute() % 15 !== 0 ||
        endDateTime.minute() % 15 !== 0
      ) {
        notification.error({
        message: t('common:error'),
        description: t('appointments:validation.fifteenMinuteIntervals'),
        placement: 'bottomRight',
        duration: 5,
      });
        setLoading(false);
        return;
      }

      // Check for conflicts before saving
      if (conflicts.length > 0 && values.room_id) {
        // Find the selected room
        const selectedRoom = rooms?.find(r => r.id === values.room_id);

        // Calculate total appointments at this time (conflicts + current appointment)
        const totalAppointments = mode === 'edit' ? conflicts.length : conflicts.length + 1;

        // Only warn if capacity is exceeded
        if (selectedRoom && totalAppointments > selectedRoom.capacity) {
          const confirmed = await modal.confirm({
            title: t('appointments:conflicts.confirmTitle'),
            content: t('appointments:conflicts.confirmMessage', {
              capacity: selectedRoom.capacity,
              isPlural: totalAppointments === 1 ? 'is' : 'are',
              count: totalAppointments,
              pluralSuffix: totalAppointments === 1 ? '' : 's'
            }),
            okText: t('appointments:conflicts.continueAnyway'),
            cancelText: t('common:cancel'),
          });

          if (!confirmed) {
            setLoading(false);
            return;
          }
        }
      }

      const data: any = {
        patient_id: values.patient_id,
        title: values.title,
        description: values.description,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        room_id: values.room_id,
      };

      if (mode === 'edit') {
        data.status = values.status;
      }

      await onSave(data);
      form.resetFields();
      setConflicts([]);
    } catch (error) {
      console.error('Failed to save appointment:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    form.resetFields();
    setConflicts([]);
    onCancel();
  };

  // Disable dates in the past
  const disabledDate = (current: Dayjs) => {
    return mode === 'create' && current && current < dayjs().startOf('day');
  };

  return (
    <Modal
      title={
        <Space>
          <CalendarOutlined />
          {mode === 'create' ? t('appointments:newAppointment') : t('appointments:editAppointment')}
        </Space>
      }
      open={isVisible}
      destroyOnHidden
      onCancel={handleCancel}
      width={700}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          {t('common:cancel')}
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={handleSubmit}
        >
          {mode === 'create' ? t('common:create') : t('common:update')}
        </Button>,
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={true}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="patient_id"
              label={t('appointments:fields.patient')}
              rules={[{ required: true, message: t('appointments:validation.selectPatient') }]}
            >
              <Select
                placeholder={t('appointments:placeholders.selectPatient')}
                showSearch
                optionFilterProp="children"
                suffixIcon={<UserOutlined />}
              >
                {patients?.map((patient: any) => (
                  <Option key={patient.id} value={patient.id}>
                    {patient.name} - {patient.species}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="room_id"
              label={t('appointments:fields.room')}
            >
              <Select
                placeholder={t('appointments:placeholders.selectRoom')}
                allowClear
                suffixIcon={<EnvironmentOutlined />}
                onChange={checkConflicts}
              >
                {rooms.map((room) => (
                  <Option key={room.id} value={room.id}>
                    {room.name} ({t('appointments:fields.capacity')}: {room.capacity})
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="title"
          label={t('appointments:fields.title')}
          rules={[
            { required: true, message: t('appointments:validation.enterTitle') },
            { max: 200, message: t('appointments:validation.titleMaxLength') },
          ]}
        >
          <Input placeholder={t('appointments:placeholders.title')} />
        </Form.Item>

        <Form.Item
          name="description"
          label={t('appointments:fields.description')}
        >
          <TextArea
            rows={3}
            placeholder={t('appointments:placeholders.description')}
          />
        </Form.Item>

        <Divider>{t('appointments:schedule')}</Divider>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="date"
              label={t('appointments:fields.date')}
              rules={[{ required: true, message: t('appointments:validation.selectDate') }]}
            >
              <DatePicker
                className={styles.fullWidth}
                disabledDate={disabledDate}
                format="MMMM DD, YYYY"
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="start_time"
              label={t('appointments:fields.startTime')}
              rules={[{ required: true, message: t('appointments:validation.selectStartTime') }]}
            >
              <TimePicker
                className={styles.fullWidth}
                format="HH:mm"
                minuteStep={15}
                suffixIcon={<ClockCircleOutlined />}
                onChange={checkConflicts}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="end_time"
              label={t('appointments:fields.endTime')}
              rules={[{ required: true, message: t('appointments:validation.selectEndTime') }]}
            >
              <TimePicker
                className={styles.fullWidth}
                format="HH:mm"
                minuteStep={15}
                suffixIcon={<ClockCircleOutlined />}
                onChange={checkConflicts}
              />
            </Form.Item>
          </Col>
        </Row>

        {mode === 'edit' && (
          <Form.Item
            name="status"
            label={t('appointments:fields.status')}
          >
            <Select>
              <Option value="scheduled">{t('appointments:status.scheduled')}</Option>
              <Option value="in_progress">{t('appointments:status.inProgress')}</Option>
              <Option value="completed">{t('appointments:status.completed')}</Option>
              <Option value="cancelled">{t('appointments:status.cancelled')}</Option>
            </Select>
          </Form.Item>
        )}

        {(() => {
          const roomId = form.getFieldValue('room_id');
          const selectedRoom = rooms?.find(r => r.id === roomId);
          const totalAppointments = mode === 'edit' ? conflicts.length : conflicts.length + 1;
          const capacityExceeded = selectedRoom && totalAppointments > selectedRoom.capacity;

          return conflicts.length > 0 && capacityExceeded && (
            <Alert
              message={t('appointments:conflicts.roomCapacityExceeded')}
              description={
                <div>
                  <Text>{t(`appointments:conflicts.capacityWarning${totalAppointments === 1 ? '' : '_plural'}`, { capacity: selectedRoom.capacity, count: totalAppointments })}</Text>
                  <ul>
                    {conflicts.map((conflict) => (
                      <li key={conflict.id}>
                        {conflict.title} ({dayjs(conflict.start_time).format('HH:mm')} -
                        {dayjs(conflict.end_time).format('HH:mm')})
                      </li>
                    ))}
                  </ul>
                </div>
              }
              type="warning"
              showIcon
              icon={<InfoCircleOutlined />}
            />
          );
        })()}
      </Form>
    </Modal>
  );
};

// Wrapper component that conditionally renders content
const AppointmentModal: React.FC<AppointmentModalProps> = (props) => {
  const isModalVisible = props.open ?? props.visible ?? false;

  // Only render the content when modal is visible
  if (!isModalVisible) {
    return null;
  }

  return <AppointmentModalContent {...props} isVisible={isModalVisible} />;
};

export default AppointmentModal;