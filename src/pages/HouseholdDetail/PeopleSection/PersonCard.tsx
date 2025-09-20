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
  Radio,
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
  MailOutlined
} from '@ant-design/icons';
import { PersonWithContacts, PersonContact } from '../../../types/household';
import { useUpdatePerson, useDeletePerson, useUpdatePersonContacts } from '../../../hooks/useHousehold';

const { Text } = Typography;

interface PersonCardProps {
  person: PersonWithContacts;
  householdId: number;
  canDelete: boolean;
  onPrimaryChange?: (personId: number) => void;
}

const contactTypeOptions = [
  { label: 'Phone', value: 'phone', icon: <PhoneOutlined /> },
  { label: 'Email', value: 'email', icon: <MailOutlined /> },
  { label: 'Mobile', value: 'mobile', icon: <PhoneOutlined /> },
  { label: 'Work Phone', value: 'work_phone', icon: <PhoneOutlined /> }
];

const getContactIcon = (type: string) => {
  return type === 'email' ? <MailOutlined /> : <PhoneOutlined />;
};

export const PersonCard: React.FC<PersonCardProps> = ({
  person,
  householdId,
  canDelete,
  onPrimaryChange
}) => {
  const { message } = App.useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [form] = Form.useForm();
  const updatePerson = useUpdatePerson();
  const deletePerson = useDeletePerson();
  const updateContacts = useUpdatePersonContacts();

  const handleEdit = () => {
    form.setFieldsValue({
      firstName: person.firstName,
      lastName: person.lastName,
      isPrimary: person.isPrimary,
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
          lastName: values.lastName,
          isPrimary: values.isPrimary
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
      message.success('Person updated successfully');

      if (values.isPrimary && !person.isPrimary) {
        onPrimaryChange?.(person.id);
      }
    } catch (error) {
      message.error('Failed to save changes');
      console.error('Save failed:', error);
    }
  };

  const handleDelete = async () => {
    try {
      await deletePerson.mutateAsync({
        personId: person.id,
        householdId
      });
      message.success('Person removed from household');
    } catch (error) {
      message.error('Failed to delete person');
      console.error('Delete failed:', error);
    }
  };

  const validateEmail = (_: any, value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (value && !emailRegex.test(value)) {
      return Promise.reject('Please enter a valid email address');
    }
    return Promise.resolve();
  };

  const validatePhone = (_: any, value: string) => {
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    if (value && !phoneRegex.test(value)) {
      return Promise.reject('Please enter a valid phone number');
    }
    // Removed length validation - allow any number of digits
    return Promise.resolve();
  };

  if (isEditing) {
    return (
      <Card
        className="person-card person-card-editing"
        style={{ marginBottom: 16, background: '#262626', borderColor: '#303030' }}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            firstName: person.firstName,
            lastName: person.lastName,
            isPrimary: person.isPrimary,
            contacts: person.contacts
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="firstName"
                label="First Name"
                rules={[{ required: true, message: 'First name is required' }]}
              >
                <Input placeholder="First Name" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="lastName"
                label="Last Name"
                rules={[{ required: true, message: 'Last name is required' }]}
              >
                <Input placeholder="Last Name" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="isPrimary"
            label="Primary Contact"
          >
            <Radio.Group>
              <Radio value={true}>Yes</Radio>
              <Radio value={false}>No</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item label="Contact Methods">
            <Form.List name="contacts">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                      <Form.Item
                        {...restField}
                        name={[name, 'contactType']}
                        rules={[{ required: true, message: 'Select type' }]}
                        style={{ marginBottom: 0, width: 150 }}
                      >
                        <Select placeholder="Type" options={contactTypeOptions} />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        name={[name, 'contactValue']}
                        dependencies={[['contacts', name, 'contactType']]}
                        rules={[
                          { required: true, message: 'Required' },
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
                        style={{ marginBottom: 0, flex: 1 }}
                      >
                        <Input placeholder="Contact value" />
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
                    Add Contact Method
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
              Save
            </Button>
            <Button
              icon={<CloseOutlined />}
              onClick={handleCancel}
            >
              Cancel
            </Button>
          </Space>
        </Form>
      </Card>
    );
  }

  return (
    <Card
      className="person-card"
      style={{ marginBottom: 16, background: '#262626', borderColor: '#303030' }}
      title={
        <Space>
          <UserOutlined />
          <Text strong>{`${person.firstName} ${person.lastName}`}</Text>
          {person.isPrimary && <Tag color="blue">Primary</Tag>}
        </Space>
      }
      extra={
        <Space>
          <Button
            icon={<EditOutlined />}
            onClick={handleEdit}
            size="small"
          >
            Edit
          </Button>
          {canDelete && (
            <Popconfirm
              title="Delete this person?"
              description="This will remove the person and all their contact information."
              onConfirm={handleDelete}
              okText="Yes"
              cancelText="No"
            >
              <Button
                icon={<DeleteOutlined />}
                danger
                size="small"
              >
                Delete
              </Button>
            </Popconfirm>
          )}
        </Space>
      }
    >
      {person.contacts.length > 0 ? (
        <Space direction="vertical" style={{ width: '100%' }}>
          {person.contacts.map(contact => (
            <Space key={contact.id}>
              {getContactIcon(contact.contactType)}
              <Text type="secondary">{contact.contactType}:</Text>
              <Text copyable>{contact.contactValue}</Text>
              {contact.isPrimary && <Tag color="green" style={{ marginLeft: 8 }}>Primary</Tag>}
            </Space>
          ))}
        </Space>
      ) : (
        <Text type="secondary">No contact information</Text>
      )}
    </Card>
  );
};