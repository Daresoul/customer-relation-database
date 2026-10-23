import React from 'react';
import { Card, Table, Typography, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { LoadError } from '../common/LoadError';
import { LabFlagTag } from './LabFlagTag';
import { useRecordLabValues } from '../../hooks/useLabResults';
import { formatDate } from '../../utils/dateFormatter';
import { changeFromPrevious } from '../../utils/labGrid';
import type { RecordLabValue } from '../../types/labResults';

const { Text } = Typography;

const ARROWS = { up: '↑', down: '↓', same: '=' } as const;

/** The record's lab values, each compared with the patient's previous one. Nothing when it has none. */
export const RecordLabValues: React.FC<{ recordId: number; attachmentsKey: string; className?: string }> = ({
  recordId,
  attachmentsKey,
  className,
}) => {
  const { t } = useTranslation(['devices', 'common']);
  const { token } = theme.useToken();
  const { data: values = [], isError, refetch, isFetching } = useRecordLabValues(recordId, attachmentsKey);

  if (isError) {
    return (
      <Card title={t('devices:labs.record.title')} className={className}>
        <LoadError title={t('devices:labs.record.loadFailed')} onRetry={() => refetch()} retrying={isFetching} />
      </Card>
    );
  }
  if (values.length === 0) return null;

  const arrowLabel = { up: t('devices:labs.record.up'), down: t('devices:labs.record.down'), same: t('devices:labs.record.same') };

  const columns: ColumnsType<RecordLabValue> = [
    {
      title: t('devices:labs.columns.analyte'),
      key: 'analyte',
      render: (_, v) => (
        <span>
          <Text strong>{v.code}</Text>
          {v.name !== v.code && (
            <Text type="secondary" style={{ marginInlineStart: 8, fontSize: 12 }}>
              {v.name}
            </Text>
          )}
        </span>
      ),
    },
    {
      title: t('devices:labs.record.value'),
      key: 'value',
      render: (_, v) => {
        const change = changeFromPrevious(v.valueNum, v.previous?.valueNum);
        return (
          <span style={{ whiteSpace: 'nowrap' }}>
            <span
              style={{
                color: v.flag === 'H' ? token.colorError : v.flag === 'L' ? token.colorPrimary : undefined,
                fontWeight: v.flag === 'H' || v.flag === 'L' ? 600 : undefined,
              }}
            >
              {v.valueText}
            </span>
            <LabFlagTag flag={v.flag} />
            {change && (
              <span
                aria-label={arrowLabel[change]}
                title={arrowLabel[change]}
                style={{ marginInlineStart: 6, color: token.colorTextSecondary }}
              >
                {ARROWS[change]}
              </span>
            )}
          </span>
        );
      },
    },
    {
      title: t('devices:labs.record.previous'),
      key: 'previous',
      render: (_, v) =>
        v.previous ? (
          <span style={{ whiteSpace: 'nowrap' }}>
            <span>{v.previous.valueText}</span>
            <LabFlagTag flag={v.previous.flag} />
            <Text type="secondary" style={{ marginInlineStart: 8, fontSize: 12 }}>
              {formatDate(v.previous.sampleAt)}
            </Text>
          </span>
        ) : null,
    },
    { title: t('devices:labs.columns.unit'), key: 'unit', render: (_, v) => v.unit },
    { title: t('devices:labs.columns.range'), key: 'range', render: (_, v) => v.rangeText },
  ];

  return (
    <Card title={t('devices:labs.record.title')} className={className}>
      <Table<RecordLabValue> size="small" rowKey="id" columns={columns} dataSource={values} pagination={false} />
    </Card>
  );
};

export default RecordLabValues;
