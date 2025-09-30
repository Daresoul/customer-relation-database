/**
 * T018: Household form component with Ant Design
 */

import React, { useEffect, useState } from 'react';
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
} from '@ant-design/icons';
import type { HouseholdFormValues, ContactFormValues } from '../../types/ui.types';
import styles from './Forms.module.css';

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

  useEffect(() => {
    if (initialValues) {
      form.setFieldsValue(initialValues);
    }
  }, [initialValues, form]);

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

        <Form.Item>
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