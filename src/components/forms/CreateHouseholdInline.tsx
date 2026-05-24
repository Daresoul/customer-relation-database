import React from 'react';
import { Form, Input, Button, Space, App, Row, Col, Divider, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { invoke } from '@/services/invoke';
import { HouseholdService } from '../../services/householdService';
import type {
  CreateContactDto,
  CreateHouseholdWithPeopleDto,
} from '../../types/household';

const { Text } = Typography;

/**
 * Result of a successful household creation.
 *
 * Loosely typed because the underlying Tauri commands return either a
 * bare `Household` or a `HouseholdWithPeople` depending on which path
 * is taken (see comment in handleSubmit). Callers only need the id.
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
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  postalCode?: string;
}

/**
 * Reusable inline form that creates a household.
 *
 * Condensed version of HouseholdForm — supports the same fields users
 * typically want when registering a new family in one go (name +
 * primary contact + address), but skips the multi-contact / patient-
 * association / notes complexity that only makes sense in the full
 * standalone Household editor.
 *
 * Fields:
 *   Household Name (required)
 *   First Name | Last Name      ┐  primary contact (optional, but
 *   Phone      | Email          │   first+last are paired — providing
 *   Address                     ┘   one requires the other)
 *
 * Two backend paths depending on what was filled:
 *   - first+last name provided → create_household_with_people, which
 *     creates the household + primary person + their phone/email
 *     contacts in one transaction. Required by the DTO's validate()
 *     rule that every household must have at least one person.
 *   - only the household name → create_household (the simple command,
 *     no people). Address is set via update_household afterwards if
 *     provided, since the simple command doesn't accept address.
 *
 * Implementation note: uses raw `invoke` (and HouseholdService which
 * uses ApiService.invoke) — both are fine here because the args we
 * send have either single-word top-level keys or DTO-wrapped objects.
 * See PatientService for the broader case-transform trap.
 */
export const CreateHouseholdInline: React.FC<CreateHouseholdInlineProps> = ({
  onCreated,
  onCancel,
  submitLabel,
  autoFocus = true,
  disabled = false,
}) => {
  const { t } = useTranslation(['patients', 'forms', 'common']);
  const { notification } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (values: FormValues) => {
    const householdName = values.householdName.trim();
    const firstName = values.firstName?.trim();
    const lastName = values.lastName?.trim();
    const phone = values.phone?.trim();
    const email = values.email?.trim();
    const address = values.address?.trim();
    const city = values.city?.trim();
    const postalCode = values.postalCode?.trim();

    // first/last name are a pair — providing one requires the other.
    // We accept both empty (no primary contact) but reject lopsided
    // input rather than silently guessing the missing half from the
    // household name.
    const hasFirst = !!firstName;
    const hasLast = !!lastName;
    if (hasFirst !== hasLast) {
      notification.error({
        message: t('patients:detail.householdInfo.contactNameIncomplete', 'Primary contact needs both first and last name'),
        description: t(
          'patients:detail.householdInfo.contactNameIncompleteDesc',
          'Fill in both first and last name, or clear them both.',
        ),
        placement: 'bottomRight',
        duration: 5,
      });
      return;
    }

    // Phone/email without a name is also disallowed — the contact has
    // to belong to a person, and inventing a default person from the
    // household name was the old (confusing) behaviour.
    const hasContactInfo = !!(phone || email);
    if (hasContactInfo && (!hasFirst || !hasLast)) {
      notification.error({
        message: t('patients:detail.householdInfo.contactNameRequired', 'Primary contact name required'),
        description: t(
          'patients:detail.householdInfo.contactNameRequiredDesc',
          'Enter a first and last name for the primary contact, or clear the phone/email fields.',
        ),
        placement: 'bottomRight',
        duration: 5,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      let newHousehold: CreatedHousehold;

      if (hasFirst && hasLast) {
        // Rich path: household + primary person + their contacts in one transaction.
        const contacts: CreateContactDto[] = [];
        if (phone) {
          contacts.push({ contact_type: 'phone', contact_value: phone, is_primary: true });
        }
        if (email) {
          // Mark email primary only if there's no phone; otherwise phone
          // wins (matches the existing create_household behaviour).
          contacts.push({ contact_type: 'email', contact_value: email, is_primary: !phone });
        }

        const dto: CreateHouseholdWithPeopleDto = {
          household: {
            householdName,
            address: address || undefined,
            city: city || undefined,
            postalCode: postalCode || undefined,
          },
          people: [{
            person: {
              first_name: firstName!,
              last_name: lastName!,
              is_primary: true,
            },
            contacts,
          }],
        };

        const result = await HouseholdService.createHouseholdWithPeople(dto);
        newHousehold = result.household as unknown as CreatedHousehold;
      } else {
        // Simple path: just the household, no person. The simple
        // create_household command doesn't accept address fields, so
        // set them via update_household afterwards if the user
        // provided any.
        newHousehold = await invoke<CreatedHousehold>('create_household', {
          lastName: householdName,
          contacts: [],
        });

        const hasAddressInfo = !!(address || city || postalCode);
        if (hasAddressInfo && typeof newHousehold.id === 'number') {
          try {
            await HouseholdService.updateHousehold(newHousehold.id, {
              address: address || undefined,
              city: city || undefined,
              postalCode: postalCode || undefined,
            });
          } catch (err) {
            // The household exists; we'll surface the partial failure
            // but not fail the whole create — the parent can prompt
            // the user to edit the address.
            console.warn('Failed to set address on new household:', err);
          }
        }
      }

      await onCreated(newHousehold);
      form.resetFields();
    } catch (error) {
      notification.error({
        message: t('patients:detail.householdInfo.createFailed', 'Failed to create household'),
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
      <Row gutter={16}>
        <Col xs={24}>
          <Form.Item
            name="householdName"
            label={t('patients:detail.householdInfo.householdName', 'Household Name')}
            rules={[
              { required: true, message: t('patients:detail.householdInfo.householdNameRequired', 'Household name is required') },
              { max: 100, message: t('patients:detail.householdInfo.householdNameTooLong', 'Household name must be 100 characters or less') },
            ]}
          >
            <Input
              placeholder={t('forms:placeholders.enterName', 'Enter name')}
              autoFocus={autoFocus}
            />
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left" plain>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {t('patients:detail.householdInfo.primaryContactSection', 'Primary Contact (optional)')}
        </Text>
      </Divider>

      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item
            name="firstName"
            label={t('forms:labels.firstName', 'First Name')}
          >
            <Input placeholder={t('forms:placeholders.enterName', 'Enter name')} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            name="lastName"
            label={t('forms:labels.lastName', 'Last Name')}
          >
            <Input placeholder={t('forms:placeholders.enterName', 'Enter name')} />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item
            name="phone"
            label={t('forms:labels.phone', 'Phone Number')}
          >
            <Input placeholder={t('forms:placeholders.enterPhone', 'Enter phone number')} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item
            name="email"
            label={t('forms:labels.email', 'Email')}
            rules={[{ type: 'email', message: t('forms:validation.email', 'Please enter a valid email address') }]}
          >
            <Input placeholder={t('forms:placeholders.enterEmail', 'Enter email address')} />
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left" plain>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {t('patients:detail.householdInfo.addressSection', 'Address (optional)')}
        </Text>
      </Divider>

      <Row gutter={16}>
        <Col xs={24}>
          <Form.Item
            name="address"
            label={t('patients:detail.householdInfo.address', 'Street Address')}
          >
            <Input placeholder={t('patients:detail.householdInfo.streetPlaceholder', 'Street and number')} />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} sm={14}>
          <Form.Item
            name="city"
            label={t('patients:detail.householdInfo.city', 'City')}
          >
            <Input placeholder={t('patients:detail.householdInfo.cityPlaceholder', 'City')} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={10}>
          <Form.Item
            name="postalCode"
            label={t('patients:detail.householdInfo.postalCode', 'Postal Code')}
            rules={[{ max: 20, message: t('patients:detail.householdInfo.postalCodeTooLong', 'Postal code too long') }]}
          >
            <Input placeholder={t('patients:detail.householdInfo.postalCodePlaceholder', 'e.g., 1000')} />
          </Form.Item>
        </Col>
      </Row>

      <Space>
        <Button type="primary" htmlType="submit" loading={isSubmitting}>
          {submitLabel ?? t('patients:detail.householdInfo.create', 'Create')}
        </Button>
        <Button onClick={onCancel} disabled={isSubmitting}>
          {t('common:cancel')}
        </Button>
      </Space>
    </Form>
  );
};

export default CreateHouseholdInline;
