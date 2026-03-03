/**
 * CollapsiblePatientForm - Drop-in expandable patient creation form
 *
 * Used for inline patient creation in contexts like DeviceImportModal
 * where a full modal isn't needed but quick patient entry is desired.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Form,
  Button,
  Space,
  Collapse,
  Alert,
  App,
} from 'antd';
import {
  PlusOutlined,
  SaveOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/tauri';
import { PatientFieldGroup } from './fieldGroups';
import { useSpecies } from '../../hooks/useSpecies';
import { useBreeds } from '../../hooks/useBreeds';
import { CreateSpeciesModal } from '../CreateSpeciesModal';
import { CreateBreedModal } from '../CreateBreedModal';
import type { Patient, CreatePatientInput } from '../../types';
import styles from './Forms.module.css';

const { Panel } = Collapse;

export interface CollapsiblePatientFormProps {
  /** Whether the form should be expanded by default */
  defaultExpanded?: boolean;
  /** Callback when a patient is successfully created */
  onPatientCreated?: (patient: Patient) => void;
  /** Callback when the user cancels */
  onCancel?: () => void;
  /** Pre-filled data from device import or other sources */
  suggestedData?: Partial<CreatePatientInput>;
  /** Household ID to associate the patient with */
  householdId?: number;
  /** Whether the form is currently expanded (controlled mode) */
  isExpanded?: boolean;
  /** Callback to toggle expanded state (controlled mode) */
  onToggleExpand?: (expanded: boolean) => void;
  /** Header text for the collapse panel */
  headerText?: string;
}

export const CollapsiblePatientForm: React.FC<CollapsiblePatientFormProps> = ({
  defaultExpanded = false,
  onPatientCreated,
  onCancel,
  suggestedData,
  householdId,
  isExpanded,
  onToggleExpand,
  headerText,
}) => {
  const { t } = useTranslation(['entities', 'forms', 'common']);
  const { notification } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Controlled vs uncontrolled mode
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const expanded = isExpanded !== undefined ? isExpanded : internalExpanded;
  const setExpanded = onToggleExpand || setInternalExpanded;

  // Species and breed data
  const { data: speciesData = [], isLoading: isLoadingSpecies } = useSpecies(true);
  const selectedSpeciesId = Form.useWatch('speciesId', form);
  const { data: breedsData = [], isLoading: isLoadingBreeds } = useBreeds(selectedSpeciesId, true);

  // Modal state for creating new species/breed
  const [showCreateSpeciesModal, setShowCreateSpeciesModal] = useState(false);
  const [newSpeciesName, setNewSpeciesName] = useState('');
  const [showCreateBreedModal, setShowCreateBreedModal] = useState(false);
  const [newBreedName, setNewBreedName] = useState('');

  // Initialize form with suggested data
  React.useEffect(() => {
    if (suggestedData) {
      form.setFieldsValue(suggestedData);
    }
    if (householdId) {
      form.setFieldValue('householdId', householdId);
    }
  }, [suggestedData, householdId, form]);

  const handleSubmit = async () => {
    setError(null);
    try {
      const values = await form.validateFields();
      setLoading(true);

      const patientData: CreatePatientInput = {
        name: values.name,
        speciesId: values.speciesId,
        breedId: values.breedId || null,
        dateOfBirth: values.dateOfBirth ? values.dateOfBirth.format('YYYY-MM-DD') : null,
        gender: values.gender || null,
        weight: values.weight ? parseFloat(values.weight) : null,
        microchipId: values.microchipId || null,
        color: values.color || null,
        householdId: householdId || null,
      };

      const createdPatient = await invoke<Patient>('create_patient', { patient: patientData });

      notification.success({
        message: t('common:success'),
        description: t('forms:messages.patientCreated', 'Patient created successfully'),
        placement: 'bottomRight',
        duration: 3,
      });

      form.resetFields();
      setExpanded(false);
      onPatientCreated?.(createdPatient);
    } catch (err: any) {
      console.error('Failed to create patient:', err);
      const errorMsg = err?.message || t('forms:errors.createFailed', 'Failed to create patient');
      setError(errorMsg);
      notification.error({
        message: t('common:error'),
        description: errorMsg,
        placement: 'bottomRight',
        duration: 5,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setError(null);
    setExpanded(false);
    onCancel?.();
  };

  const handleCollapseChange = (keys: string | string[]) => {
    const isOpen = Array.isArray(keys) ? keys.includes('patient') : keys === 'patient';
    setExpanded(isOpen);
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
    <>
      <Collapse
        activeKey={expanded ? ['patient'] : []}
        onChange={handleCollapseChange}
        ghost
        className={styles.collapsibleForm}
      >
        <Panel
          key="patient"
          header={
            <Space>
              <PlusOutlined />
              {headerText || t('forms:labels.createNewPatient', 'Create New Patient')}
            </Space>
          }
        >
          {error && (
            <Alert
              message={t('common:error')}
              description={error}
              type="error"
              showIcon
              closable
              onClose={() => setError(null)}
              style={{ marginBottom: 16 }}
            />
          )}

          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
          >
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
              showActiveSwitch={false}
              showColor={true}
              showMicrochipId={true}
            />

            <Form.Item style={{ marginTop: 16, marginBottom: 0 }}>
              <Space>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={loading}
                >
                  {t('common:buttons.create', 'Create')}
                </Button>
                <Button
                  onClick={handleCancel}
                  icon={<CloseOutlined />}
                  disabled={loading}
                >
                  {t('common:buttons.cancel', 'Cancel')}
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Panel>
      </Collapse>

      <CreateSpeciesModal
        open={showCreateSpeciesModal}
        initialName={newSpeciesName}
        onClose={() => {
          setShowCreateSpeciesModal(false);
          setNewSpeciesName('');
        }}
        onSuccess={(speciesName) => {
          // The species was created - find its ID from the refreshed list
          // Note: The useSpecies hook will auto-refresh after mutation
          // We store the name temporarily and the form will resolve the ID
          // when the species list refreshes
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
          // The breed was created - find its ID from the refreshed list
          const newBreed = breedsData.find(b => b.name === breedName);
          if (newBreed) {
            form.setFieldValue('breedId', newBreed.id);
          }
        }}
      />
    </>
  );
};

export default CollapsiblePatientForm;
