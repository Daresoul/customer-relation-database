/**
 * T017: Patient form component with Ant Design
 */

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Button,
  Space,
  Row,
  Col,
  Card,
  Switch,
  message,
} from 'antd';
import {
  SaveOutlined,
  CloseOutlined,
  HeartOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { getDatePickerFormat } from '../../utils/dateFormatter';
import { Patient, CreatePatientInput, UpdatePatientInput } from '../../types';
import type { BaseFormProps } from '../../types/ui.types';

interface PatientFormProps extends Omit<BaseFormProps, 'onSubmit'> {
  patient?: Patient;
  onSubmit: (data: CreatePatientInput | UpdatePatientInput) => Promise<void>;
  onCancel: () => void;
  householdId?: number | null;
}

const { TextArea } = Input;

export const PatientForm: React.FC<PatientFormProps> = ({
  patient,
  onSubmit,
  onCancel,
  loading = false,
  mode = 'create',
  householdId,
}) => {
  const { t } = useTranslation(['entities', 'forms']);
  const [form] = Form.useForm();

  useEffect(() => {
    if (patient) {
      form.setFieldsValue({
        ...patient,
        dateOfBirth: patient.dateOfBirth ? dayjs(patient.dateOfBirth) : null,
        householdId: patient.householdId || householdId,
        isActive: patient.isActive ?? true,
      });
    } else if (householdId) {
      form.setFieldsValue({ householdId });
    }
  }, [patient, householdId, form]);

  const handleSubmit = async (values: any) => {
    try {
      const formattedData = {
        ...values,
        dateOfBirth: values.dateOfBirth ? values.dateOfBirth.format('YYYY-MM-DD') : null,
        weight: values.weight ? parseFloat(values.weight) : null,
        householdId: values.householdId || null,
      };

      await onSubmit(formattedData);
      message.success(`Patient ${mode === 'create' ? 'created' : 'updated'} successfully`);
      if (mode === 'create') {
        form.resetFields();
      }
    } catch (error) {
      message.error(`Failed to ${mode} patient`);
    }
  };

  const validateAge = (_: any, value: Dayjs | null) => {
    if (!value) {
      return Promise.resolve();
    }
    if (value.isAfter(dayjs())) {
      return Promise.reject(new Error('Date of birth cannot be in the future'));
    }
    return Promise.resolve();
  };

  return (
    <Card
      title={
        <Space>
          <HeartOutlined />
          {mode === 'create' ? 'Create New Patient' : 'Edit Patient'}
        </Space>
      }
      style={{ maxWidth: '800px' }}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        autoComplete="off"
      >
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="name"
              label="Patient Name"
              rules={[
                { required: true, message: 'Please enter patient name' },
                { max: 100, message: 'Name cannot exceed 100 characters' },
              ]}
            >
              <Input placeholder="Enter patient name" />
            </Form.Item>
          </Col>

          <Col xs={24} sm={12}>
            <Form.Item
              name="species"
              label="Species"
              rules={[{ required: true, message: 'Please select species' }]}
            >
              <Select placeholder="Select species">
                <Select.Option value="Dog">{t('entities:species.dog')}</Select.Option>
                <Select.Option value="Cat">{t('entities:species.cat')}</Select.Option>
                <Select.Option value="Bird">{t('entities:species.bird')}</Select.Option>
                <Select.Option value="Rabbit">{t('entities:species.rabbit')}</Select.Option>
                <Select.Option value="Hamster">{t('entities:species.hamster')}</Select.Option>
                <Select.Option value="Guinea Pig">{t('entities:species.guineaPig')}</Select.Option>
                <Select.Option value="Reptile">{t('entities:species.reptile')}</Select.Option>
                <Select.Option value="Other">{t('entities:species.other')}</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="breed"
              label="Breed"
              rules={[{ max: 50, message: 'Breed cannot exceed 50 characters' }]}
            >
              <Input placeholder="Enter breed" />
            </Form.Item>
          </Col>

          <Col xs={24} sm={12}>
            <Form.Item
              name="dateOfBirth"
              label="Date of Birth"
              rules={[{ validator: validateAge }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                placeholder="Select date of birth"
                disabledDate={(current) => current && current > dayjs()}
                format={getDatePickerFormat()}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} sm={8}>
            <Form.Item
              name="gender"
              label="Gender"
            >
              <Select placeholder="Select gender" allowClear>
                <Select.Option value="Male">{t('entities:gender.male')}</Select.Option>
                <Select.Option value="Female">{t('entities:gender.female')}</Select.Option>
                <Select.Option value="Unknown">{t('entities:gender.unknown')}</Select.Option>
              </Select>
            </Form.Item>
          </Col>

          <Col xs={24} sm={8}>
            <Form.Item
              name="weight"
              label="Weight (kg)"
              rules={[
                { type: 'number', min: 0.01, max: 500, message: 'Weight must be between 0.01 and 500 kg' },
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Enter weight"
                step={0.1}
                precision={2}
                min={0.01}
                max={500}
              />
            </Form.Item>
          </Col>

          <Col xs={24} sm={8}>
            <Form.Item
              name="color"
              label="Color/Markings"
              rules={[{ max: 50, message: 'Color cannot exceed 50 characters' }]}
            >
              <Input placeholder="Enter color/markings" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="microchipId"
              label="Microchip ID"
              rules={[
                { max: 20, message: 'Microchip ID cannot exceed 20 characters' },
                { pattern: /^[A-Za-z0-9]*$/, message: 'Only letters and numbers allowed' },
              ]}
            >
              <Input placeholder="Enter microchip ID" />
            </Form.Item>
          </Col>

          <Col xs={24} sm={12}>
            <Form.Item
              name="householdId"
              label="Household ID"
              hidden={!householdId && mode === 'create'}
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Household ID (optional)"
                disabled={!!householdId}
              />
            </Form.Item>
          </Col>
        </Row>


        <Row gutter={16}>
          <Col xs={24}>
            <Form.Item
              name="isActive"
              label="Active Patient"
              valuePropName="checked"
              initialValue={true}
            >
              <Switch
                checkedChildren="Active"
                unCheckedChildren="Inactive"
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={loading}
              size="large"
            >
              {mode === 'create' ? 'Create Patient' : 'Save Changes'}
            </Button>
            <Button
              type="default"
              onClick={onCancel}
              icon={<CloseOutlined />}
              disabled={loading}
              size="large"
            >
              Cancel
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};