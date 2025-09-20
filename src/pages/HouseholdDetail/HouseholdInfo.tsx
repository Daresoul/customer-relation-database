import React from 'react';
import { Descriptions, Typography, Spin, App } from 'antd';
import { Household } from '../../types/household';
import { useUpdateHousehold } from '../../hooks/useHousehold';
import { useInlineEdit } from '../../hooks/useAutoSave';

const { Text } = Typography;

interface HouseholdInfoProps {
  household: Household;
}

export const HouseholdInfo: React.FC<HouseholdInfoProps> = ({ household }) => {
  const { message } = App.useApp();
  const updateHousehold = useUpdateHousehold();

  const handleFieldUpdate = async (field: keyof Household, value: string | null) => {
    try {
      await updateHousehold.mutateAsync({
        householdId: household.id,
        updates: { [field]: value || null }
      });
      message.success('Saved');
    } catch (error) {
      message.error('Failed to save changes');
      console.error('Update failed:', error);
    }
  };

  const nameEdit = useInlineEdit({
    value: household.householdName || '',
    onSave: (value) => handleFieldUpdate('householdName', value),
    validate: (value) => value.length <= 100 || 'Name must be 100 characters or less'
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
      return pattern.test(value) || 'Invalid postal code format';
    }
  });

  return (
    <Descriptions
      title="Household Information"
      bordered
      column={{ xs: 1, sm: 2, md: 3 }}
      size="middle"
      extra={updateHousehold.isPending && <Spin size="small" />}
    >
      <Descriptions.Item label="Household Name" span={3}>
        <Text
          editable={{
            onChange: (value) => {
              const result = nameEdit.onChange(value);
              if (!result.success && result.error) {
                message.error(result.error);
              }
            },
            triggerType: ['text'],
          }}
          style={{ width: '100%' }}
        >
          {household.householdName || 'Click to add name'}
        </Text>
      </Descriptions.Item>

      <Descriptions.Item label="Address" span={3}>
        <Text
          editable={{
            onChange: (value) => addressEdit.onChange(value),
            triggerType: ['text'],
          }}
          style={{ width: '100%' }}
        >
          {household.address || 'Click to add address'}
        </Text>
      </Descriptions.Item>

      <Descriptions.Item label="City" span={1}>
        <Text
          editable={{
            onChange: (value) => cityEdit.onChange(value),
            triggerType: ['text'],
          }}
        >
          {household.city || 'Click to add city'}
        </Text>
      </Descriptions.Item>

      <Descriptions.Item label="Postal Code" span={1}>
        <Text
          editable={{
            onChange: (value) => {
              const result = postalCodeEdit.onChange(value);
              if (!result.success && result.error) {
                message.error(result.error);
              }
            },
            triggerType: ['text'],
          }}
        >
          {household.postalCode || 'Click to add'}
        </Text>
      </Descriptions.Item>

      <Descriptions.Item label="Created" span={1}>
        {new Date(household.createdAt).toLocaleDateString()}
      </Descriptions.Item>

      <Descriptions.Item label="Last Updated" span={3}>
        {new Date(household.updatedAt).toLocaleString()}
      </Descriptions.Item>
    </Descriptions>
  );
};