/**
 * T017: Patient form component with Ant Design
 *
 * Refactored to use PatientFieldGroup for reusable field definitions.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Form,
  InputNumber,
  Button,
  Space,
  Row,
  Col,
  Card,
  App,
} from 'antd';
import {
  SaveOutlined,
  CloseOutlined,
  HeartOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { Patient, CreatePatientInput, UpdatePatientInput } from '../../types';
import type { BaseFormProps } from '../../types/ui.types';
import { useSpecies } from '../../hooks/useSpecies';
import { useBreeds } from '../../hooks/useBreeds';
import { CreateSpeciesModal } from '../../components/CreateSpeciesModal';
import { CreateBreedModal } from '../../components/CreateBreedModal';
import { PatientFieldGroup } from './fieldGroups';
import styles from './Forms.module.css';

interface PatientFormProps extends Omit<BaseFormProps, 'onSubmit'> {
  patient?: Patient;
  onSubmit: (data: CreatePatientInput | UpdatePatientInput) => Promise<void>;
  onCancel: () => void;
  householdId?: number | null;
}

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
        color: values.color || null,
        medicalNotes: values.medicalNotes || null,
        householdId: values.householdId || null,
        isActive: values.isActive ?? true,
      };

      console.log('[PatientForm] Formatted data being submitted:', formattedData);

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

  const handleCreateSpecies = (name: string) => {
    setNewSpeciesName(name);
    setShowCreateSpeciesModal(true);
  };

  const handleCreateBreed = (name: string) => {
    setNewBreedName(name);
    setShowCreateBreedModal(true);
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
        {/* Patient Fields using shared component */}
        <PatientFieldGroup
          form={form}
          species={speciesData}
          breeds={breedsData}
          isLoadingSpecies={isLoadingSpecies}
          isLoadingBreeds={isLoadingBreeds}
          useIds={true}
          onSpeciesChange={() => form.setFieldValue('breedId', null)}
          onCreateSpecies={handleCreateSpecies}
          onCreateBreed={handleCreateBreed}
          showActiveSwitch={true}
          showColor={true}
          showMicrochipId={true}
        />

        {/* Hidden household ID field */}
        <Row gutter={16}>
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

        {/* Form Actions */}
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
          // Find the newly created species ID from the refreshed list
          const newSpecies = speciesData.find(s => s.name === speciesName);
          if (newSpecies) {
            form.setFieldValue('speciesId', newSpecies.id);
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
          // Find the newly created breed ID from the refreshed list
          const newBreed = breedsData.find(b => b.name === breedName);
          if (newBreed) {
            form.setFieldValue('breedId', newBreed.id);
          }
        }}
      />
    </Card>
  );
};
