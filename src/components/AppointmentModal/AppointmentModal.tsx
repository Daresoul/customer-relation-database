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
  message,
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

const { TextArea } = Input;
const { Text } = Typography;
const { Option } = Select;

interface AppointmentModalProps {
  visible: boolean;
  appointment?: Appointment | null;
  initialDate?: Date;
  initialEndDate?: Date;
  onCancel: () => void;
  onSave: (data: CreateAppointmentInput | UpdateAppointmentInput) => Promise<void>;
  mode: 'create' | 'edit';
}

const AppointmentModal: React.FC<AppointmentModalProps> = ({
  visible,
  appointment,
  initialDate,
  initialEndDate,
  onCancel,
  onSave,
  mode,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [conflicts, setConflicts] = useState<Appointment[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  const { rooms } = useRooms({ active_only: true });
  const { patients } = usePatients();

  // Time slot options (15-minute intervals)
  const timeSlots = useMemo(
    () => appointmentService.generateTimeSlots(7, 20, 15),
    []
  );

  // Determine modal visibility
  const isModalVisible = visible !== undefined ? visible : open;

  // Initialize form values
  useEffect(() => {
    if (isModalVisible) {
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
  }, [isModalVisible, appointment, mode, initialDate, initialEndDate, form]);

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
      if (endDateTime.isSameOrBefore(startDateTime)) {
        message.error('End time must be after start time');
        setLoading(false);
        return;
      }

      // Validate 15-minute intervals
      if (
        startDateTime.minute() % 15 !== 0 ||
        endDateTime.minute() % 15 !== 0
      ) {
        message.error('Times must be on 15-minute intervals');
        setLoading(false);
        return;
      }

      // Check for conflicts before saving
      if (conflicts.length > 0 && values.room_id) {
        const confirmed = await Modal.confirm({
          title: 'Room Conflict Detected',
          content: `There are ${conflicts.length} conflicting appointments. Do you want to continue?`,
          okText: 'Continue Anyway',
          cancelText: 'Cancel',
        });
        
        if (!confirmed) {
          setLoading(false);
          return;
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
          {mode === 'create' ? 'New Appointment' : 'Edit Appointment'}
        </Space>
      }
      open={isModalVisible}
      onCancel={handleCancel}
      width={700}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={handleSubmit}
        >
          {mode === 'create' ? 'Create' : 'Update'}
        </Button>,
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark="optional"
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="patient_id"
              label="Patient"
              rules={[{ required: true, message: 'Please select a patient' }]}
            >
              <Select
                placeholder="Select a patient"
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
              label="Room (Optional)"
            >
              <Select
                placeholder="Select a room"
                allowClear
                suffixIcon={<EnvironmentOutlined />}
                onChange={checkConflicts}
              >
                {rooms.map((room) => (
                  <Option key={room.id} value={room.id}>
                    {room.name} (Capacity: {room.capacity})
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="title"
          label="Title"
          rules={[
            { required: true, message: 'Please enter appointment title' },
            { max: 200, message: 'Title must be less than 200 characters' },
          ]}
        >
          <Input placeholder="e.g., Annual Checkup, Vaccination" />
        </Form.Item>

        <Form.Item
          name="description"
          label="Description"
        >
          <TextArea
            rows={3}
            placeholder="Additional notes or instructions"
          />
        </Form.Item>

        <Divider>Schedule</Divider>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="date"
              label="Date"
              rules={[{ required: true, message: 'Please select date' }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                disabledDate={disabledDate}
                format="MMMM DD, YYYY"
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="start_time"
              label="Start Time"
              rules={[{ required: true, message: 'Please select start time' }]}
            >
              <TimePicker
                style={{ width: '100%' }}
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
              label="End Time"
              rules={[{ required: true, message: 'Please select end time' }]}
            >
              <TimePicker
                style={{ width: '100%' }}
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
            label="Status"
          >
            <Select>
              <Option value="scheduled">Scheduled</Option>
              <Option value="in_progress">In Progress</Option>
              <Option value="completed">Completed</Option>
              <Option value="cancelled">Cancelled</Option>
            </Select>
          </Form.Item>
        )}

        {conflicts.length > 0 && (
          <Alert
            message="Room Conflict Detected"
            description={
              <div>
                <Text>The selected room has conflicting appointments:</Text>
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
        )}
      </Form>
    </Modal>
  );
};

export default AppointmentModal;