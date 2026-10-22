import React from 'react';
import { useTranslation } from 'react-i18next';
import type { HealthText } from './deviceHealth';

/** Tooltip lines: what's going on, what to do, the last result, and the raw error under Details. */
export const HealthLines: React.FC<{ health: HealthText; lastResult: string | null }> = ({ health, lastResult }) => {
  const { t } = useTranslation('devices');
  return (
    <>
      <div>{t('tooltips.status', { status: health.text })}</div>
      {health.action && <div>→ {health.action}</div>}
      {lastResult && <div>{lastResult}</div>}
      {health.details && (
        <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>
          {t('health.details')}: {health.details}
        </div>
      )}
    </>
  );
};
