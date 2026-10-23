import React from 'react';
import { Tag, Tooltip } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { PatientAlert } from '../../types';
import { alertColor } from '../../utils/patientChart';

interface AlertChipsProps {
  alerts?: PatientAlert[] | null;
  /** Lists and pickers: short label only, the note in a tooltip. */
  compact?: boolean;
}

/** Red for allergy and aggressive, orange for chronic, blue for other. */
export const AlertChips: React.FC<AlertChipsProps> = ({ alerts, compact = false }) => {
  const { t } = useTranslation('patients');
  if (!alerts || alerts.length === 0) return null;
  return (
    <>
      {alerts.map((alert) => {
        const label = t(`patients:chart.alerts.short.${alert.alertType}`);
        const tag = (
          <Tag
            key={alert.id}
            color={alertColor(alert.alertType)}
            icon={compact ? undefined : <WarningOutlined />}
            style={compact ? { marginInlineEnd: 4, fontSize: 11, lineHeight: '16px' } : undefined}
          >
            {compact || !alert.note ? label : `${label}: ${alert.note}`}
          </Tag>
        );
        return compact && alert.note ? (
          <Tooltip key={alert.id} title={alert.note}>
            {tag}
          </Tooltip>
        ) : (
          tag
        );
      })}
    </>
  );
};

export default AlertChips;
