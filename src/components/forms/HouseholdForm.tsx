/**
 * T018: Household form component with Ant Design
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Form,
  Input,
  Button,
  Space,
  Row,
  Col,
  Card,
  Divider,
  message,
  Typography,
  Tooltip,
  Select,
  List,
  Popconfirm,
  Empty,
  Tag,
} from 'antd';
import {
  SaveOutlined,
  CloseOutlined,
  HomeOutlined,
  PlusOutlined,
  DeleteOutlined,
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { HouseholdFormValues, ContactFormValues } from '../../types/ui.types';
import { invoke } from '@/services/invoke';
import styles from './Forms.module.css';

/** Subset of the Patient model that's enough to render the
 *  patient-association list inside the household form. */
interface PatientLite {
  id: number;
  name: string;
  species?: string | null;
  breed?: string | null;
  microchipId?: string | null;
  householdId?: number | null;
}

const { Title, Text } = Typography;

interface HouseholdFormProps {
  initialValues?: HouseholdFormValues;
  onSubmit: (data: HouseholdFormValues) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  mode?: 'create' | 'edit';
}

export const HouseholdForm: React.FC<HouseholdFormProps> = ({
  initialValues,
  onSubmit,
  onCancel,
  loading = false,
  mode = 'create',
}) => {
  const [form] = Form.useForm();

  // Patient-association state. Only meaningful in edit mode (need the
  // household's id to assign patients to it via update_patient). For
  // create mode we hide this whole section and prompt the user to
  // re-open the household after creation to add patients.
  const householdId = mode === 'edit' ? initialValues?.id : undefined;
  const [householdPatients, setHouseholdPatients] = useState<PatientLite[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [searchValue, setSearchValue] = useState<string>('');
  const [searchResults, setSearchResults] = useState<PatientLite[]>([]);
  const [searching, setSearching] = useState(false);
  const patientSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialValues) {
      form.setFieldsValue(initialValues);
    }
  }, [initialValues, form]);

  // Load patients currently assigned to this household when entering
  // edit mode. The backend doesn't have a dedicated by-household
  // endpoint so we fetch all and filter — fine for the scales this app
  // operates at (single clinic, hundreds of patients max). If usage grows
  // we'd add `get_patients_by_household` as a focused command.
  const refreshHouseholdPatients = useCallback(async () => {
    if (!householdId) return;
    setLoadingPatients(true);
    try {
      const all = await invoke<PatientLite[]>('get_patients');
      setHouseholdPatients(
        (all || []).filter((p) => p.householdId === householdId),
      );
    } catch (err) {
      console.error('Failed to load household patients:', err);
      message.error('Could not load patients for this household.');
    } finally {
      setLoadingPatients(false);
    }
  }, [householdId]);

  useEffect(() => {
    void refreshHouseholdPatients();
  }, [refreshHouseholdPatients]);

  // Debounced patient search for the "Add existing patient" picker.
  // Excludes patients already in this household so the dropdown only
  // shows actionable choices.
  const runPatientSearch = useCallback(
    async (query: string) => {
      const q = query.trim();
      if (q.length < 2) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      try {
        const results = await invoke<PatientLite[]>('search_patients', { query: q });
        const currentIds = new Set(householdPatients.map((p) => p.id));
        setSearchResults((results || []).filter((p) => !currentIds.has(p.id)));
      } catch (err) {
        console.error('Patient search failed:', err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [householdPatients],
  );

  const onPatientSearchTyped = (value: string) => {
    setSearchValue(value);
    if (patientSearchTimeout.current) clearTimeout(patientSearchTimeout.current);
    patientSearchTimeout.current = setTimeout(() => runPatientSearch(value), 250);
  };

  // Adding / removing a patient is a single update_patient call with the
  // new householdId (or null for remove). The patient model already has
  // a nullable household_id so no schema change needed.
  const handleAddPatient = async (patientId: number) => {
    if (!householdId) return;
    try {
      await invoke('update_patient', {
        id: patientId,
        dto: { householdId },
      });
      message.success('Patient added to household.');
      setSearchValue('');
      setSearchResults([]);
      await refreshHouseholdPatients();
    } catch (err: any) {
      console.error('Add patient failed:', err);
      message.error(`Could not add patient: ${err?.message || err}`);
    }
  };

  const handleRemovePatient = async (patientId: number) => {
    try {
      await invoke('update_patient', {
        id: patientId,
        dto: { householdId: null },
      });
      message.success('Patient removed from household.');
      await refreshHouseholdPatients();
    } catch (err: any) {
      console.error('Remove patient failed:', err);
      message.error(`Could not remove patient: ${err?.message || err}`);
    }
  };

  const handleSubmit = async (values: HouseholdFormValues) => {
    // Ensure at least one contact is marked as primary
    const contacts = values.contacts || [];
    if (contacts.length > 0 && !contacts.some(c => c.isPrimary)) {
      contacts[0].isPrimary = true;
    }

    await onSubmit({ ...values, contacts });
    if (mode === 'create') {
      form.resetFields();
    }
  };

  return (
    <Card
      title={
        <Space>
          <HomeOutlined />
          {mode === 'create' ? 'Create New Household' : 'Edit Household'}
        </Space>
      }
      className={styles.formCardLarge}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        autoComplete="off"
        initialValues={{
          contacts: [{ isPrimary: true }], // Start with one primary contact
        }}
      >
        <Row gutter={16}>
          <Col xs={24}>
            <Form.Item
              name="lastName"
              label="Household Name"
              rules={[
                { required: true, message: 'Please enter household name' },
                { max: 100, message: 'Name cannot exceed 100 characters' },
              ]}
            >
              <Input
                placeholder="Enter household/family name"
                prefix={<HomeOutlined />}
                size="large"
              />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left">
          <Space>
            <UserOutlined />
            Contacts
          </Space>
        </Divider>

        <Form.List name="contacts">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name, ...restField }, index) => (
                <Card
                  key={key}
                  size="small"
                  className={styles.contactCard}
                  title={
                    <Space>
                      <Text>Contact {index + 1}</Text>
                      <Form.Item
                        {...restField}
                        name={[name, 'isPrimary']}
                        valuePropName="checked"
                        noStyle
                      >
                        <Button
                          type={form.getFieldValue(['contacts', name, 'isPrimary']) ? 'primary' : 'default'}
                          size="small"
                          onClick={() => {
                            const contacts = form.getFieldValue('contacts');
                            contacts.forEach((_, idx) => {
                              form.setFieldValue(['contacts', idx, 'isPrimary'], idx === index);
                            });
                          }}
                        >
                          {form.getFieldValue(['contacts', name, 'isPrimary']) ? 'Primary' : 'Set as Primary'}
                        </Button>
                      </Form.Item>
                    </Space>
                  }
                  extra={
                    fields.length > 1 && (
                      <Tooltip title="Remove contact">
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => remove(name)}
                          size="small"
                        />
                      </Tooltip>
                    )
                  }
                >
                  <Row gutter={16}>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        {...restField}
                        name={[name, 'firstName']}
                        label="First Name"
                        rules={[{ required: true, message: 'First name required' }]}
                      >
                        <Input placeholder="First name" prefix={<UserOutlined />} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        {...restField}
                        name={[name, 'lastName']}
                        label="Last Name"
                        rules={[{ required: true, message: 'Last name required' }]}
                      >
                        <Input placeholder="Last name" />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={16}>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        {...restField}
                        name={[name, 'phone']}
                        label="Phone"
                        rules={[
                          { pattern: /^[\d\s\-\+\(\)]+$/, message: 'Invalid phone format' },
                        ]}
                      >
                        <Input placeholder="Phone number" prefix={<PhoneOutlined />} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        {...restField}
                        name={[name, 'email']}
                        label="Email"
                        rules={[{ type: 'email', message: 'Invalid email address' }]}
                      >
                        <Input placeholder="Email (optional)" prefix={<MailOutlined />} />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={16}>
                    <Col xs={24}>
                      <Form.Item
                        {...restField}
                        name={[name, 'relationship']}
                        label="Relationship/Role"
                      >
                        <Input placeholder="e.g., Owner, Emergency Contact, etc." />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>
              ))}

              <Form.Item>
                <Button
                  type="dashed"
                  onClick={() => add()}
                  block
                  icon={<PlusOutlined />}
                >
                  Add Another Contact
                </Button>
              </Form.Item>
            </>
          )}
        </Form.List>

        <Divider orientation="left">
          <Space>
            <HomeOutlined />
            Address (Optional)
          </Space>
        </Divider>

        <Row gutter={16}>
          <Col xs={24}>
            <Form.Item
              name={['address', 'street']}
              label="Street Address"
            >
              <Input placeholder="Street address" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name={['address', 'city']}
              label="City"
            >
              <Input placeholder="City" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={6}>
            <Form.Item
              name={['address', 'state']}
              label="State"
            >
              <Input placeholder="State" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={6}>
            <Form.Item
              name={['address', 'zipCode']}
              label="ZIP Code"
            >
              <Input placeholder="ZIP" />
            </Form.Item>
          </Col>
        </Row>

        <Divider />

        <Row gutter={16}>
          <Col xs={24}>
            <Form.Item
              name="notes"
              label="Notes"
            >
              <Input.TextArea
                rows={3}
                placeholder="Additional notes about this household"
                showCount
                maxLength={500}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Patient association — edit mode only. For new households we
            don't have an id yet to assign patients to; the user can
            re-open the household after creation to add patients. */}
        {mode === 'edit' && householdId && (
          <>
            <Divider orientation="left">
              <Space>
                <UserOutlined />
                Patients
              </Space>
            </Divider>

            <List
              loading={loadingPatients}
              dataSource={householdPatients}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No patients in this household yet."
                  />
                ),
              }}
              renderItem={(p) => (
                <List.Item
                  actions={[
                    <Popconfirm
                      key="remove"
                      title="Remove this patient from the household?"
                      description="The patient record stays — only the household link is cleared."
                      onConfirm={() => handleRemovePatient(p.id)}
                      okText="Remove"
                      cancelText="Cancel"
                      okButtonProps={{ danger: true }}
                    >
                      <Button type="link" danger icon={<DeleteOutlined />}>
                        Remove
                      </Button>
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<UserOutlined />}
                    title={p.name}
                    description={
                      <Space size={6} wrap>
                        {p.species && <Tag>{p.species}</Tag>}
                        {p.breed && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {p.breed}
                          </Text>
                        )}
                        {p.microchipId && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Chip: {p.microchipId}
                          </Text>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />

            <Form.Item label="Add existing patient" style={{ marginTop: 16 }}>
              <Select
                showSearch
                // Always render as "empty" — we clear immediately after
                // onChange via handleAddPatient → setSearchValue(''), and
                // binding `value` to a string search query trips the
                // type-checker (option values are numeric patient IDs).
                value={undefined}
                placeholder="Search by patient name or microchip ID (type 2+ chars)"
                suffixIcon={<SearchOutlined />}
                filterOption={false}
                loading={searching}
                onSearch={onPatientSearchTyped}
                onChange={(patientId: number) => {
                  if (patientId) void handleAddPatient(patientId);
                }}
                notFoundContent={
                  searching
                    ? 'Searching...'
                    : searchValue.trim().length < 2
                      ? 'Type 2 or more characters to search.'
                      : 'No matching patients found.'
                }
                style={{ width: '100%' }}
                allowClear
              >
                {searchResults.map((p) => (
                  <Select.Option key={p.id} value={p.id}>
                    <Space>
                      <UserOutlined />
                      <span>{p.name}</span>
                      {p.species && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          ({p.species}
                          {p.breed ? ` — ${p.breed}` : ''})
                        </Text>
                      )}
                      {p.microchipId && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {p.microchipId}
                        </Text>
                      )}
                    </Space>
                  </Select.Option>
                ))}
              </Select>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Picking a patient immediately moves them into this household.
                The other household (if any) loses the link.
              </Text>
            </Form.Item>
          </>
        )}

        {mode === 'create' && (
          <>
            <Divider orientation="left">
              <Space>
                <UserOutlined />
                Patients
              </Space>
            </Divider>
            <Text type="secondary">
              Save this household first, then re-open it to add or move patients
              into it. From the patient form you can also assign patients to
              this household by name.
            </Text>
          </>
        )}

        <Form.Item style={{ marginTop: 24 }}>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={loading}
              size="large"
            >
              {mode === 'create' ? 'Create Household' : 'Save Changes'}
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
    </Card>
  );
};