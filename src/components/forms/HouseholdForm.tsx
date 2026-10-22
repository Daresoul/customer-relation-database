/**
 * T018: Household form component with Ant Design
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['households', 'patients', 'forms', 'common', 'entities']);
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
      message.error(t('form.loadPatientsFailed'));
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
      message.success(t('form.patientAdded'));
      setSearchValue('');
      setSearchResults([]);
      await refreshHouseholdPatients();
    } catch (err: any) {
      console.error('Add patient failed:', err);
      message.error(t('form.addPatientFailed', { error: err?.message || err }));
    }
  };

  const handleRemovePatient = async (patientId: number) => {
    try {
      await invoke('update_patient', {
        id: patientId,
        dto: { householdId: null },
      });
      message.success(t('form.patientRemoved'));
      await refreshHouseholdPatients();
    } catch (err: any) {
      console.error('Remove patient failed:', err);
      message.error(t('form.removePatientFailed', { error: err?.message || err }));
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
          {mode === 'create' ? t('patients:detail.householdInfo.createNewHousehold') : t('patients:editHousehold')}
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
              label={t('form.householdName')}
              rules={[
                { required: true, message: t('form.householdNameRequired') },
                { max: 100, message: t('form.nameTooLong') },
              ]}
            >
              <Input
                placeholder={t('form.householdNamePlaceholder')}
                prefix={<HomeOutlined />}
                size="large"
              />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left">
          <Space>
            <UserOutlined />
            {t('form.contacts')}
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
                      <Text>{t('form.contactNumber', { number: index + 1 })}</Text>
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
                          {form.getFieldValue(['contacts', name, 'isPrimary']) ? t('form.primary') : t('form.setAsPrimary')}
                        </Button>
                      </Form.Item>
                    </Space>
                  }
                  extra={
                    fields.length > 1 && (
                      <Tooltip title={t('form.removeContact')}>
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
                        label={t('forms:labels.firstName')}
                        rules={[{ required: true, message: t('form.firstNameRequired') }]}
                      >
                        <Input placeholder={t('form.firstNamePlaceholder')} prefix={<UserOutlined />} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        {...restField}
                        name={[name, 'lastName']}
                        label={t('forms:labels.lastName')}
                        rules={[{ required: true, message: t('form.lastNameRequired') }]}
                      >
                        <Input placeholder={t('form.lastNamePlaceholder')} />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={16}>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        {...restField}
                        name={[name, 'phone']}
                        label={t('entities:contactTypes.phone')}
                        rules={[
                          { pattern: /^[\d\s\-\+\(\)]+$/, message: t('form.invalidPhone') },
                        ]}
                      >
                        <Input placeholder={t('form.phonePlaceholder')} prefix={<PhoneOutlined />} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item
                        {...restField}
                        name={[name, 'email']}
                        label={t('entities:contactTypes.email')}
                        rules={[{ type: 'email', message: t('form.invalidEmail') }]}
                      >
                        <Input placeholder={t('form.emailPlaceholder')} prefix={<MailOutlined />} />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={16}>
                    <Col xs={24}>
                      <Form.Item
                        {...restField}
                        name={[name, 'relationship']}
                        label={t('form.relationship')}
                      >
                        <Input placeholder={t('form.relationshipPlaceholder')} />
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
                  {t('form.addContact')}
                </Button>
              </Form.Item>
            </>
          )}
        </Form.List>

        <Divider orientation="left">
          <Space>
            <HomeOutlined />
            {t('form.addressSection')}
          </Space>
        </Divider>

        <Row gutter={16}>
          <Col xs={24}>
            <Form.Item
              name={['address', 'street']}
              label={t('form.street')}
            >
              <Input placeholder={t('form.streetPlaceholder')} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name={['address', 'city']}
              label={t('forms:labels.city')}
            >
              <Input placeholder={t('forms:labels.city')} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={6}>
            <Form.Item
              name={['address', 'state']}
              label={t('form.state')}
            >
              <Input placeholder={t('form.state')} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={6}>
            <Form.Item
              name={['address', 'zipCode']}
              label={t('form.zipCode')}
            >
              <Input placeholder={t('form.zipPlaceholder')} />
            </Form.Item>
          </Col>
        </Row>

        <Divider />

        <Row gutter={16}>
          <Col xs={24}>
            <Form.Item
              name="notes"
              label={t('forms:labels.notes')}
            >
              <Input.TextArea
                rows={3}
                placeholder={t('form.notesPlaceholder')}
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
                {t('patients:title')}
              </Space>
            </Divider>

            <List
              loading={loadingPatients}
              dataSource={householdPatients}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={t('form.noPatients', 'No patients in this household yet.')}
                  />
                ),
              }}
              renderItem={(p) => (
                <List.Item
                  actions={[
                    <Popconfirm
                      key="remove"
                      title={t('form.removePatientTitle')}
                      description={t('form.removePatientDesc')}
                      onConfirm={() => handleRemovePatient(p.id)}
                      okText={t('common:remove')}
                      cancelText={t('common:cancel')}
                      okButtonProps={{ danger: true }}
                    >
                      <Button type="link" danger icon={<DeleteOutlined />}>
                        {t('common:remove')}
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
                            {t('form.chip', { chip: p.microchipId })}
                          </Text>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />

            <Form.Item label={t('form.addExistingPatient', 'Add existing patient')} style={{ marginTop: 16 }}>
              <Select
                showSearch
                // Always render as "empty" — we clear immediately after
                // onChange via handleAddPatient → setSearchValue(''), and
                // binding `value` to a string search query trips the
                // type-checker (option values are numeric patient IDs).
                value={undefined}
                placeholder={t('form.searchPatientPlaceholder')}
                suffixIcon={<SearchOutlined />}
                filterOption={false}
                loading={searching}
                onSearch={onPatientSearchTyped}
                onChange={(patientId: number) => {
                  if (patientId) void handleAddPatient(patientId);
                }}
                notFoundContent={
                  searching
                    ? t('forms:messages.searching')
                    : searchValue.trim().length < 2
                      ? t('form.typeMore')
                      : t('form.noMatchingPatients')
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
                {t('form.pickHint')}
              </Text>
            </Form.Item>
          </>
        )}

        {mode === 'create' && (
          <>
            <Divider orientation="left">
              <Space>
                <UserOutlined />
                {t('patients:title')}
              </Space>
            </Divider>
            <Text type="secondary">
              {t('form.saveFirstHint', 'Save this household first, then re-open it to add or move patients into it. From the patient form you can also assign patients to this household by name.')}
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
              {mode === 'create' ? t('form.createHousehold') : t('common:saveChanges')}
            </Button>
            <Button
              type="default"
              onClick={onCancel}
              icon={<CloseOutlined />}
              disabled={loading}
              size="large"
            >
              {t('common:cancel')}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};