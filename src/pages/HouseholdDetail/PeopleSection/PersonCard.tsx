import React, { useState } from 'react';
import {
  Card,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Form,
  Row,
  Col,
  Popconfirm,
  App,
  Typography
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
  CloseOutlined,
  PlusOutlined,
  MinusCircleOutlined,
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
  StarOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PersonWithContacts, PersonContact } from '../../../types/household';
import { useUpdatePerson, useDeletePerson, useUpdatePersonContacts } from '../../../hooks/useHousehold';
import { useSetPrimaryPerson } from '../../../hooks/useHouseholdActions';
import { knownErrorMessage } from '@/utils/errors';
import styles from '../HouseholdDetail.module.css';

const { Text } = Typography;

interface PersonCardProps {
  person: PersonWithContacts;
  householdId: number;
  canDelete: boolean;
}


const getContactIcon = (type: string) => {
  return type === 'email' ? <MailOutlined /> : <PhoneOutlined />;
};

export const PersonCard: React.FC<PersonCardProps> = ({
  person,
  householdId,
  canDelete
}) => {
  const { notification } = App.useApp();
  const { t } = useTranslation('households');
  const [isEditing, setIsEditing] = useState(false);
  const [form] = Form.useForm();
  const updatePerson = useUpdatePerson();
  const deletePerson = useDeletePerson();
  const updateContacts = useUpdatePersonContacts();
  const setPrimary = useSetPrimaryPerson();

  const contactTypeOptions = [
    { label: t('detail.people.modal.contactTypes.phone'), value: 'phone', icon: <PhoneOutlined /> },
    { label: t('detail.people.modal.contactTypes.email'), value: 'email', icon: <MailOutlined /> },
    { label: t('detail.people.modal.contactTypes.mobile'), value: 'mobile', icon: <PhoneOutlined /> },
    { label: t('detail.people.modal.contactTypes.workPhone'), value: 'work_phone', icon: <PhoneOutlined /> }
  ];

  const getContactTypeLabel = (type: string) => {
    switch (type) {
      case 'phone': return t('detail.people.modal.contactTypes.phone');
      case 'email': return t('detail.people.modal.contactTypes.email');
      case 'mobile': return t('detail.people.modal.contactTypes.mobile');
      case 'work_phone': return t('detail.people.modal.contactTypes.workPhone');
      default: return type;
    }
  };

  const handleEdit = () => {
    form.setFieldsValue({
      firstName: person.firstName,
      lastName: person.lastName,
      contacts: person.contacts.map(c => ({
        contactType: c.contactType,
        contactValue: c.contactValue,
        isPrimary: c.isPrimary
      }))
    });
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    form.resetFields();
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      // Update person info
      await updatePerson.mutateAsync({
        personId: person.id,
        householdId,
        updates: {
          firstName: values.firstName,
          lastName: values.lastName
        }
      });

      // Update contacts
      if (values.contacts && values.contacts.length > 0) {
        await updateContacts.mutateAsync({
          personId: person.id,
          householdId,
          contacts: values.contacts
        });
      }

      setIsEditing(false);
      notification.success({ message: t('common:success'), description: t('detail.people.personUpdated'), placement: "bottomRight", duration: 3 });
    } catch (error) {
      notification.error({ message: t('common:error'), description: t('detail.householdInfo.failedToSave'), placement: "bottomRight", duration: 5 });
      console.error('Save failed:', error);
    }
  };

  const handleMakePrimary = async () => {
    try {
      await setPrimary.mutateAsync(person.id);
      notification.success({ message: t('detail.people.primaryChanged'), placement: 'bottomRight', duration: 3 });
    } catch (error) {
      notification.error({
        message: t('detail.people.primaryFailed'),
        description: knownErrorMessage(error, t) || undefined,
        placement: 'bottomRight',
        duration: 5,
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deletePerson.mutateAsync({
        personId: person.id,
        householdId
      });
      notification.success({ message: t('common:success'), description: t('detail.people.personRemoved'), placement: "bottomRight", duration: 3 });
    } catch (error) {
      notification.error({ message: t('common:error'), description: t('detail.people.failedToDelete'), placement: "bottomRight", duration: 5 });
      console.error('Delete failed:', error);
    }
  };

  const validateEmail = (_: any, value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (value && !emailRegex.test(value)) {
      return Promise.reject(t('detail.people.modal.validation.invalidEmail'));
    }
    return Promise.resolve();
  };

  const validatePhone = (_: any, value: string) => {
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    if (value && !phoneRegex.test(value)) {
      return Promise.reject(t('detail.people.modal.validation.invalidPhone'));
    }
    // Removed length validation - allow any number of digits
    return Promise.resolve();
  };

  if (isEditing) {
    return (
      <Card
        className={`person-card person-card-editing ${styles.personCardStyle}`}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            firstName: person.firstName,
            lastName: person.lastName,
            contacts: person.contacts
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="firstName"
                label={t('detail.people.modal.labels.firstName')}
                rules={[{ required: true, message: t('detail.people.modal.validation.firstNameRequired') }]}
              >
                <Input placeholder={t('detail.people.modal.placeholders.firstName')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="lastName"
                label={t('detail.people.modal.labels.lastName')}
                rules={[{ required: true, message: t('detail.people.modal.validation.lastNameRequired') }]}
              >
                <Input placeholder={t('detail.people.modal.placeholders.lastName')} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label={t('detail.people.modal.labels.contactMethods')}>
            <Form.List name="contacts">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Space key={key} className={styles.contactRow} align="baseline">
                      <Form.Item
                        {...restField}
                        name={[name, 'contactType']}
                        rules={[{ required: true, message: t('detail.people.modal.validation.selectType') }]}
                        className={styles.contactType}
                      >
                        <Select placeholder={t('detail.people.modal.placeholders.contactType')} options={contactTypeOptions} />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        name={[name, 'contactValue']}
                        dependencies={[['contacts', name, 'contactType']]}
                        rules={[
                          { required: true, message: t('detail.people.modal.validation.required') },
                          ({ getFieldValue }) => ({
                            validator(_, value) {
                              const type = getFieldValue(['contacts', name, 'contactType']);
                              if (type === 'email') {
                                return validateEmail(_, value);
                              } else if (type && type !== 'email') {
                                return validatePhone(_, value);
                              }
                              return Promise.resolve();
                            }
                          })
                        ]}
                        className={styles.contactValue}
                      >
                        <Input placeholder={t('detail.people.modal.placeholders.contactValue')} />
                      </Form.Item>
                      <MinusCircleOutlined onClick={() => remove(name)} />
                    </Space>
                  ))}
                  <Button
                    type="dashed"
                    onClick={() => add()}
                    block
                    icon={<PlusOutlined />}
                  >
                    {t('detail.people.modal.addContactMethod')}
                  </Button>
                </>
              )}
            </Form.List>
          </Form.Item>

          <Space>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={updatePerson.isPending || updateContacts.isPending}
            >
              {t('common:save')}
            </Button>
            <Button
              icon={<CloseOutlined />}
              onClick={handleCancel}
            >
              {t('detail.people.modal.cancel')}
            </Button>
          </Space>
        </Form>
      </Card>
    );
  }

  return (
    <Card
      className={`person-card ${styles.personCardStyle}`}
      title={
        <Space>
          <UserOutlined />
          <Text strong>{`${person.firstName} ${person.lastName}`}</Text>
          {person.isPrimary && <Tag color="blue">{t('entities:roles.primaryContact')}</Tag>}
        </Space>
      }
      extra={
        <Space>
          {!person.isPrimary && (
            <Button
              icon={<StarOutlined />}
              onClick={handleMakePrimary}
              loading={setPrimary.isPending}
              size="small"
            >
              {t('detail.people.makePrimary')}
            </Button>
          )}
          <Button
            icon={<EditOutlined />}
            onClick={handleEdit}
            size="small"
          >
            {t('common:actions.edit')}
          </Button>
          {canDelete && (
            <Popconfirm
              title={t('detail.people.confirmDeleteTitle')}
              description={t('detail.people.confirmDeleteDescription')}
              onConfirm={handleDelete}
              okText={t('detail.people.modal.labels.yes')}
              cancelText={t('detail.people.modal.labels.no')}
            >
              <Button
                icon={<DeleteOutlined />}
                danger
                size="small"
              >
                {t('common:actions.delete')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      }
    >
      {person.contacts.length > 0 ? (
        <Space direction="vertical" className={styles.fullWidthSpace}>
          {person.contacts.map(contact => (
            <Space key={contact.id}>
              {getContactIcon(contact.contactType)}
              <Text type="secondary">{getContactTypeLabel(contact.contactType)}:</Text>
              <Text copyable>{contact.contactValue}</Text>
              {contact.isPrimary && <Tag color="green" className={styles.marginLeft8}>{t('entities:roles.primaryContact')}</Tag>}
            </Space>
          ))}
        </Space>
      ) : (
        <Text type="secondary">{t('entities:defaults.noContactInfo')}</Text>
      )}
    </Card>
  );
};