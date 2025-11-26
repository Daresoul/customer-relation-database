import React, { useState, useEffect } from 'react';
import { Descriptions, Typography, Spin, App, Select, DatePicker, InputNumber } from 'antd';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { PatientDetail, GENDER_OPTIONS, PATIENT_FIELD_RULES } from '../../types/patient';
import { useUpdatePatient } from '../../hooks/usePatient';
import { useInlineEdit } from '../../hooks/useAutoSave';
import { useSpecies } from '../../hooks/useSpecies';
import { useBreeds } from '../../hooks/useBreeds';
import { SearchableSelect } from '../../components/SearchableSelect';
import { CreateSpeciesModal } from '../../components/CreateSpeciesModal';
import { CreateBreedModal } from '../../components/CreateBreedModal';
import dayjs from 'dayjs';
import { formatDateTime, getDatePickerFormat } from '../../utils/dateFormatter';
import { useThemeColors } from '../../utils/themeStyles';
import styles from './PatientDetail.module.css';

const { Text } = Typography;

interface PatientInfoProps {
  patient: PatientDetail;
}

export const PatientInfo: React.FC<PatientInfoProps> = ({ patient }) => {
  const { notification } = App.useApp();
  const { t } = useTranslation(['patients', 'entities']);
  const updatePatient = useUpdatePatient();
  const themeColors = useThemeColors();
  const queryClient = useQueryClient();

  // Fetch species from database
  const { data: speciesData = [], isLoading: isLoadingSpecies } = useSpecies(true);

  // Track currently selected species (for breed filtering)
  const [selectedSpeciesName, setSelectedSpeciesName] = useState<string | undefined>(patient.species);

  // Clear stale breed cache on mount to prevent showing wrong breeds
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['breeds'] });
  }, []); // Only run once on mount

  // Update selected species when patient data changes
  useEffect(() => {
    setSelectedSpeciesName(patient.species);
  }, [patient.species]);

  // Get species ID from selected species name
  const selectedSpecies = speciesData.find(s => s.name === selectedSpeciesName);
  const selectedSpeciesId = selectedSpecies?.id;

  // Fetch breeds for the selected species
  const { data: breedsData = [], isLoading: isLoadingBreeds } = useBreeds(selectedSpeciesId, true);

  // Modal state for creating new species
  const [showCreateSpeciesModal, setShowCreateSpeciesModal] = useState(false);
  const [newSpeciesName, setNewSpeciesName] = useState('');

  // Modal state for creating new breed
  const [showCreateBreedModal, setShowCreateBreedModal] = useState(false);
  const [newBreedName, setNewBreedName] = useState('');

  // Create options for species dropdown from database
  const speciesOptions = speciesData.map(species => ({
    value: species.name,
    label: species.name,
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
  // Sync with server values (including null/cleared values) to reflect actual state
  useEffect(() => {
    setLocalValues({
      name: patient.name,
      breed: patient.breed,
      color: patient.color,
      microchipId: patient.microchipId,
      dateOfBirth: patient.dateOfBirth,
    });
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
      notification.error({ message: "Error", description: t('detail.patientInfo.failedToSave'), placement: "bottomRight", duration: 5 });
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
                  notification.error({ message: "Error", description: result.error, placement: "bottomRight", duration: 5 });
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
          <SearchableSelect
            value={selectedSpeciesName}
            onChange={(value) => {
              // Handle clear
              if (!value) {
                setSelectedSpeciesName(undefined);
                handleFieldUpdate('speciesId', null);
                // Also clear breed when species is cleared
                if (patient.breed) {
                  handleFieldUpdate('breedId', null);
                }
                return;
              }

              // Find the species ID from the name
              const species = speciesData.find(s => s.name === value);
              console.log('Species selected:', value, 'Found species:', species, 'All species:', speciesData);
              if (species) {
                // Update local state immediately to filter breeds
                setSelectedSpeciesName(value);

                // Clear breed if it doesn't belong to the new species
                if (patient.breed) {
                  const currentBreed = breedsData.find(b => b.name === patient.breed);
                  if (!currentBreed || currentBreed.speciesId !== species.id) {
                    // Breed doesn't match new species, clear it
                    handleFieldUpdate('breedId', null);
                  }
                }

                // Update species
                handleFieldUpdate('speciesId', species.id);
              } else {
                console.error('Species not found in speciesData:', value);
                notification.error({
                  message: "Error",
                  description: `Species "${value}" not found. Please refresh and try again.`,
                  placement: "bottomRight",
                  duration: 5
                });
              }
            }}
            options={speciesOptions}
            placeholder={t('detail.patientInfo.placeholders.species') || 'Search species...'}
            className={styles.fullWidth}
            disabled={isSaving || isLoadingSpecies}
            loading={isLoadingSpecies}
            allowClear
            showSearch
            onCreateNew={(name) => {
              setNewSpeciesName(name);
              setShowCreateSpeciesModal(true);
            }}
          />
        </Descriptions.Item>

        <Descriptions.Item label={t('detail.patientInfo.labels.breed')} span={1}>
          <SearchableSelect
            value={patient.breed}
            onChange={(value) => {
              // Handle clear
              if (!value) {
                handleFieldUpdate('breedId', null);
                return;
              }

              // Find the breed ID from the name
              const breed = breedsData.find(b => b.name === value);
              if (breed) {
                handleFieldUpdate('breedId', breed.id);
              }
            }}
            options={breedsData.map(breed => ({
              value: breed.name,
              label: breed.name,
            }))}
            placeholder={t('detail.patientInfo.placeholders.breed') || 'Search breed...'}
            className={styles.fullWidth}
            disabled={isSaving || isLoadingBreeds || !selectedSpeciesName}
            loading={isLoadingBreeds}
            allowClear
            showSearch
            onCreateNew={(name) => {
              setNewBreedName(name);
              setShowCreateBreedModal(true);
            }}
          />
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
                  notification.error({ message: "Error", description: result.error, placement: "bottomRight", duration: 5 });
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
                  notification.error({ message: "Error", description: result.error, placement: "bottomRight", duration: 5 });
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

      <CreateSpeciesModal
        open={showCreateSpeciesModal}
        initialName={newSpeciesName}
        onClose={() => {
          setShowCreateSpeciesModal(false);
          setNewSpeciesName('');
        }}
        onSuccess={(speciesName) => {
          // Find the newly created species ID
          const species = speciesData.find(s => s.name === speciesName);
          if (species) {
            handleFieldUpdate('speciesId', species.id);
          }
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
          // Find the newly created breed ID
          const breed = breedsData.find(b => b.name === breedName);
          if (breed) {
            handleFieldUpdate('breedId', breed.id);
          }
        }}
      />
    </div>
  );
};