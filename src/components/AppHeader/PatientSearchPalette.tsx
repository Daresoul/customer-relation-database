import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Input, Spin, Alert, Tag, Typography, theme } from 'antd';
import { SearchOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from '@/hooks/useDebounce';
import { MIN_QUERY_LENGTH, usePatientSearch } from './usePatientSearch';
import { loadRecentPatients, rememberPatient, RECENT_PATIENTS_EVENT, type RecentPatient } from './recentPatients';
import styles from './AppHeader.module.css';
import { speciesLabel } from '../../utils/species';

const { Text } = Typography;

interface Row {
  id: number;
  name: string | null;
  species?: string | null;
  chip?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  inactive?: boolean;
}

function useRecentPatients(): RecentPatient[] {
  const [recent, setRecent] = useState(loadRecentPatients);
  useEffect(() => {
    const reload = () => setRecent(loadRecentPatients());
    window.addEventListener(RECENT_PATIENTS_EVENT, reload);
    return () => window.removeEventListener(RECENT_PATIENTS_EVENT, reload);
  }, []);
  return recent;
}

interface Props {
  initialQuery: string;
  onClose: () => void;
}

/** Ctrl/Cmd+K patient finder: type, arrows to move, Enter to open. */
export function PatientSearchPalette({ initialQuery, onClose }: Props) {
  const { t } = useTranslation('shell');
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const debounced = useDebounce(query, 200);
  const searching = debounced.trim().length >= MIN_QUERY_LENGTH;
  const search = usePatientSearch(debounced);
  const recent = useRecentPatients();

  const rows: Row[] = useMemo(() => {
    if (!searching) return recent.map((p) => ({ id: p.id, name: p.name, species: p.species, ownerName: p.ownerName }));
    return (search.data ?? []).map((h) => ({
      id: h.patientId,
      name: h.patientName,
      species: h.species,
      chip: h.microchipId,
      ownerName: h.ownerName,
      ownerPhone: h.ownerPhone,
      inactive: !h.isActive,
    }));
  }, [searching, recent, search.data]);

  useEffect(() => setActive(0), [rows]);

  const open = (row: Row) => {
    rememberPatient({ id: row.id, name: row.name, species: row.species ?? null, ownerName: row.ownerName ?? null });
    onClose();
    navigate(`/patients/${row.id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && rows[active]) {
      e.preventDefault();
      open(rows[active]);
    }
  };

  let body: React.ReactNode;
  if (!searching) {
    body = recent.length ? (
      <Text type="secondary" className={styles.sectionLabel}>
        <ClockCircleOutlined /> {t('shell:search.recent')}
      </Text>
    ) : (
      <Text type="secondary">{t('shell:search.hint')}</Text>
    );
  } else if (search.isError) {
    body = <Alert type="error" showIcon message={t('shell:search.failed')} />;
  } else if (search.isLoading) {
    body = <Spin size="small" />;
  } else if (rows.length === 0) {
    body = <Text type="secondary">{t('shell:search.noResults')}</Text>;
  }

  return (
    <Modal open onCancel={onClose} footer={null} closable={false} width={640} style={{ top: 80 }} destroyOnClose>
      <Input
        autoFocus
        size="large"
        allowClear
        prefix={<SearchOutlined />}
        placeholder={t('shell:search.placeholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        aria-controls="patient-search-results"
      />
      <div className={styles.paletteBody}>
        {body}
        {!(searching && (search.isError || search.isLoading)) && rows.length > 0 && (
          <ul id="patient-search-results" role="listbox" className={styles.results}>
            {rows.map((row, i) => (
              <li
                key={row.id}
                role="option"
                aria-selected={i === active}
                className={styles.result}
                style={i === active ? { background: token.controlItemBgActive } : undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => open(row)}
              >
                <div>
                  <Text strong>{row.name || t('shell:search.noName')}</Text>
                  {row.species && <Text type="secondary"> · {speciesLabel(t, row.species)}</Text>}
                  {row.inactive && <Tag className={styles.inactiveTag}>{t('shell:search.inactive')}</Tag>}
                </div>
                <Text type="secondary" className={styles.resultMeta}>
                  {[row.ownerName, row.ownerPhone, row.chip].filter(Boolean).join(' · ')}
                </Text>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
