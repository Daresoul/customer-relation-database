import React from 'react';
import { Space, Tag, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { LabValue } from '@/types/labInbox';

/** Analytes as compact chips: code, value, unit and an H/L mark outside the range. */
const LabValues: React.FC<{ values: LabValue[] }> = ({ values }) => {
  const { t } = useTranslation('devices');
  if (values.length === 0) return <Typography.Text type="secondary">—</Typography.Text>;
  return (
    <Space size={[4, 4]} wrap>
      {values.map((v) => (
        <Tag
          key={v.code}
          data-testid={`lab-value-${v.code}`}
          color={v.implausible ? 'volcano' : v.flag === 'H' ? 'red' : v.flag === 'L' ? 'blue' : undefined}
          title={[v.range, v.implausible ? t('devices:inbox.implausible') : null].filter(Boolean).join(' · ') || undefined}
          style={{ marginInlineEnd: 0 }}
        >
          <strong>{v.code}</strong> {v.value}
          {v.unit ? ` ${v.unit}` : ''}
          {v.flag ? <strong>{` ${v.flag}`}</strong> : null}
          {v.implausible ? <strong>{' !'}</strong> : null}
        </Tag>
      ))}
    </Space>
  );
};

export default LabValues;
