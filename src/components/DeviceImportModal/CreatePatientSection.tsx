/**
 * Inline patient creation section for Device Import Modal
 * Allows creating a new patient, optionally pre-filled with device file data
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Form, Input, Select, DatePicker, Button, Space, Row, Col, Segmented, Alert, Collapse, Tag, App, Divider, InputNumber } from 'antd';
import { PlusOutlined, UserAddOutlined, CloseOutlined, WarningOutlined, HomeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useSpecies } from '../../hooks/useSpecies';
import { useBreeds } from '../../hooks/useBreeds';
import { HouseholdService } from '../../services/householdService';
import { theme } from 'antd';
import { PatientService } from '../../services/patientService';
import { CreateHouseholdModal } from '../forms/CreateHouseholdModal';
import type { CreatedHousehold } from '../forms/CreateHouseholdInline';
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
  prefillMicrochipId?: string;
}

type FillMode = 'blank' | 'prefill';

export const CreatePatientSection: React.FC<CreatePatientSectionProps> = ({
  extractedData,
  conflicts,
  onPatientCreated,
  onCancel,
  isExpanded,
  onToggleExpand,
  prefillMicrochipId,
}) => {
  const { t } = useTranslation(['patients', 'forms', 'common']);
  const { token } = theme.useToken();
  const { notification } = App.useApp();
  const [form] = Form.useForm();
  const [fillMode, setFillMode] = useState<FillMode>('prefill');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch species
  const { data: speciesData = [], isLoading: isLoadingSpecies } = useSpecies(true);

  // Watch selected species for breed filtering
  const selectedSpeciesId = Form.useWatch('speciesId', form);

  // If a microchip is on file, the chip alone identifies the patient — so name
  // and species become optional. Without a chip, those fields are required.
  const microchipIdValue = Form.useWatch('microchipId', form);
  const namingRequired = !microchipIdValue || String(microchipIdValue).trim().length === 0;

  // Fetch breeds for selected species
  const { data: breedsData = [], isLoading: isLoadingBreeds } = useBreeds(selectedSpeciesId, true);

  // Household search state
  const [householdOptions, setHouseholdOptions] = useState<Array<{ value: number; label: string }>>([]);
  const [householdLoading, setHouseholdLoading] = useState(false);
  const [createHouseholdOpen, setCreateHouseholdOpen] = useState(false);

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

  // Sync scanned microchip ID into the form when the parent passes a new one
  useEffect(() => {
    if (prefillMicrochipId) {
      form.setFieldValue('microchipId', prefillMicrochipId);
    }
  }, [prefillMicrochipId]);

  // Handle form submission
  const handleSubmit = async (values: any) => {
    setIsSubmitting(true);

    try {
      // Note: household creation happens upfront via <CreateHouseholdModal />
      // which sets `householdId` on the form. By the time we get here it
      // already points at a real household row (or is undefined if the
      // user skipped that step).
      const input: CreatePatientInput = {
        name: values.name,
        speciesId: values.speciesId,
        breedId: values.breedId || undefined,
        gender: values.gender || undefined,
        dateOfBirth: values.dateOfBirth
          ? (values.dateOfBirth as Dayjs).format('YYYY-MM-DD')
          : undefined,
        weight: values.weight || undefined,
        color: values.color || undefined,
        microchipId: values.microchipId || undefined,
        notes: values.notes || undefined,
        householdId: values.householdId,
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
        style={{ marginLeft: 8, marginBottom: 12 }}
        data-testid="create-patient-section-expand-btn"
      >
        {t('patients:addPatient', 'Add Patient')}
      </Button>
    );
  }

  return (
      <div
        style={{
          marginTop: 16,
          padding: 16,
          border: `1px dashed ${token.colorBorder}`,
          borderRadius: 8,
          backgroundColor: token.colorFillTertiary,
        }}
      >
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <UserAddOutlined style={{ fontSize: 18, color: '#1890ff' }} />
            <strong>{t('medical:deviceImport.patientInformation', 'Patient Information')}</strong>
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
          <Segmented
            size="middle"
            value={fillMode}
            onChange={(v) => setFillMode(v as FillMode)}
            options={[
              { label: t('medical:deviceImport.prefillToggle', 'Pre‑fill from device'), value: 'prefill' },
              { label: t('medical:deviceImport.startBlankToggle', 'Start blank'), value: 'blank' },
            ]}
            style={{ background: token.colorFillQuaternary }}
          />

          {fillMode === 'prefill' && (
            <>
              <Alert
                type="info"
                showIcon
                style={{ marginTop: 8 }}
                message={
                  <span>
                    {t('medical:deviceImport.detectedFromFiles', 'Detected from files')}: {' '}
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

      <Form form={form} layout="vertical" size="small" component={false}>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item
              name="name"
              label={t('patients:detail.patientInfo.labels.name', 'Name')}
              rules={[{ required: namingRequired, message: t('forms:validation.required') }]}
            >
              <Input placeholder={t('forms:placeholders.enterName', 'Enter name')} />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              name="speciesId"
              label={t('patients:detail.patientInfo.labels.species', 'Species')}
              rules={[{ required: namingRequired, message: t('forms:validation.required') }]}
            >
              <Select
                placeholder={t('forms:placeholders.selectField', { field: t('patients:detail.patientInfo.labels.species', 'Species') })}
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
        {/* Breed / Gender */}
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item
              name="breedId"
              label={t('patients:detail.patientInfo.labels.breed', 'Breed')}
            >
              <Select
                placeholder={t('forms:placeholders.selectField', { field: t('patients:detail.patientInfo.labels.breed', 'Breed') })}
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
              label={t('patients:detail.patientInfo.labels.gender', 'Gender')}
            >
              <Select placeholder={t('forms:placeholders.selectField', { field: t('patients:detail.patientInfo.labels.gender', 'Gender') })} allowClear>
                <Select.Option value="Male">{t('entities:gender.male', 'Male')}</Select.Option>
                <Select.Option value="Female">{t('entities:gender.female', 'Female')}</Select.Option>
                <Select.Option value="Unknown">{t('entities:gender.unknown', 'Unknown')}</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        {/* Date of Birth / Weight */}
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item
              name="dateOfBirth"
              label={t('patients:detail.patientInfo.labels.dateOfBirth', 'Date of Birth')}
            >
              <DatePicker
                style={{ width: '100%' }}
                placeholder={t('forms:placeholders.selectField', { field: t('patients:detail.patientInfo.labels.dateOfBirth', 'Date of Birth') })}
                disabledDate={(current) => current && current > dayjs().endOf('day')}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="weight" label={t('patients:detail.patientInfo.labels.weight', 'Weight (kg)')}>
              <InputNumber min={0.01} max={500} precision={2} style={{ width: '100%' }} placeholder={t('forms:placeholders.example', { example: '4.50' })} />
            </Form.Item>
          </Col>
        </Row>

        {/* Color / Microchip */}
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="color" label={t('patients:detail.patientInfo.labels.color', 'Color')}>
              <Input placeholder={t('forms:placeholders.enterName', 'Enter name')} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="microchipId" label={t('patients:detail.patientInfo.labels.microchipId', 'Microchip ID')}>
              <Input placeholder={t('forms:placeholders.example', { example: '985112003...' })} data-testid="create-patient-section-microchip-input" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={24}>
            <Form.Item name="notes" label={t('patients:detail.patientInfo.labels.notes', 'Notes')}>
              <Input.TextArea rows={3} placeholder={t('forms:placeholders.typeHere', 'Type here...')} />
            </Form.Item>
          </Col>
        </Row>

        {/* Household section visually distinct */}
        <div
          style={{
            marginTop: 16,
            padding: 16,
            border: `1px dashed ${token.colorBorder}`,
            borderRadius: 8,
            backgroundColor: token.colorFillQuaternary,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <HomeOutlined style={{ fontSize: 18, color: token.colorPrimary }} />
            <strong>{t('patients:detail.householdInfo.title', 'Household')}</strong>
          </div>

          <Row gutter={12}>
            <Col span={24}>
              <Form.Item name="householdId" label={t('patients:detail.householdInfo.assignHousehold', 'Assign Household')}>
                <Select
                  showSearch
                  allowClear
                  placeholder={t('patients:detail.householdInfo.selectHousehold', 'Select Household (Optional)')}
                  loading={householdLoading}
                  filterOption={false}
                  onSearch={async (q) => {
                    if (!q || q.trim().length < 2) return;
                    setHouseholdLoading(true);
                    try {
                      const results = await HouseholdService.quickSearchHouseholds(q, 20);
                      setHouseholdOptions(results.map(r => ({ value: r.id, label: r.name })));
                    } finally {
                      setHouseholdLoading(false);
                    }
                  }}
                  options={householdOptions}
                />
              </Form.Item>
              <Button type="dashed" onClick={() => setCreateHouseholdOpen(true)}>
                {t('patients:detail.householdInfo.createHousehold', 'Create New Household')}
              </Button>
            </Col>
          </Row>
        </div>

        <CreateHouseholdModal
          open={createHouseholdOpen}
          onCancel={() => setCreateHouseholdOpen(false)}
          onCreated={async (newHousehold: CreatedHousehold) => {
            const label =
              (typeof newHousehold.householdName === 'string' && newHousehold.householdName) ||
              t('patients:detail.householdInfo.createNewHousehold', 'New Household');
            setHouseholdOptions((prev) => {
              if (prev.some((o) => o.value === newHousehold.id)) return prev;
              return [{ value: newHousehold.id, label }, ...prev];
            });
            form.setFieldValue('householdId', newHousehold.id);
            setCreateHouseholdOpen(false);
            notification.success({
              message: t('patients:detail.householdInfo.createSuccess', 'Household created'),
              description: label,
              placement: 'bottomRight',
              duration: 3,
            });
          }}
        />


        <div style={{ marginTop: 8, marginBottom: 16, textAlign: 'right' }}>
          <Space>
            <Button onClick={handleCancel}>
              {t('common:buttons.cancel', 'Cancel')}
            </Button>
            <Button
              type="primary"
              loading={isSubmitting}
              icon={<UserAddOutlined />}
              onClick={async () => {
                try {
                  const values = await form.validateFields();
                  await handleSubmit(values);
                } catch (_e) {
                  // validation errors handled by antd
                }
              }}
              data-testid="create-patient-section-submit-btn"
            >
              {t('common:buttons.create', 'Create')}
            </Button>
          </Space>
        </div>
      </Form>
    </div>
  );
};

export default CreatePatientSection;
