import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Space, Tag, Typography } from 'antd';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HouseholdService,
  type DuplicateCheckInput,
  type HouseholdDuplicate,
} from '../../services/householdService';

const { Text } = Typography;

export interface DuplicateHouseholdWarningProps {
  /** What the user has typed so far. */
  check: DuplicateCheckInput;
  /** Shows "Use this household" on each match when given. */
  onUseExisting?: (match: HouseholdDuplicate) => void;
  /** Number of matches on show, so the form can relabel its submit button. */
  onMatchesChange?: (count: number) => void;
  debounceMs?: number;
}

function worthChecking(check: DuplicateCheckInput): boolean {
  const filled = (v?: string) => (v ?? '').trim().length >= 2;
  return (
    filled(check.householdName) ||
    (filled(check.firstName) && filled(check.lastName)) ||
    (check.phones ?? []).some((p) => p.replace(/\D/g, '').length >= 6) ||
    (check.emails ?? []).some((e) => e.includes('@'))
  );
}

const OpenButton: React.FC<{ householdId: number }> = ({ householdId }) => {
  const { t } = useTranslation('households');
  const navigate = useNavigate();
  return (
    <Button size="small" onClick={() => navigate(`/households/${householdId}`)}>
      {t('duplicates.open')}
    </Button>
  );
};

/**
 * Soft warning while a household is being created: households with the same
 * phone, email or person name. It never blocks the create; the form's own
 * submit button is the "Create anyway". A failed check shows nothing.
 */
export const DuplicateHouseholdWarning: React.FC<DuplicateHouseholdWarningProps> = ({
  check,
  onUseExisting,
  onMatchesChange,
  debounceMs = 400,
}) => {
  const { t } = useTranslation('households');
  const inRouter = useInRouterContext();
  const [matches, setMatches] = useState<HouseholdDuplicate[]>([]);
  const reportCount = useRef(onMatchesChange);
  reportCount.current = onMatchesChange;
  const checkKey = JSON.stringify(check);

  useEffect(() => {
    const current: DuplicateCheckInput = JSON.parse(checkKey);
    if (!worthChecking(current)) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      HouseholdService.findDuplicates(current)
        .then((found) => {
          if (!cancelled) setMatches(found);
        })
        .catch(() => {
          if (!cancelled) setMatches([]);
        });
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [checkKey, debounceMs]);

  useEffect(() => {
    reportCount.current?.(matches.length);
  }, [matches]);

  if (matches.length === 0) return null;

  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 16 }}
      message={t('duplicates.title')}
      description={
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">{t('duplicates.description')}</Text>
          {matches.map((m) => (
            <div key={m.householdId} data-testid="duplicate-match">
              <Space wrap size={[8, 4]}>
                <Text strong>{m.householdName || t('unnamedHousehold')}</Text>
                {m.primaryPerson && <Text>{m.primaryPerson}</Text>}
                {m.phone && <Text type="secondary">{m.phone}</Text>}
                {(m.address || m.city) && (
                  <Text type="secondary">{[m.address, m.city].filter(Boolean).join(', ')}</Text>
                )}
                <Text type="secondary">{t('duplicates.pets', { count: m.petCount })}</Text>
                {m.reasons.map((r) => (
                  <Tag key={r} color="orange">
                    {t(`duplicates.reasons.${r}`)}
                  </Tag>
                ))}
              </Space>
              <div style={{ marginTop: 4 }}>
                <Space>
                  {inRouter && <OpenButton householdId={m.householdId} />}
                  {onUseExisting && (
                    <Button size="small" type="primary" onClick={() => onUseExisting(m)}>
                      {t('duplicates.useThis')}
                    </Button>
                  )}
                </Space>
              </div>
            </div>
          ))}
        </Space>
      }
    />
  );
};

export default DuplicateHouseholdWarning;
