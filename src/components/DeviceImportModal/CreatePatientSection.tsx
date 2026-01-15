/**
 * Inline patient creation section for Device Import Modal
 * Allows creating a new patient, optionally pre-filled with device file data
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Form,
  Input,
  Select,
  DatePicker,
  Button,
  Space,
  Row,
  Col,
  Radio,
  Alert,
  Collapse,
  Tag,
  App,
} from 'antd';
import {
  PlusOutlined,
  UserAddOutlined,
  CloseOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useSpecies } from '../../hooks/useSpecies';
import { useBreeds } from '../../hooks/useBreeds';
import { PatientService } from '../../services/patientService';
import type { ExtractedPatientData, PatientDataConflict } from '../../types/deviceImport';
import type { Patient, CreatePatientInput } from '../../types';
import { hasExtractedData } from '../../utils/deviceDataExtraction';

interface CreatePatientSectionProps {
  extractedData: ExtractedPatientData;
  conflicts: PatientDataConflict[];
  onPatientCreated: (patient: Patient) => void;
  onCancel: () => void;
  isExpanded: boolean;
  onToggleExpand: (expanded: boolean) => void;
}

type FillMode = 'blank' | 'prefill';

export const CreatePatientSection: React.FC<CreatePatientSectionProps> = ({
  extractedData,
  conflicts,
  onPatientCreated,
  onCancel,
  isExpanded,
  onToggleExpand,
}) => {
  const { t } = useTranslation(['entities', 'forms']);
  const { notification } = App.useApp();
  const [form] = Form.useForm();
  const [fillMode, setFillMode] = useState<FillMode>('prefill');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch species
  const { data: speciesData = [], isLoading: isLoadingSpecies } = useSpecies(true);

  // Watch selected species for breed filtering
  const selectedSpeciesId = Form.useWatch('speciesId', form);

  // Fetch breeds for selected species
  const { data: breedsData = [], isLoading: isLoadingBreeds } = useBreeds(selectedSpeciesId, true);

  // Check if we have extracted data to show prefill option
  const hasDeviceData = hasExtractedData(extractedData);

  // Find species ID by name
  const findSpeciesIdByName = (name?: string): number | undefined => {
    if (!name) return undefined;
    const normalizedName = name.toLowerCase();
    const species = speciesData.find(
      s => s.name.toLowerCase() === normalizedName
    );
    return species?.id;
  };

  // Apply prefill data to form
  useEffect(() => {
    if (fillMode === 'prefill' && hasDeviceData && !isLoadingSpecies) {
      const speciesId = findSpeciesIdByName(extractedData.species);

      form.setFieldsValue({
        name: extractedData.name || '',
        speciesId: speciesId,
        gender: extractedData.gender,
        dateOfBirth: extractedData.dateOfBirth ? dayjs(extractedData.dateOfBirth) : undefined,
      });
    } else if (fillMode === 'blank') {
      form.resetFields();
    }
  }, [fillMode, hasDeviceData, isLoadingSpecies, extractedData, speciesData]);

  // Handle form submission
  const handleSubmit = async (values: any) => {
    setIsSubmitting(true);

    try {
      const input: CreatePatientInput = {
        name: values.name,
        speciesId: values.speciesId,
        breedId: values.breedId || undefined,
        gender: values.gender || undefined,
        dateOfBirth: values.dateOfBirth
          ? (values.dateOfBirth as Dayjs).format('YYYY-MM-DD')
          : undefined,
      };

      const newPatient = await PatientService.createPatient(input);

      notification.success({
        message: t('forms:success.created', { entity: t('entities:patient.singular') }),
        description: `${newPatient.name} created successfully`,
        placement: 'bottomRight',
        duration: 3,
      });

      // Notify parent
      onPatientCreated(newPatient);

      // Reset form and collapse
      form.resetFields();
      onToggleExpand(false);
    } catch (error: any) {
      console.error('Failed to create patient:', error);
      notification.error({
        message: t('forms:error.create', { entity: t('entities:patient.singular') }),
        description: error?.message || 'Unknown error',
        placement: 'bottomRight',
        duration: 5,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    form.resetFields();
    onToggleExpand(false);
    onCancel();
  };

  if (!isExpanded) {
    return (
      <Button
        type="dashed"
        icon={<PlusOutlined />}
        onClick={() => onToggleExpand(true)}
        style={{ marginLeft: 8 }}
      >
        {t('forms:actions.createNew', { entity: t('entities:patient.singular') })}
      </Button>
    );
  }

  return (
    <div style={{
      marginTop: 16,
      padding: 16,
      border: '1px dashed #d9d9d9',
      borderRadius: 8,
      backgroundColor: '#fafafa',
    }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <UserAddOutlined style={{ fontSize: 18, color: '#1890ff' }} />
          <strong>{t('forms:actions.createNew', { entity: t('entities:patient.singular') })}</strong>
        </Space>
        <Button
          type="text"
          icon={<CloseOutlined />}
          onClick={handleCancel}
          size="small"
        />
      </div>

      {/* Fill mode selection - only show if we have device data */}
      {hasDeviceData && (
        <div style={{ marginBottom: 16 }}>
          <Radio.Group
            value={fillMode}
            onChange={(e) => setFillMode(e.target.value)}
            size="small"
          >
            <Radio.Button value="prefill">
              Pre-fill from device
            </Radio.Button>
            <Radio.Button value="blank">
              Start blank
            </Radio.Button>
          </Radio.Group>

          {fillMode === 'prefill' && (
            <>
              <Alert
                type="info"
                showIcon
                style={{ marginTop: 8 }}
                message={
                  <span>
                    Detected from files:{' '}
                    {extractedData.name && <Tag color="blue">{extractedData.name}</Tag>}
                    {extractedData.species && <Tag color="green">{extractedData.species}</Tag>}
                    {extractedData.gender && <Tag>{extractedData.gender}</Tag>}
                  </span>
                }
              />
              {conflicts.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  icon={<WarningOutlined />}
                  style={{ marginTop: 8 }}
                  message="Conflicting data detected across files"
                  description={
                    <div style={{ marginTop: 4 }}>
                      {conflicts.map((conflict, idx) => (
                        <div key={idx} style={{ marginBottom: 4 }}>
                          <strong style={{ textTransform: 'capitalize' }}>{conflict.field}:</strong>{' '}
                          {conflict.values.map((v, i) => (
                            <span key={i}>
                              <Tag color="orange">{v.value}</Tag>
                              <span style={{ fontSize: '0.85em', color: '#888' }}>
                                ({v.source})
                              </span>
                              {i < conflict.values.length - 1 && ' vs '}
                            </span>
                          ))}
                        </div>
                      ))}
                      <div style={{ marginTop: 8, fontSize: '0.85em', color: '#666' }}>
                        Using first detected value. You can modify below if needed.
                      </div>
                    </div>
                  }
                />
              )}
            </>
          )}
        </div>
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        size="small"
      >
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item
              name="name"
              label={t('entities:patient.fields.name')}
              rules={[{ required: true, message: t('forms:validation.required') }]}
            >
              <Input placeholder={t('entities:patient.fields.name')} />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              name="speciesId"
              label={t('entities:patient.fields.species')}
              rules={[{ required: true, message: t('forms:validation.required') }]}
            >
              <Select
                placeholder={t('entities:patient.fields.species')}
                loading={isLoadingSpecies}
                showSearch
                optionFilterProp="children"
              >
                {speciesData.map((species) => (
                  <Select.Option key={species.id} value={species.id}>
                    {species.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col span={8}>
            <Form.Item
              name="breedId"
              label={t('entities:patient.fields.breed')}
            >
              <Select
                placeholder={t('entities:patient.fields.breed')}
                loading={isLoadingBreeds}
                disabled={!selectedSpeciesId}
                allowClear
                showSearch
                optionFilterProp="children"
              >
                {breedsData.map((breed) => (
                  <Select.Option key={breed.id} value={breed.id}>
                    {breed.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>

          <Col span={8}>
            <Form.Item
              name="gender"
              label={t('entities:patient.fields.gender')}
            >
              <Select placeholder={t('entities:patient.fields.gender')} allowClear>
                <Select.Option value="Male">{t('entities:patient.genders.male')}</Select.Option>
                <Select.Option value="Female">{t('entities:patient.genders.female')}</Select.Option>
                <Select.Option value="Unknown">{t('entities:patient.genders.unknown')}</Select.Option>
              </Select>
            </Form.Item>
          </Col>

          <Col span={8}>
            <Form.Item
              name="dateOfBirth"
              label={t('entities:patient.fields.dateOfBirth')}
            >
              <DatePicker
                style={{ width: '100%' }}
                disabledDate={(current) => current && current > dayjs().endOf('day')}
              />
            </Form.Item>
          </Col>
        </Row>

        <div style={{ marginTop: 8, textAlign: 'right' }}>
          <Space>
            <Button onClick={handleCancel}>
              {t('forms:actions.cancel')}
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={isSubmitting}
              icon={<UserAddOutlined />}
            >
              {t('forms:actions.create', { entity: t('entities:patient.singular') })}
            </Button>
          </Space>
        </div>
      </Form>
    </div>
  );
};

export default CreatePatientSection;
