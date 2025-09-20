import React from 'react';
import { Modal, Form, Input, Select, Button, Space, Radio } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { CreatePersonWithContactsDto } from '../../../types/household';

interface AddPersonModalProps {
  visible: boolean;
  onCancel: () => void;
  onAdd: (person: CreatePersonWithContactsDto) => Promise<void>;
  loading?: boolean;
}

const contactTypeOptions = [
  { label: 'Phone', value: 'phone' },
  { label: 'Email', value: 'email' },
  { label: 'Mobile', value: 'mobile' },
  { label: 'Work Phone', value: 'work_phone' }
];

export const AddPersonModal: React.FC<AddPersonModalProps> = ({
  visible,
  onCancel,
  onAdd,
  loading
}) => {
  const [form] = Form.useForm();

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const personData: CreatePersonWithContactsDto = {
        person: {
          firstName: values.firstName,
          lastName: values.lastName,
          isPrimary: values.isPrimary || false
        },
        contacts: values.contacts || []
      };

      await onAdd(personData);
      form.resetFields();
    } catch (error) {
      console.error('Validation failed:', error);
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

  return (
    <Modal
      title="Add New Person"
      open={visible}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={handleSubmit}
        >
          Add Person
        </Button>
      ]}
      // Modal content will reset on close
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          isPrimary: false,
          contacts: []
        }}
      >
        <Form.Item
          name="firstName"
          label="First Name"
          rules={[{ required: true, message: 'First name is required' }]}
        >
          <Input placeholder="Enter first name" autoFocus />
        </Form.Item>

        <Form.Item
          name="lastName"
          label="Last Name"
          rules={[{ required: true, message: 'Last name is required' }]}
        >
          <Input placeholder="Enter last name" />
        </Form.Item>

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
      </Form>
    </Modal>
  );
};