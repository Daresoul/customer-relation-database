import React, { useState, useEffect } from 'react';
import { Descriptions, Typography, Spin, App, Select, DatePicker, InputNumber } from 'antd';
import { useTranslation } from 'react-i18next';
import { PatientDetail, SPECIES_OPTIONS, GENDER_OPTIONS, PATIENT_FIELD_RULES } from '../../types/patient';
import { useUpdatePatient } from '../../hooks/usePatient';
import { useInlineEdit } from '../../hooks/useAutoSave';
import dayjs from 'dayjs';
import { formatDateTime, getDatePickerFormat } from '../../utils/dateFormatter';
import { useThemeColors } from '../../utils/themeStyles';
import styles from './PatientDetail.module.css';

const { Text } = Typography;

interface PatientInfoProps {
  patient: PatientDetail;
}

export const PatientInfo: React.FC<PatientInfoProps> = ({ patient }) => {
  const { message } = App.useApp();
  const { t } = useTranslation(['patients', 'entities']);
  const updatePatient = useUpdatePatient();
  const themeColors = useThemeColors();

  // Create translated options for dropdowns
  const translatedSpeciesOptions = SPECIES_OPTIONS.map(option => ({
    value: option.value,
    label: t(`entities:species.${option.value}`)
  }));

  const translatedGenderOptions = GENDER_OPTIONS.map(option => ({
    value: option.value,
    label: t(`entities:gender.${option.value.toLowerCase()}`)
  }));

  // Local state for optimistic updates
  const [localValues, setLocalValues] = useState({
    name: patient.name,
    breed: patient.breed,
    color: patient.color,
    microchipId: patient.microchipId,
    dateOfBirth: patient.dateOfBirth,
  });

  // Update local values when patient data changes
  // Only update if the value is not null/undefined (to preserve optimistic updates)
  useEffect(() => {
    setLocalValues(prev => ({
      name: patient.name || prev.name,
      breed: patient.breed || prev.breed,
      color: patient.color || prev.color,
      microchipId: patient.microchipId || prev.microchipId,
      dateOfBirth: patient.dateOfBirth || prev.dateOfBirth, // Keep existing date if backend returns null
    }));
  }, [patient.name, patient.breed, patient.color, patient.microchipId, patient.dateOfBirth]);

  const handleFieldUpdate = async (field: string, value: any) => {

    // Optimistic update for text fields
    if (field in localValues) {
      setLocalValues(prev => ({ ...prev, [field]: value }));
    }

    try {
      await updatePatient.mutateAsync({
        patientId: patient.id,
        updates: { [field]: value || null }
      });
    } catch (error) {
      // Revert on error
      if (field in localValues) {
        setLocalValues(prev => ({ ...prev, [field]: patient[field as keyof typeof patient] }));
      }
      console.error('Update failed:', error);
      message.error(t('detail.patientInfo.failedToSave'));
    }
  };

  // Inline edit hooks for text fields
  const nameEdit = useInlineEdit({
    value: localValues.name || '',
    onSave: (value) => handleFieldUpdate('name', value),
    validate: (value) => {
      if (!value || value.trim().length === 0) return t('detail.patientInfo.validation.nameRequired');
      if (value.length > PATIENT_FIELD_RULES.name.max) return t('detail.patientInfo.validation.nameTooLong', { max: PATIENT_FIELD_RULES.name.max });
      return true;
    }
  });

  const breedEdit = useInlineEdit({
    value: localValues.breed || '',
    onSave: (value) => handleFieldUpdate('breed', value),
    validate: (value) => {
      if (value && value.length > PATIENT_FIELD_RULES.breed.max) return t('detail.patientInfo.validation.breedTooLong', { max: PATIENT_FIELD_RULES.breed.max });
      return true;
    }
  });

  const colorEdit = useInlineEdit({
    value: localValues.color || '',
    onSave: (value) => handleFieldUpdate('color', value),
    validate: (value) => value.length <= 50 || t('detail.patientInfo.validation.colorTooLong')
  });

  const microchipEdit = useInlineEdit({
    value: localValues.microchipId || '',
    onSave: (value) => handleFieldUpdate('microchipId', value),
    validate: (value) => {
      if (!value) return true;
      if (!PATIENT_FIELD_RULES.microchipId.pattern.test(value)) return t('detail.patientInfo.validation.invalidMicrochip');
      if (value.length > PATIENT_FIELD_RULES.microchipId.max) return t('detail.patientInfo.validation.invalidMicrochip');
      return true;
    }
  });

  const isSaving = updatePatient.isPending;

  return (
    <div className={styles.infoCard}>
      <Typography.Title level={4} className={styles.cardTitle}>
        {t('detail.patientInfo.title')}
      </Typography.Title>

      <Descriptions
        bordered
        column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 3, xxl: 4 }}
        styles={{
          label: {
            background: themeColors.hover,
            color: themeColors.textSecondary,
            width: '120px',
            minWidth: '100px',
            maxWidth: '150px'
          },
          content: {
            background: themeColors.cardBg,
            color: themeColors.text,
            minWidth: '200px'
          }
        }}
      >
        <Descriptions.Item label={t('detail.patientInfo.labels.name')} span={1}>
          <Text
            editable={{
              onChange: (value) => {
                setLocalValues(prev => ({ ...prev, name: value })); // Immediate update
                const result = nameEdit.onChange(value);
                if (!result.success && result.error) {
                  message.error(result.error);
                  setLocalValues(prev => ({ ...prev, name: patient.name || '' })); // Revert on validation error
                }
              },
              triggerType: ['text'],
            }}
            className={styles.textPrimary}
          >
            {localValues.name || '-'}
          </Text>
        </Descriptions.Item>

        <Descriptions.Item label={t('detail.patientInfo.labels.species')} span={1}>
          <Select
            value={patient.species}
            onChange={(value) => handleFieldUpdate('species', value)}
            options={translatedSpeciesOptions}
            className={styles.fullWidth}
            disabled={isSaving}
          />
        </Descriptions.Item>

        <Descriptions.Item label={t('detail.patientInfo.labels.breed')} span={1}>
          <Text
            editable={{
              onChange: (value) => {
                setLocalValues(prev => ({ ...prev, breed: value })); // Immediate update
                const result = breedEdit.onChange(value);
                if (!result.success && result.error) {
                  message.error(result.error);
                  setLocalValues(prev => ({ ...prev, breed: patient.breed || '' })); // Revert on validation error
                }
              },
              triggerType: ['text'],
            }}
            className={styles.textPrimary}
          >
            {localValues.breed || '-'}
          </Text>
        </Descriptions.Item>

        <Descriptions.Item label={t('detail.patientInfo.labels.gender')} span={1}>
          <Select
            value={patient.gender || 'Unknown'}
            onChange={(value) => handleFieldUpdate('gender', value)}
            options={translatedGenderOptions}
            className={styles.fullWidth}
            disabled={isSaving}
          />
        </Descriptions.Item>

        <Descriptions.Item label={t('detail.patientInfo.labels.dateOfBirth')} span={1}>
          <DatePicker
            value={localValues.dateOfBirth ? dayjs(localValues.dateOfBirth) : undefined}
            onChange={(date) => {
              const dateString = date ? date.format('YYYY-MM-DD') : undefined;
              setLocalValues(prev => ({ ...prev, dateOfBirth: dateString }));
              handleFieldUpdate('dateOfBirth', dateString);
            }}
            format={getDatePickerFormat()}
            className={styles.fullWidth}
            disabled={isSaving}
            disabledDate={(current) => current && current > dayjs().endOf('day')}
          />
        </Descriptions.Item>

        <Descriptions.Item label={t('detail.patientInfo.labels.age')} span={1}>
          <Text className={styles.textPrimary}>{patient.age?.display || '-'}</Text>
        </Descriptions.Item>

        <Descriptions.Item label={t('detail.patientInfo.labels.weight')} span={1}>
          <InputNumber
            value={patient.weight}
            onChange={(value) => handleFieldUpdate('weight', value)}
            min={0.01}
            max={500}
            precision={2}
            className={styles.fullWidth}
            disabled={isSaving}
            addonAfter="kg"
          />
        </Descriptions.Item>

        <Descriptions.Item label={t('detail.patientInfo.labels.color')} span={1}>
          <Text
            editable={{
              onChange: (value) => {
                setLocalValues(prev => ({ ...prev, color: value })); // Immediate update
                const result = colorEdit.onChange(value);
                if (!result.success && result.error) {
                  message.error(result.error);
                  setLocalValues(prev => ({ ...prev, color: patient.color || '' })); // Revert on validation error
                }
              },
              triggerType: ['text'],
            }}
            className={styles.textPrimary}
          >
            {localValues.color || '-'}
          </Text>
        </Descriptions.Item>

        <Descriptions.Item label={t('detail.patientInfo.labels.microchipId')} span={1}>
          <Text
            editable={{
              onChange: (value) => {
                setLocalValues(prev => ({ ...prev, microchipId: value })); // Immediate update
                const result = microchipEdit.onChange(value);
                if (!result.success && result.error) {
                  message.error(result.error);
                  setLocalValues(prev => ({ ...prev, microchipId: patient.microchipId || '' })); // Revert on validation error
                }
              },
              triggerType: ['text'],
            }}
            className={styles.textPrimary}
          >
            {localValues.microchipId || '-'}
          </Text>
        </Descriptions.Item>

        <Descriptions.Item label={t('detail.patientInfo.labels.status')} span={1}>
          <Text style={{ color: patient.isActive ? '#52c41a' : '#ff4d4f' }}>
            {patient.isActive ? t('detail.patientInfo.status.active') : t('detail.patientInfo.status.inactive')}
          </Text>
        </Descriptions.Item>

        <Descriptions.Item label={t('detail.patientInfo.labels.created')} span={1}>
          <Text className={styles.textSecondary}>
            {formatDateTime(patient.createdAt)}
          </Text>
        </Descriptions.Item>

        <Descriptions.Item label={t('detail.patientInfo.labels.lastUpdated')} span={1}>
          <Text className={styles.textSecondary}>
            {formatDateTime(patient.updatedAt)}
          </Text>
        </Descriptions.Item>
      </Descriptions>
    </div>
  );
};