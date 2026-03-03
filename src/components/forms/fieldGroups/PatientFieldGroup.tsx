/**
 * PatientFieldGroup - Reusable patient form fields
 *
 * Extracts common patient fields used across PatientForm and PatientFormWithOwner
 * for consistency and reduced code duplication.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Row,
  Col,
  Switch,
} from 'antd';
import type { FormInstance } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { getDatePickerFormat } from '../../../utils/dateFormatter';
import { SearchableSelect } from '../../SearchableSelect';
import styles from '../Forms.module.css';

export interface Species {
  id: number;
  name: string;
}

export interface Breed {
  id: number;
  name: string;
  speciesId: number;
}

export interface PatientFieldGroupProps {
  form: FormInstance;
  species: Species[];
  breeds: Breed[];
  isLoadingSpecies?: boolean;
  isLoadingBreeds?: boolean;
  disabled?: boolean;
  /** Whether to use IDs (number) or names (string) for species/breed values */
  useIds?: boolean;
  /** Called when species changes - used to clear breed selection */
  onSpeciesChange?: () => void;
  /** Called when user wants to create a new species */
  onCreateSpecies?: (name: string) => void;
  /** Called when user wants to create a new breed */
  onCreateBreed?: (name: string) => void;
  /** Whether to show the active patient switch */
  showActiveSwitch?: boolean;
  /** Whether to show color/markings field */
  showColor?: boolean;
  /** Whether to show microchip ID field */
  showMicrochipId?: boolean;
  /** Custom class name for full-width elements */
  fullWidthClassName?: string;
}

const { Option } = Select;

