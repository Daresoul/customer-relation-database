import React, { useState, useEffect } from 'react';
import { Descriptions, Typography, Spin, App, Select, DatePicker, InputNumber } from 'antd';
import { PatientDetail, SPECIES_OPTIONS, GENDER_OPTIONS, PATIENT_FIELD_RULES } from '../../types/patient';
import { useUpdatePatient } from '../../hooks/usePatient';
import { useInlineEdit } from '../../hooks/useAutoSave';
import dayjs from 'dayjs';

const { Text } = Typography;

interface PatientInfoProps {
  patient: PatientDetail;
}

export const PatientInfo: React.FC<PatientInfoProps> = ({ patient }) => {
  const { message } = App.useApp();
  const updatePatient = useUpdatePatient();

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
    console.log('🔍 PatientInfo: Updating field:', field, 'with value:', value);

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
      message.error('Failed to save changes');
    }
  };

  // Inline edit hooks for text fields
  const nameEdit = useInlineEdit({
    value: localValues.name || '',
    onSave: (value) => handleFieldUpdate('name', value),
    validate: (value) => {
      if (!value || value.trim().length === 0) return 'Name is required';
      if (value.length > PATIENT_FIELD_RULES.name.max) return PATIENT_FIELD_RULES.name.message;
      return true;
    }
  });

  const breedEdit = useInlineEdit({
    value: localValues.breed || '',
    onSave: (value) => handleFieldUpdate('breed', value),
    validate: (value) => {
      if (value && value.length > PATIENT_FIELD_RULES.breed.max) return PATIENT_FIELD_RULES.breed.message;
      return true;
    }
  });

  const colorEdit = useInlineEdit({
    value: localValues.color || '',
    onSave: (value) => handleFieldUpdate('color', value),
    validate: (value) => value.length <= 50 || 'Color must be 50 characters or less'
  });

  const microchipEdit = useInlineEdit({
    value: localValues.microchipId || '',
    onSave: (value) => handleFieldUpdate('microchipId', value),
    validate: (value) => {
      if (!value) return true;
      if (!PATIENT_FIELD_RULES.microchipId.pattern.test(value)) return PATIENT_FIELD_RULES.microchipId.message;
      if (value.length > PATIENT_FIELD_RULES.microchipId.max) return PATIENT_FIELD_RULES.microchipId.message;
      return true;
    }
  });

  const isSaving = updatePatient.isPending;

  return (
    <div style={{ background: '#1f1f1f', padding: 24, borderRadius: 8 }}>
      <Typography.Title level={4} style={{ color: '#E6E6E6', marginBottom: 16 }}>
        Patient Information
      </Typography.Title>

      <Descriptions
        bordered
        column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 3, xxl: 4 }}
        styles={{
          label: {
            background: '#262626',
            color: '#A6A6A6',
            width: '120px',
            minWidth: '100px',
            maxWidth: '150px'
          },
          content: {
            background: '#1f1f1f',
            color: '#E6E6E6',
            minWidth: '200px'
          }
        }}
      >
        <Descriptions.Item label="Name" span={1}>
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
            style={{ color: '#E6E6E6' }}
          >
            {localValues.name || '-'}
          </Text>
        </Descriptions.Item>

        <Descriptions.Item label="Species" span={1}>
          <Select
            value={patient.species}
            onChange={(value) => handleFieldUpdate('species', value)}
            options={SPECIES_OPTIONS}
            style={{ width: '100%' }}
            disabled={isSaving}
          />
        </Descriptions.Item>

        <Descriptions.Item label="Breed" span={1}>
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
            style={{ color: '#E6E6E6' }}
          >
            {localValues.breed || '-'}
          </Text>
        </Descriptions.Item>

        <Descriptions.Item label="Gender" span={1}>
          <Select
            value={patient.gender || 'Unknown'}
            onChange={(value) => handleFieldUpdate('gender', value)}
            options={GENDER_OPTIONS}
            style={{ width: '100%' }}
            disabled={isSaving}
          />
        </Descriptions.Item>

        <Descriptions.Item label="Date of Birth" span={1}>
          <DatePicker
            value={localValues.dateOfBirth ? dayjs(localValues.dateOfBirth) : undefined}
            onChange={(date) => {
              const dateString = date ? date.format('YYYY-MM-DD') : undefined;
              console.log('🔍 DatePicker onChange - date:', date, 'dateString:', dateString);
              setLocalValues(prev => ({ ...prev, dateOfBirth: dateString }));
              handleFieldUpdate('dateOfBirth', dateString);
            }}
            format="YYYY-MM-DD"
            style={{ width: '100%' }}
            disabled={isSaving}
            disabledDate={(current) => current && current > dayjs().endOf('day')}
          />
        </Descriptions.Item>

        <Descriptions.Item label="Age" span={1}>
          <Text style={{ color: '#E6E6E6' }}>{patient.age?.display || '-'}</Text>
        </Descriptions.Item>

        <Descriptions.Item label="Weight (kg)" span={1}>
          <InputNumber
            value={patient.weight}
            onChange={(value) => handleFieldUpdate('weight', value)}
            min={0.01}
            max={500}
            precision={2}
            style={{ width: '100%' }}
            disabled={isSaving}
            addonAfter="kg"
          />
        </Descriptions.Item>

        <Descriptions.Item label="Color" span={1}>
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
            style={{ color: '#E6E6E6' }}
          >
            {localValues.color || '-'}
          </Text>
        </Descriptions.Item>

        <Descriptions.Item label="Microchip ID" span={1}>
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
            style={{ color: '#E6E6E6' }}
          >
            {localValues.microchipId || '-'}
          </Text>
        </Descriptions.Item>

        <Descriptions.Item label="Status" span={1}>
          <Text style={{ color: patient.isActive ? '#52c41a' : '#ff4d4f' }}>
            {patient.isActive ? 'Active' : 'Inactive'}
          </Text>
        </Descriptions.Item>

        <Descriptions.Item label="Created" span={1}>
          <Text style={{ color: '#A6A6A6' }}>
            {dayjs(patient.createdAt).format('YYYY-MM-DD HH:mm')}
          </Text>
        </Descriptions.Item>

        <Descriptions.Item label="Last Updated" span={1}>
          <Text style={{ color: '#A6A6A6' }}>
            {dayjs(patient.updatedAt).format('YYYY-MM-DD HH:mm')}
          </Text>
        </Descriptions.Item>
      </Descriptions>
    </div>
  );
};