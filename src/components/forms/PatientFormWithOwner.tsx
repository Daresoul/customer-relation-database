/**
 * Enhanced Patient form with owner/household selection
 *
 * Refactored to use PatientFieldGroup for reusable field definitions.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Form,
  Input,
  Select,
  Button,
  Space,
  Row,
  Col,
  Card,
  Divider,
  Alert,
  App,
} from 'antd';
import {
  SaveOutlined,
  CloseOutlined,
  HeartOutlined,
  PlusOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { invoke } from '@tauri-apps/api/tauri';
import { Patient, CreatePatientInput, UpdatePatientInput } from '../../types';
import { useSpecies } from '../../hooks/useSpecies';
import { useBreeds } from '../../hooks/useBreeds';
import { CreateSpeciesModal } from '../../components/CreateSpeciesModal';
import { CreateBreedModal } from '../../components/CreateBreedModal';
import { PatientFieldGroup } from './fieldGroups';
import styles from './Forms.module.css';

const { Option } = Select;

interface Household {
  id: number;
  lastName: string;
  primaryContact?: string;
  phone?: string;
  email?: string;
}

interface PatientFormWithOwnerProps {
  patient?: Patient;
  onSubmit: (data: CreatePatientInput | UpdatePatientInput) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export const PatientFormWithOwner: React.FC<PatientFormWithOwnerProps> = ({
  patient,
  onSubmit,
  onCancel,
  loading = false,
}) => {
  const { t } = useTranslation(['entities', 'forms']);
  const [form] = Form.useForm();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [searchingHouseholds, setSearchingHouseholds] = useState(false);
  const [showCreateHousehold, setShowCreateHousehold] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { notification } = App.useApp();

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

  // Load initial data
  useEffect(() => {
    if (patient) {
      form.setFieldsValue({
        ...patient,
        dateOfBirth: patient.dateOfBirth ? dayjs(patient.dateOfBirth) : null,
      });
    }
  }, [patient, form]);

  // Search households with debouncing
  const searchHouseholdsRaw = async (query: string) => {
    if (query && query.trim().length < 2) {
      setHouseholds([]);
      return;
    }

    setSearchingHouseholds(true);
    try {
      const result = await invoke<any>('search_households', { query: query || '', limit: 20 });

      let householdList = [];

      if (result?.results && Array.isArray(result.results)) {
        householdList = result.results.map((item: any) => {
          const primaryPerson = item.people?.find((p: any) => p.is_primary) || item.people?.[0];
          const householdName = item.household_name ||
                               (primaryPerson ? primaryPerson.last_name : null) ||
                               'Unnamed Household';

          return {
            id: item.id,
            lastName: householdName,
            primaryContact: primaryPerson ? `${primaryPerson.first_name} ${primaryPerson.last_name}` : null,
            phone: primaryPerson?.contacts?.find((c: any) => c.contact_type === 'phone')?.contact_value || null,
            email: primaryPerson?.contacts?.find((c: any) => c.contact_type === 'email')?.contact_value || null,
            address: item.address,
            household_name: householdName
          };
        });
      } else if (Array.isArray(result)) {
        householdList = result;
      }

      const uniqueHouseholds = householdList.filter((household, index, self) =>
        index === self.findIndex((h) => h.id === household.id)
      );

      setHouseholds(uniqueHouseholds);
    } catch (error) {
      console.error('Failed to search households:', error);
      setHouseholds([]);
    } finally {
      setSearchingHouseholds(false);
    }
  };

  const searchHouseholds = useCallback((query: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchHouseholdsRaw(query);
    }, 300);
  }, []);

  // Handle form submission
  const handleSubmit = async () => {
    setFormError(null);

    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const formData: CreatePatientInput = {
        name: values.name,
        speciesId: values.speciesId,
        breedId: values.breedId || null,
        dateOfBirth: values.dateOfBirth ? values.dateOfBirth.format('YYYY-MM-DD') : null,
        gender: values.gender || null,
        weight: values.weight || null,
        color: values.color || null,
        microchipId: values.microchipId || null,
        householdId: values.householdId || null,
      };

      // Create household if needed
      if (showCreateHousehold && values.newHouseholdName) {
        try {
          const newHousehold = await invoke<Household>('create_household', {
            lastName: values.newHouseholdName,
            contacts: values.newHouseholdContact ? [{
              name: values.newHouseholdContact,
              isPrimary: true,
              email: values.newHouseholdEmail || null,
              phone: values.newHouseholdPhone || null,
            }] : [],
          });
          formData.householdId = newHousehold.id;
        } catch (error: any) {
          setFormError(`Failed to create household: ${error?.message || error}`);
          setSubmitting(false);
          return;
        }
      }

      await onSubmit(formData);
      notification.success({
        message: "Success",
        description: patient ? 'Patient updated successfully!' : 'Patient created successfully!',
        placement: "bottomRight",
        duration: 3
      });
      form.resetFields();
    } catch (error: any) {
      console.error('Form submission error:', error);
      if (error?.errorFields) {
        const firstError = error.errorFields[0]?.errors[0];
        setFormError(firstError || 'Please check all required fields');
      } else {
        setFormError(error?.message || 'Failed to save patient');
      }
    } finally {
      setSubmitting(false);
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
          <HeartOutlined className={styles.iconPink} />
          {patient ? 'Edit Patient' : 'Add New Patient'}
        </Space>
      }
      className={styles.formCardCentered}
    >
      {formError && (
        <Alert
          message="Error"
          description={formError}
          type="error"
          showIcon
          closable
          onClose={() => setFormError(null)}
          className={styles.formAlert}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark={true}
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
          showActiveSwitch={false}
          showColor={true}
          showMicrochipId={true}
        />

        <Divider orientation="left">
          <Space>
            <HomeOutlined />
            Household Information
          </Space>
        </Divider>

        {/* Household Selection */}
        {!showCreateHousehold ? (
          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item name="householdId" label="Select Household (Optional)">
                <Select
                  placeholder="Search for household by name..."
                  showSearch
                  allowClear
                  loading={searchingHouseholds}
                  onSearch={searchHouseholds}
                  filterOption={false}
                  notFoundContent={searchingHouseholds ? 'Searching...' : 'No households found'}
                  className={styles.fullWidth}
                >
                  {(Array.isArray(households) ? households : [])
                    .filter(household => household && household.id != null)
                    .map(household => (
                      <Option key={`household-${household.id}`} value={household.id}>
                        <Space>
                          <HomeOutlined />
                          <span>{household.lastName || 'Unknown'}</span>
                          {household.primaryContact && (
                            <span className={styles.householdOption}>({household.primaryContact})</span>
                          )}
                        </Space>
                      </Option>
                    ))}
                </Select>
              </Form.Item>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => setShowCreateHousehold(true)}
                className={styles.actionButton}
              >
                Create New Household
              </Button>
            </Col>
          </Row>
        ) : (
          <>
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="newHouseholdName"
                  label="Household Name"
                  rules={[{ required: true, message: 'Please enter household name' }]}
                >
                  <Input placeholder="Enter household/last name" />
                </Form.Item>
              </Col>

              <Col xs={24} sm={12}>
                <Form.Item
                  name="newHouseholdContact"
                  label="Primary Contact Name"
                >
                  <Input placeholder="Enter primary contact name" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="newHouseholdEmail"
                  label="Household Email"
                  rules={[{ type: 'email', message: 'Please enter a valid email' }]}
                >
                  <Input placeholder="Enter email" type="email" />
                </Form.Item>
              </Col>

              <Col xs={24} sm={12}>
                <Form.Item name="newHouseholdPhone" label="Household Phone">
                  <Input placeholder="Enter phone number" />
                </Form.Item>
              </Col>
            </Row>

            <Button
              type="link"
              onClick={() => {
                setShowCreateHousehold(false);
                form.resetFields(['newHouseholdName', 'newHouseholdContact', 'newHouseholdEmail', 'newHouseholdPhone']);
              }}
              className={styles.actionButton}
            >
              Cancel and select existing household
            </Button>
          </>
        )}

        {/* Form Actions */}
        <Form.Item>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={submitting}
              disabled={loading}
            >
              {patient ? 'Update Patient' : 'Create Patient'}
            </Button>
            <Button
              type="default"
              icon={<CloseOutlined />}
              onClick={onCancel}
              disabled={submitting}
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
          const newBreed = breedsData.find(b => b.name === breedName);
          if (newBreed) {
            form.setFieldValue('breedId', newBreed.id);
          }
        }}
      />
    </Card>
  );
};

export default PatientFormWithOwner;
