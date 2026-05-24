import React from 'react';
import { Form, Input, Button, Space, App } from 'antd';
import { useTranslation } from 'react-i18next';
import { invoke } from '@/services/invoke';

/**
 * Result of a successful household creation.
 *
 * Loosely typed because the create_household command's response shape
 * isn't strongly modeled on the frontend and callers typically only
 * need the id.
 */
export interface CreatedHousehold {
  id: number;
  householdName?: string;
  [key: string]: unknown;
}

export interface CreateHouseholdInlineProps {
  /** Called with the newly created household after submission succeeds. */
  onCreated: (household: CreatedHousehold) => void | Promise<void>;
  /** Cancel and exit without creating. */
  onCancel: () => void;
  /** Submit button label. Defaults to "Create" (i18n: patients:detail.householdInfo.create). */
  submitLabel?: string;
  /** Autofocus the first field on mount. Defaults to true. */
  autoFocus?: boolean;
  /** External disable signal — usually for parent-controlled loading states. */
  disabled?: boolean;
}

interface FormValues {
  householdName: string;
  contactName?: string;
  phone?: string;
  email?: string;
}

/**
 * Reusable inline form that creates a household via the `create_household`
 * Tauri command.
 *
 * UX is intentionally minimal:
 *   - one required field (Household name)
 *   - three optional contact fields (name, phone, email)
 *   - Cancel returns control without side effects
 *
 * Use this anywhere you need "create a household right now, then do
 * something with the id" — e.g. the patient detail HouseholdSection
 * empty state. For "create as part of a larger form submission" flows
 * (PatientFormWithOwner, CreatePatientSection), keep the household
 * fields embedded in the parent form and call `create_household`
 * during the parent's submit handler — that flow is intentionally
 * different and not unified here.
 *
 * Implementation note: uses raw `invoke` (not ApiService.invoke) for
 * the same reason as PatientService — Tauri 1.x expects camelCase keys
 * (lastName, contacts) on the wire and ApiService transforms outgoing
 * args camelCase → snake_case, which would break this command.
 */
export const CreateHouseholdInline: React.FC<CreateHouseholdInlineProps> = ({
  onCreated,
  onCancel,
  submitLabel,
  autoFocus = true,
  disabled = false,
}) => {
  const { t } = useTranslation('patients');
  const { notification } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const householdName = values.householdName.trim();
      const hasContact = !!(values.contactName?.trim() || values.phone?.trim() || values.email?.trim());

      const newHousehold = await invoke<CreatedHousehold>('create_household', {
        lastName: householdName,
        // Only attach a primary contact if the user actually filled at
        // least one contact field; otherwise create_household creates
        // a household with no people, which is valid.
        contacts: hasContact
          ? [{
              name: values.contactName?.trim() || householdName,
              isPrimary: true,
              email: values.email?.trim() || null,
              phone: values.phone?.trim() || null,
            }]
          : [],
      });

      await onCreated(newHousehold);
      form.resetFields();
    } catch (error) {
      notification.error({
        message: t('detail.householdInfo.createFailed', 'Failed to create household'),
        description: String(error),
        placement: 'bottomRight',
        duration: 5,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const busy = isSubmitting || disabled;

  return (
    <Form<FormValues>
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      disabled={busy}
    >
      <Form.Item
        name="householdName"
        label={t('detail.householdInfo.householdName')}
        rules={[
          { required: true, message: t('detail.householdInfo.householdNameRequired', 'Household name is required') },
          { max: 100, message: t('detail.householdInfo.householdNameTooLong', 'Household name must be 100 characters or less') },
        ]}
      >
        <Input
          placeholder={t('detail.householdInfo.householdNamePlaceholder', 'e.g., The Petrov Family')}
          autoFocus={autoFocus}
        />
      </Form.Item>

      <Form.Item
        name="contactName"
        label={t('detail.householdInfo.primaryContactName', 'Primary contact (optional)')}
      >
        <Input placeholder={t('detail.householdInfo.contactNamePlaceholder', 'e.g., John Petrov')} />
      </Form.Item>

      <Form.Item
        name="phone"
        label={t('detail.householdInfo.contactPhone', 'Phone (optional)')}
      >
        <Input placeholder="+389 70 123 456" />
      </Form.Item>

      <Form.Item
        name="email"
        label={t('detail.householdInfo.contactEmail', 'Email (optional)')}
        rules={[{ type: 'email', message: t('forms:validation.email', 'Invalid email') }]}
      >
        <Input placeholder="contact@example.com" />
      </Form.Item>

      <Space>
        <Button type="primary" htmlType="submit" loading={isSubmitting}>
          {submitLabel ?? t('detail.householdInfo.create', 'Create')}
        </Button>
        <Button onClick={onCancel} disabled={isSubmitting}>
          {t('common:cancel')}
        </Button>
      </Space>
    </Form>
  );
};

export default CreateHouseholdInline;
