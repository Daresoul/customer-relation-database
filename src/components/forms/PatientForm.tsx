/**
 * T017: Patient form component with Ant Design
 */

import React, { useEffect, useState } from 'react';
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
  App,
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
import { useSpecies } from '../../hooks/useSpecies';
import { useBreeds } from '../../hooks/useBreeds';
import { SearchableSelect } from '../../components/SearchableSelect';
import { CreateSpeciesModal } from '../../components/CreateSpeciesModal';
import { CreateBreedModal } from '../../components/CreateBreedModal';
import styles from './Forms.module.css';

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
  const { notification } = App.useApp();
  const { t } = useTranslation(['entities', 'forms']);
  const [form] = Form.useForm();

  // Fetch species from database
  const { data: speciesData = [], isLoading: isLoadingSpecies } = useSpecies(true);

  // Watch selected species to filter breeds
  const selectedSpeciesId = Form.useWatch('speciesId', form);
  const selectedSpecies = speciesData.find(s => s.id === selectedSpeciesId);
  const selectedSpeciesName = selectedSpecies?.name;

  // Fetch breeds for selected species
  const { data: breedsData = [], isLoading: isLoadingBreeds } = useBreeds(selectedSpeciesId, true);

  // Modal state for creating new species
  const [showCreateSpeciesModal, setShowCreateSpeciesModal] = useState(false);
  const [newSpeciesName, setNewSpeciesName] = useState('');

  // Modal state for creating new breed
  const [showCreateBreedModal, setShowCreateBreedModal] = useState(false);
  const [newBreedName, setNewBreedName] = useState('');

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
        name: values.name,
        speciesId: values.speciesId,
        breedId: values.breedId || null,
        dateOfBirth: values.dateOfBirth ? values.dateOfBirth.format('YYYY-MM-DD') : null,
        gender: values.gender || null,
        weight: values.weight ? parseFloat(values.weight) : null,
        microchipId: values.microchipId || null,
        medicalNotes: values.medicalNotes || null,
        householdId: values.householdId || null,
      };

      // Debug logging for Windows breed issue
      console.log('[PatientForm] Form values:', values);
      console.log('[PatientForm] Formatted data being submitted:', formattedData);
      console.log('[PatientForm] breedId type:', typeof formattedData.breedId, 'value:', formattedData.breedId);

      await onSubmit(formattedData);
      notification.success({
        message: 'Success',
        description: `Patient ${mode === 'create' ? 'created' : 'updated'} successfully`,
        placement: 'bottomRight',
        duration: 3,
      });
      if (mode === 'create') {
        form.resetFields();
      }
    } catch (error) {
      notification.error({
        message: 'Error',
        description: `Failed to ${mode} patient`,
        placement: 'bottomRight',
        duration: 5,
      });
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
      className={styles.formCard}
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
              name="speciesId"
              label="Species"
              rules={[{ required: true, message: 'Please select species' }]}
            >
              <SearchableSelect
                placeholder="Search species..."
                loading={isLoadingSpecies}
                options={speciesData.map(species => ({
                  value: species.id,
                  label: species.name,
                }))}
                className={styles.fullWidth}
                onChange={() => {
                  // When species changes, clear breed selection
                  form.setFieldValue('breedId', null);
                }}
                onCreateNew={(name) => {
                  setNewSpeciesName(name);
                  setShowCreateSpeciesModal(true);
                }}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="breedId"
              label="Breed"
            >
              <SearchableSelect
                placeholder="Search breed..."
                loading={isLoadingBreeds}
                options={breedsData.map(breed => ({
                  value: breed.id,
                  label: breed.name,
                }))}
                className={styles.fullWidth}
                disabled={!selectedSpeciesName}
                onCreateNew={(name) => {
                  setNewBreedName(name);
                  setShowCreateBreedModal(true);
                }}
              />
            </Form.Item>
          </Col>

          <Col xs={24} sm={12}>
            <Form.Item
              name="dateOfBirth"
              label="Date of Birth"
              rules={[{ validator: validateAge }]}
            >
              <DatePicker
                className={styles.fullWidth}
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
                className={styles.fullWidth}
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
                className={styles.fullWidth}
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

      <CreateSpeciesModal
        open={showCreateSpeciesModal}
        initialName={newSpeciesName}
        onClose={() => {
          setShowCreateSpeciesModal(false);
          setNewSpeciesName('');
        }}
        onSuccess={(speciesName) => {
          form.setFieldsValue({ species: speciesName });
        }}
      />

      <CreateBreedModal
        open={showCreateBreedModal}
        initialName={newBreedName}
        speciesId={selectedSpeciesId}
        onClose={() => {
          setShowCreateBreedModal(false);
          setNewBreedName('');
        }}
        onSuccess={(breedName) => {
          form.setFieldsValue({ breed: breedName });
        }}
      />
    </Card>
  );
};