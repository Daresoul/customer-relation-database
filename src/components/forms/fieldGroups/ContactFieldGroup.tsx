/**
 * ContactFieldGroup - Reusable contact/person form fields
 *
 * Extracts common contact fields for household/person forms.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Form,
  Input,
  Select,
  Row,
  Col,
  Checkbox,
} from 'antd';
import type { FormInstance } from 'antd';
import {
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
} from '@ant-design/icons';
import styles from '../Forms.module.css';

const { Option } = Select;

export type ContactType = 'phone' | 'email' | 'mobile' | 'work_phone';

export interface ContactFieldGroupProps {
  form: FormInstance;
  /** Field name prefix for nested form items (e.g., ['contacts', 0]) */
  namePrefix?: (string | number)[];
  disabled?: boolean;
  /** Show first name / last name fields */
  showPersonFields?: boolean;
  /** Show relationship/role field */
  showRelationship?: boolean;
  /** Show primary contact checkbox */
  showPrimaryCheckbox?: boolean;
  /** Custom class name for full-width elements */
  fullWidthClassName?: string;
  /** Whether this is in a compact/inline mode */
  compact?: boolean;
}

export const ContactFieldGroup: React.FC<ContactFieldGroupProps> = ({
  form,
  namePrefix = [],
  disabled = false,
  showPersonFields = true,
  showRelationship = false,
  showPrimaryCheckbox = true,
  fullWidthClassName = styles.fullWidth,
  compact = false,
}) => {
  const { t } = useTranslation(['forms', 'entities']);

  // Helper to build field name with prefix
  const fieldName = (name: string) => [...namePrefix, name];

  const colSpan = compact ? { xs: 24, sm: 12 } : { xs: 24, sm: 8 };
  const largeColSpan = compact ? { xs: 24 } : { xs: 24, sm: 12 };

  return (
    <>
      {/* Person Name Fields */}
      {showPersonFields && (
        <Row gutter={16}>
          <Col {...largeColSpan}>
            <Form.Item
              name={fieldName('firstName')}
              label={t('forms:labels.firstName', 'First Name')}
              rules={[
                { required: true, message: t('forms:validation.required', 'First name is required') },
                { max: 50, message: t('forms:validation.maxLength', { max: 50 }) },
              ]}
            >
              <Input
                placeholder={t('forms:placeholders.firstName', 'Enter first name')}
                prefix={<UserOutlined />}
                disabled={disabled}
              />
            </Form.Item>
          </Col>

          <Col {...largeColSpan}>
            <Form.Item
              name={fieldName('lastName')}
              label={t('forms:labels.lastName', 'Last Name')}
              rules={[
                { required: true, message: t('forms:validation.required', 'Last name is required') },
                { max: 50, message: t('forms:validation.maxLength', { max: 50 }) },
              ]}
            >
              <Input
                placeholder={t('forms:placeholders.lastName', 'Enter last name')}
                disabled={disabled}
              />
            </Form.Item>
          </Col>
        </Row>
      )}

      {/* Contact Information */}
      <Row gutter={16}>
        <Col {...largeColSpan}>
          <Form.Item
            name={fieldName('phone')}
            label={t('forms:labels.phone', 'Phone')}
            rules={[
              {
                pattern: /^[\d\s\-+()]+$/,
                message: t('forms:validation.invalidPhone', 'Please enter a valid phone number'),
              },
            ]}
          >
            <Input
              placeholder={t('forms:placeholders.phone', 'Enter phone number')}
              prefix={<PhoneOutlined />}
              disabled={disabled}
            />
          </Form.Item>
        </Col>

        <Col {...largeColSpan}>
          <Form.Item
            name={fieldName('email')}
            label={t('forms:labels.email', 'Email')}
            rules={[
              { type: 'email', message: t('forms:validation.invalidEmail', 'Please enter a valid email') },
            ]}
          >
            <Input
              placeholder={t('forms:placeholders.email', 'Enter email address')}
              prefix={<MailOutlined />}
              type="email"
              disabled={disabled}
            />
          </Form.Item>
        </Col>
      </Row>

      {/* Relationship and Primary Contact */}
      {(showRelationship || showPrimaryCheckbox) && (
        <Row gutter={16}>
          {showRelationship && (
            <Col {...largeColSpan}>
              <Form.Item
                name={fieldName('relationship')}
                label={t('forms:labels.relationship', 'Relationship')}
              >
                <Select
                  placeholder={t('forms:placeholders.selectRelationship', 'Select relationship')}
                  allowClear
                  disabled={disabled}
                >
                  <Option value="owner">{t('entities:relationship.owner', 'Owner')}</Option>
                  <Option value="family">{t('entities:relationship.family', 'Family Member')}</Option>
                  <Option value="caretaker">{t('entities:relationship.caretaker', 'Caretaker')}</Option>
                  <Option value="emergency">{t('entities:relationship.emergency', 'Emergency Contact')}</Option>
                  <Option value="other">{t('entities:relationship.other', 'Other')}</Option>
                </Select>
              </Form.Item>
            </Col>
          )}

          {showPrimaryCheckbox && (
            <Col {...(showRelationship ? largeColSpan : { xs: 24 })}>
              <Form.Item
                name={fieldName('isPrimary')}
                valuePropName="checked"
                initialValue={false}
              >
                <Checkbox disabled={disabled}>
                  {t('forms:labels.primaryContact', 'Primary Contact')}
                </Checkbox>
              </Form.Item>
            </Col>
          )}
        </Row>
      )}
    </>
  );
};

export default ContactFieldGroup;
