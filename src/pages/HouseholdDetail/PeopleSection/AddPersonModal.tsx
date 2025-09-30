import React from 'react';
import { Modal, Form, Input, Select, Button, Space, Radio } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { CreatePersonWithContactsDto } from '../../../types/household';
import styles from './AddPersonModal.module.css';

interface AddPersonModalProps {
  visible: boolean;
  onCancel: () => void;
  onAdd: (person: CreatePersonWithContactsDto) => Promise<void>;
  loading?: boolean;
}


export const AddPersonModal: React.FC<AddPersonModalProps> = ({
  visible,
  onCancel,
  onAdd,
  loading
}) => {
  const [form] = Form.useForm();
  const { t } = useTranslation('households');

  const contactTypeOptions = [
    { label: t('detail.people.modal.contactTypes.phone'), value: 'phone' },
    { label: t('detail.people.modal.contactTypes.email'), value: 'email' },
    { label: t('detail.people.modal.contactTypes.mobile'), value: 'mobile' },
    { label: t('detail.people.modal.contactTypes.workPhone'), value: 'work_phone' }
  ];

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const personData: CreatePersonWithContactsDto = {
        person: {
          first_name: values.firstName,
          last_name: values.lastName,
          is_primary: values.isPrimary || false
        },
        contacts: (values.contacts || []).map((contact: any) => ({
          contact_type: contact.contactType,
          contact_value: contact.contactValue,
          is_primary: contact.isPrimary || false
        }))
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

  return (
    <Modal
      title={t('detail.people.modal.title')}
      open={visible}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          {t('detail.people.modal.cancel')}
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={handleSubmit}
        >
          {t('detail.people.modal.submit')}
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
          label={t('detail.people.modal.labels.firstName')}
          rules={[{ required: true, message: t('detail.people.modal.validation.firstNameRequired') }]}
        >
          <Input placeholder={t('detail.people.modal.placeholders.firstName')} autoFocus />
        </Form.Item>

        <Form.Item
          name="lastName"
          label={t('detail.people.modal.labels.lastName')}
          rules={[{ required: true, message: t('detail.people.modal.validation.lastNameRequired') }]}
        >
          <Input placeholder={t('detail.people.modal.placeholders.lastName')} />
        </Form.Item>

        <Form.Item
          name="isPrimary"
          label={t('detail.people.modal.labels.primaryContact')}
        >
          <Radio.Group>
            <Radio value={true}>{t('detail.people.modal.labels.yes')}</Radio>
            <Radio value={false}>{t('detail.people.modal.labels.no')}</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item label={t('detail.people.modal.labels.contactMethods')}>
          <Form.List name="contacts">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} className={styles.phoneRow} align="baseline">
                    <Form.Item
                      {...restField}
                      name={[name, 'contactType']}
                      rules={[{ required: true, message: t('detail.people.modal.validation.selectType') }]}
                      className={styles.phoneTypeInput}
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
                      className={styles.phoneNumberInput}
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
      </Form>
    </Modal>
  );
};