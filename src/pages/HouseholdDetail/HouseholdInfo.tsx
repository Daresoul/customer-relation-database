import React from 'react';
import { formatDate, formatDateTime } from '../../utils/dateFormatter';
import { Descriptions, Typography, Spin, App } from 'antd';
import { useTranslation } from 'react-i18next';
import { Household } from '../../types/household';
import { useUpdateHousehold } from '../../hooks/useHousehold';
import { useInlineEdit } from '../../hooks/useAutoSave';
import styles from './HouseholdDetail.module.css';

const { Text } = Typography;

interface HouseholdInfoProps {
  household: Household;
}

export const HouseholdInfo: React.FC<HouseholdInfoProps> = ({ household }) => {
  const { notification } = App.useApp();
  const { t } = useTranslation('households');
  const updateHousehold = useUpdateHousehold();

  const handleFieldUpdate = async (field: keyof Household, value: string | null) => {
    try {
      await updateHousehold.mutateAsync({
        householdId: household.id,
        updates: { [field]: value || null }
      });
      notification.success({ message: "Success", description: t('detail.householdInfo.saved'), placement: "bottomRight", duration: 3 });
    } catch (error) {
      notification.error({ message: "Error", description: t('detail.householdInfo.failedToSave'), placement: "bottomRight", duration: 5 });
      console.error('Update failed:', error);
    }
  };

  const nameEdit = useInlineEdit({
    value: household.householdName || '',
    onSave: (value) => handleFieldUpdate('householdName', value),
    validate: (value) => value.length <= 100 || t('detail.householdInfo.validation.nameTooLong')
  });

  const addressEdit = useInlineEdit({
    value: household.address || '',
    onSave: (value) => handleFieldUpdate('address', value)
  });

  const cityEdit = useInlineEdit({
    value: household.city || '',
    onSave: (value) => handleFieldUpdate('city', value)
  });

  const postalCodeEdit = useInlineEdit({
    value: household.postalCode || '',
    onSave: (value) => handleFieldUpdate('postalCode', value),
    validate: (value) => {
      if (!value) return true;
      // Basic postal code validation (US/Canada)
      const pattern = /^[A-Za-z0-9\s-]{3,10}$/;
      return pattern.test(value) || t('detail.householdInfo.validation.invalidPostalCode');
    }
  });

  return (
    <Descriptions
      title={t('detail.householdInfo.title')}
      bordered
      column={{ xs: 1, sm: 2, md: 3 }}
      size="middle"
      extra={updateHousehold.isPending && <Spin size="small" />}
    >
      <Descriptions.Item label={t('detail.householdInfo.labels.householdName')} span={{ xs: 1, sm: 2, md: 3 }}>
        <Text
          editable={{
            onChange: (value) => {
              const result = nameEdit.onChange(value);
              if (!result.success && result.error) {
                notification.error({ message: "Error", description: result.error, placement: "bottomRight", duration: 5 });
              }
            },
            triggerType: ['text'],
          }}
          className={styles.fullWidth}
        >
          {household.householdName || t('detail.householdInfo.placeholders.name')}
        </Text>
      </Descriptions.Item>

      <Descriptions.Item label={t('detail.householdInfo.labels.address')} span={{ xs: 1, sm: 2, md: 3 }}>
        <Text
          editable={{
            onChange: (value) => addressEdit.onChange(value),
            triggerType: ['text'],
          }}
          className={styles.fullWidth}
        >
          {household.address || t('detail.householdInfo.placeholders.address')}
        </Text>
      </Descriptions.Item>

      <Descriptions.Item label={t('detail.householdInfo.labels.city')} span={1}>
        <Text
          editable={{
            onChange: (value) => cityEdit.onChange(value),
            triggerType: ['text'],
          }}
        >
          {household.city || t('detail.householdInfo.placeholders.city')}
        </Text>
      </Descriptions.Item>

      <Descriptions.Item label={t('detail.householdInfo.labels.postalCode')} span={1}>
        <Text
          editable={{
            onChange: (value) => {
              const result = postalCodeEdit.onChange(value);
              if (!result.success && result.error) {
                notification.error({ message: "Error", description: result.error, placement: "bottomRight", duration: 5 });
              }
            },
            triggerType: ['text'],
          }}
        >
          {household.postalCode || t('detail.householdInfo.placeholders.postalCode')}
        </Text>
      </Descriptions.Item>

      <Descriptions.Item label={t('detail.householdInfo.labels.created')} span={1}>
        {formatDate(household.createdAt)}
      </Descriptions.Item>

      <Descriptions.Item label={t('detail.householdInfo.labels.lastUpdated')} span={{ xs: 1, sm: 2, md: 3 }}>
        {formatDateTime(household.updatedAt)}
      </Descriptions.Item>
    </Descriptions>
  );
};