export const PatientFieldGroup: React.FC<PatientFieldGroupProps> = ({
  form,
  species,
  breeds,
  isLoadingSpecies = false,
  isLoadingBreeds = false,
  disabled = false,
  useIds = true,
  onSpeciesChange,
  onCreateSpecies,
  onCreateBreed,
  showActiveSwitch = false,
  showColor = true,
  showMicrochipId = true,
  fullWidthClassName = styles.fullWidth,
}) => {
  const { t } = useTranslation(['entities', 'forms']);

  // Determine if species is selected based on useIds setting
  const selectedSpeciesValue = Form.useWatch(useIds ? 'speciesId' : 'species', form);
  const hasSpeciesSelected = useIds
    ? !!selectedSpeciesValue
    : !!selectedSpeciesValue;

  // Validate date of birth is not in the future
  const validateAge = (_: any, value: Dayjs | null) => {
    if (!value) {
      return Promise.resolve();
    }
    if (value.isAfter(dayjs())) {
      return Promise.reject(new Error('Date of birth cannot be in the future'));
    }
    return Promise.resolve();
  };

  // Handle species change
  const handleSpeciesChange = () => {
    // Clear breed selection when species changes
    form.setFieldValue(useIds ? 'breedId' : 'breed', useIds ? null : '');
    onSpeciesChange?.();
  };

  // Prepare options based on useIds setting
  const speciesOptions = species.map(s => ({
    value: useIds ? String(s.id) : s.name,
    label: s.name,
  }));

  const breedOptions = breeds.map(b => ({
    value: useIds ? String(b.id) : b.name,
    label: b.name,
  }));

  return (
    <>
      {/* Row 1: Name and Species */}
      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item
            name="name"
            label={t('forms:labels.patientName', 'Patient Name')}
            rules={[
              { required: true, message: t('forms:validation.required', 'This field is required') },
              { max: 100, message: t('forms:validation.maxLength', { max: 100 }) },
            ]}
          >
            <Input
              placeholder={t('forms:placeholders.patientName', 'Enter patient name')}
              disabled={disabled}
            />
          </Form.Item>
        </Col>

        <Col xs={24} sm={12}>
          <Form.Item
            name={useIds ? 'speciesId' : 'species'}
            label={t('entities:species.label', 'Species')}
            rules={[{ required: true, message: t('forms:validation.required', 'Please select species') }]}
            getValueFromEvent={(value) => useIds && value ? Number(value) : value}
          >
            <SearchableSelect
              placeholder={t('forms:placeholders.searchSpecies', 'Search species...')}
              loading={isLoadingSpecies}
              options={speciesOptions}
              className={fullWidthClassName}
              disabled={disabled}
              onChange={handleSpeciesChange}
              onCreateNew={onCreateSpecies}
            />
          </Form.Item>
        </Col>
      </Row>

      {/* Row 2: Breed and Date of Birth */}
      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item
            name={useIds ? 'breedId' : 'breed'}
            label={t('entities:breed.label', 'Breed')}
            getValueFromEvent={(value) => useIds && value ? Number(value) : value}
          >
            <SearchableSelect
              placeholder={t('forms:placeholders.searchBreed', 'Search breed...')}
              loading={isLoadingBreeds}
              options={breedOptions}
              className={fullWidthClassName}
              disabled={disabled || !hasSpeciesSelected}
              onCreateNew={onCreateBreed}
            />
          </Form.Item>
        </Col>

        <Col xs={24} sm={12}>
          <Form.Item
            name="dateOfBirth"
            label={t('entities:patient.dateOfBirth', 'Date of Birth')}
            rules={[{ validator: validateAge }]}
          >
            <DatePicker
              className={fullWidthClassName}
              placeholder={t('forms:placeholders.selectDate', 'Select date of birth')}
              disabledDate={(current) => current && current > dayjs()}
              format={getDatePickerFormat()}
              disabled={disabled}
            />
          </Form.Item>
        </Col>
      </Row>

      {/* Row 3: Gender, Weight, Color */}
      <Row gutter={16}>
        <Col xs={24} sm={8}>
          <Form.Item
            name="gender"
            label={t('entities:patient.gender', 'Gender')}
          >
            <Select
              placeholder={t('forms:placeholders.selectGender', 'Select gender')}
              allowClear
              disabled={disabled}
            >
              <Option value="Male">{t('entities:gender.male', 'Male')}</Option>
              <Option value="Female">{t('entities:gender.female', 'Female')}</Option>
              <Option value="Unknown">{t('entities:gender.unknown', 'Unknown')}</Option>
            </Select>
          </Form.Item>
        </Col>

        <Col xs={24} sm={8}>
          <Form.Item
            name="weight"
            label={t('entities:patient.weight', 'Weight (kg)')}
            rules={[
              { type: 'number', min: 0.01, max: 500, message: t('forms:validation.weightRange', 'Weight must be between 0.01 and 500 kg') },
            ]}
          >
            <InputNumber
              className={fullWidthClassName}
              placeholder={t('forms:placeholders.weight', 'Enter weight')}
              step={0.1}
              precision={2}
              min={0.01}
              max={500}
              disabled={disabled}
            />
          </Form.Item>
        </Col>

        {showColor && (
          <Col xs={24} sm={8}>
            <Form.Item
              name="color"
              label={t('entities:patient.color', 'Color/Markings')}
              rules={[{ max: 50, message: t('forms:validation.maxLength', { max: 50 }) }]}
            >
              <Input
                placeholder={t('forms:placeholders.color', 'Enter color/markings')}
                disabled={disabled}
              />
            </Form.Item>
          </Col>
        )}
      </Row>

      {/* Row 4: Microchip ID and Active Switch */}
      {(showMicrochipId || showActiveSwitch) && (
        <Row gutter={16}>
          {showMicrochipId && (
            <Col xs={24} sm={12}>
              <Form.Item
                name="microchipId"
                label={t('entities:patient.microchipId', 'Microchip ID')}
                rules={[
                  { max: 20, message: t('forms:validation.maxLength', { max: 20 }) },
                  { pattern: /^[A-Za-z0-9]*$/, message: t('forms:validation.alphanumeric', 'Only letters and numbers allowed') },
                ]}
              >
                <Input
                  placeholder={t('forms:placeholders.microchipId', 'Enter microchip ID')}
                  disabled={disabled}
                />
              </Form.Item>
            </Col>
          )}

          {showActiveSwitch && (
            <Col xs={24} sm={12}>
              <Form.Item
                name="isActive"
                label={t('entities:patient.active', 'Active Patient')}
                valuePropName="checked"
                initialValue={true}
              >
                <Switch
                  checkedChildren={t('common:active', 'Active')}
                  unCheckedChildren={t('common:inactive', 'Inactive')}
                  disabled={disabled}
                />
              </Form.Item>
            </Col>
          )}
        </Row>
      )}
    </>
  );
};

export default PatientFieldGroup;
