/**
 * Read-only display of the diagnoses attached to a medical record.
 *
 * Used in:
 *   - MedicalRecordDetail — full list, no truncation
 *   - MedicalRecordCards (patient dashboard) — compact with `maxVisible`
 *     so the card doesn't grow unbounded for records with many tags
 *
 * Renders nothing (no chrome) when the record has no diagnoses, so it's
 * safe to drop into a layout that already has its own empty-state.
 */

import React from 'react';
import { Space, Tag, Tooltip } from 'antd';
import { TagsOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useDiagnosesForRecord } from '@/hooks/useDiagnoses';

interface DiagnosisTagListProps {
  /** Medical record whose diagnoses we should display. */
  recordId: number;
  /**
   * Max tags to render inline. Remaining are summarized as "+N more"
   * with a tooltip that lists the rest. Omit for "show everything".
   */
  maxVisible?: number;
  /** AntD Tag size knob. `small` is right for dashboard cards. */
  size?: 'small' | 'default';
  /**
   * If true, prefix the tag row with a small icon + the "Diagnoses:"
   * label so the row is self-explanatory even without surrounding
   * UI chrome. Detail page sets its own section header so passes
   * `false`; card view passes `true`.
   */
  showLabel?: boolean;
}

const DEFAULT_TAG_COLOR = '#2f54eb';

const DiagnosisTagList: React.FC<DiagnosisTagListProps> = ({
  recordId,
  maxVisible,
  size = 'default',
  showLabel = false,
}) => {
  const { t } = useTranslation(['medical']);
  const { data, isLoading } = useDiagnosesForRecord(recordId);

  // While loading we render nothing — the tags are decorative info
  // and a flickering spinner per card would be visually noisy. The
  // query is fast (single SELECT JOIN) and cached for 30s anyway.
  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  const visible = maxVisible != null ? data.slice(0, maxVisible) : data;
  const hidden = maxVisible != null ? data.slice(maxVisible) : [];

  const tagStyle: React.CSSProperties =
    size === 'small' ? { fontSize: 11, lineHeight: '18px', padding: '0 6px' } : {};

  return (
    <Space size={[4, 4]} wrap>
      {showLabel && (
        <span
          style={{
            color: '#666',
            fontSize: size === 'small' ? 11 : 13,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <TagsOutlined />
          {t('medical:fields.diagnoses', 'Diagnoses')}:
        </span>
      )}
      {visible.map((d) => (
        <Tag key={d.id} color={d.color || DEFAULT_TAG_COLOR} style={tagStyle}>
          {d.name}
        </Tag>
      ))}
      {hidden.length > 0 && (
        <Tooltip
          title={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {hidden.map((d) => (
                <span key={d.id}>• {d.name}</span>
              ))}
            </div>
          }
        >
          <Tag style={{ ...tagStyle, cursor: 'help' }}>
            +{hidden.length}{' '}
            {t('medical:diagnosesMore', 'more')}
          </Tag>
        </Tooltip>
      )}
    </Space>
  );
};

export default DiagnosisTagList;
