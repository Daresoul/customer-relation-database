/**
 * Enhanced Patient form with owner selection
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  Divider,
  Alert,
  App,
} from 'antd';
import {
  SaveOutlined,
  CloseOutlined,
  HeartOutlined,
  UserOutlined,
  PlusOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { invoke } from '@tauri-apps/api/tauri';
import { Patient, CreatePatientInput, UpdatePatientInput } from '../../types';
import styles from './Forms.module.css';

const { TextArea } = Input;
const { Option } = Select;

interface Owner {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
}

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
  const [owners, setOwners] = useState<Owner[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [searchingOwners, setSearchingOwners] = useState(false);
  const [searchingHouseholds, setSearchingHouseholds] = useState(false);
  const [showCreateOwner, setShowCreateOwner] = useState(false);
  const [showCreateHousehold, setShowCreateHousehold] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { message } = App.useApp();

  // Load initial data
  useEffect(() => {
    if (patient) {
      form.setFieldsValue({
        ...patient,
        dateOfBirth: patient.dateOfBirth ? dayjs(patient.dateOfBirth) : null,
      });
    }
    // Don't search on initial load, only when user starts typing
  }, [patient]);

  // Search owners
  const searchOwners = async (query: string) => {
    // If query is too short, don't search (backend requires 2+ chars)
    if (query && query.trim().length < 2) {
      setOwners([]);
      return;
    }

    setSearchingOwners(true);
    try {
      const result = await invoke<Owner[]>('search_owners', { query: query || '', limit: 20 });
      setOwners(result);
    } catch (error) {
      console.error('Failed to search owners:', error);
      setOwners([]);
    } finally {
      setSearchingOwners(false);
    }
  };

  // Search households with debouncing
  const searchHouseholdsRaw = async (query: string) => {
    // If query is too short, don't search (backend requires 2+ chars)
    if (query && query.trim().length < 2) {
      setHouseholds([]);
      return;
    }

    setSearchingHouseholds(true);
    try {
      const result = await invoke<any>('search_households', { query: query || '', limit: 20 });

      // The backend returns a SearchHouseholdsResponse with results array
      let householdList = [];

      if (result?.results && Array.isArray(result.results)) {
        // Transform the backend response to match our frontend structure
        householdList = result.results.map((item: any) => {
          // Backend now returns HouseholdSearchResult directly
          const primaryPerson = item.people?.find((p: any) => p.is_primary) || item.people?.[0];

          // Use household_name from the search result
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
        // If it's already an array, use as-is
        householdList = result;
      }

      // Deduplicate by id
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

  // Debounced search function
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
      
      // Format the data
      const formData = {
        ...values,
        dateOfBirth: values.dateOfBirth ? values.dateOfBirth.format('YYYY-MM-DD') : null,
        weight: values.weight || null,
        householdId: values.householdId || null, // Include the selected household ID
      };

      // Create owner if needed
      if (showCreateOwner && values.newOwnerFirstName && values.newOwnerLastName) {
        try {
          const newOwner = await invoke<Owner>('create_owner_with_contacts', {
            owner: {
              firstName: values.newOwnerFirstName,
              lastName: values.newOwnerLastName,
            },
            contacts: values.newOwnerEmail || values.newOwnerPhone ? [{
              isPrimary: true,
              email: values.newOwnerEmail || null,
              phone: values.newOwnerPhone || null,
            }] : [],
          });
          formData.ownerId = newOwner.id;
        } catch (error: any) {
          setFormError(`Failed to create owner: ${error?.message || error}`);
          setSubmitting(false);
          return;
        }
      }

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

      // Submit the patient data
      await onSubmit(formData);
      if (message) {
        message.success(patient ? 'Patient updated successfully!' : 'Patient created successfully!');
      }
      form.resetFields();
    } catch (error: any) {
      console.error('Form submission error:', error);
      if (error?.errorFields) {
        // Validation errors
        const firstError = error.errorFields[0]?.errors[0];
        setFormError(firstError || 'Please check all required fields');
      } else {
        setFormError(error?.message || 'Failed to save patient');
      }
    } finally {
      setSubmitting(false);
    }
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
        {/* Basic Information */}
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
              <Input placeholder="Enter patient name" prefix={<HeartOutlined />} />
            </Form.Item>
          </Col>

          <Col xs={24} sm={12}>
            <Form.Item
              name="species"
              label="Species"
              rules={[{ required: true, message: 'Please select species' }]}
            >
              <Select placeholder="Select species">
                <Option value="Dog">Dog</Option>
                <Option value="Cat">Cat</Option>
                <Option value="Bird">Bird</Option>
                <Option value="Rabbit">Rabbit</Option>
                <Option value="Hamster">Hamster</Option>
                <Option value="Guinea Pig">Guinea Pig</Option>
                <Option value="Reptile">Reptile</Option>
                <Option value="Fish">Fish</Option>
                <Option value="Other">Other</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} sm={8}>
            <Form.Item name="breed" label="Breed">
              <Input placeholder="Enter breed" />
            </Form.Item>
          </Col>

          <Col xs={24} sm={8}>
            <Form.Item name="dateOfBirth" label="Date of Birth">
              <DatePicker
                className={styles.fullWidth}
                format="YYYY-MM-DD"
                disabledDate={(current) => current && current > dayjs()}
                placeholder="Select date"
              />
            </Form.Item>
          </Col>

          <Col xs={24} sm={8}>
            <Form.Item name="gender" label="Gender">
              <Select placeholder="Select gender">
                <Option value="Male">{t('entities:gender.male')}</Option>
                <Option value="Female">{t('entities:gender.female')}</Option>
                <Option value="Unknown">{t('entities:gender.unknown')}</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
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
                min={0.01}
                max={500}
                step={0.1}
                precision={2}
              />
            </Form.Item>
          </Col>

          <Col xs={24} sm={8}>
            <Form.Item name="color" label="Color/Markings">
              <Input placeholder="Enter color/markings" />
            </Form.Item>
          </Col>

          <Col xs={24} sm={8}>
            <Form.Item name="microchipId" label="Microchip ID">
              <Input placeholder="Enter microchip ID" />
            </Form.Item>
          </Col>
        </Row>

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
                          <span>{household.lastName || household.household_name || 'Unknown'}</span>
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
    </Card>
  );
};

export default PatientFormWithOwner;