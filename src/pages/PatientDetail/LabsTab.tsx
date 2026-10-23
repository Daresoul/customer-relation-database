import React, { useMemo, useState } from 'react';
import { Button, Card, Empty, Segmented, Skeleton, Table, Typography, theme } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { LoadError } from '../../components/common/LoadError';
import { LabFlagTag } from '../../components/LabResults/LabFlagTag';
import { LabTrendChart } from '../../components/LabResults/LabTrendChart';
import { usePatientLabResults } from '../../hooks/useLabResults';
import { formatDate } from '../../utils/dateFormatter';
import { LAB_PANELS, buildLabGrid, panelOf, trendPoints, type LabGridRow, type LabPanel } from '../../utils/labGrid';

const { Text } = Typography;

/** The patient's lab values: analytes by date, newest left, and a trend per analyte. */
export const LabsTab: React.FC<{ patientId: number }> = ({ patientId }) => {
  const { t } = useTranslation(['devices', 'common']);
  const { token } = theme.useToken();
  const { data: values = [], isLoading, isError, refetch, isFetching } = usePatientLabResults(patientId);
  const [panel, setPanel] = useState<LabPanel | 'all'>('all');
  const [selected, setSelected] = useState<string | null>(null);

  const panels = useMemo(() => LAB_PANELS.filter((p) => values.some((v) => panelOf(v.deviceType) === p)), [values]);
  const grid = useMemo(() => buildLabGrid(values, panel), [values, panel]);
  const selectedRow = grid.rows.find((r) => r.key === selected);

  if (isError) {
    return <LoadError title={t('devices:labs.loadFailed')} onRetry={() => refetch()} retrying={isFetching} />;
  }
  if (isLoading) {
    return <Skeleton active paragraph={{ rows: 4 }} />;
  }
  if (values.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('devices:labs.empty')} />;
  }

  const valueColor = (flag: string) =>
    flag === 'H' ? token.colorError : flag === 'L' ? token.colorPrimary : undefined;

  const columns: ColumnsType<LabGridRow> = [
    {
      title: t('devices:labs.columns.analyte'),
      key: 'analyte',
      fixed: 'left',
      width: 190,
      render: (_, row) => (
        <div>
          <Text strong>{row.code}</Text>
          {row.name !== row.code && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {row.name}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    { title: t('devices:labs.columns.unit'), key: 'unit', width: 90, render: (_, row) => row.unit },
    { title: t('devices:labs.columns.range'), key: 'range', width: 120, render: (_, row) => row.rangeText },
    ...grid.columns.map((column) => ({
      title: (
        <div style={{ whiteSpace: 'nowrap' }}>
          <div>{formatDate(column.sampleAt)}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs(column.sampleAt).format('HH:mm')}
          </Text>
        </div>
      ),
      key: column.key,
      width: 110,
      render: (_: unknown, row: LabGridRow) => {
        const cell = row.cells[column.key];
        if (!cell) return null;
        return (
          <span style={{ whiteSpace: 'nowrap' }}>
            <span style={{ color: valueColor(cell.flag), fontWeight: cell.flag === 'H' || cell.flag === 'L' ? 600 : undefined }}>
              {cell.valueText}
            </span>
            <LabFlagTag flag={cell.flag} />
          </span>
        );
      },
    })),
  ];

  const points = selectedRow ? trendPoints(values, selectedRow.key) : [];

  return (
    <div>
      {panels.length > 1 && (
        <Segmented
          style={{ marginBottom: 12 }}
          value={panel}
          onChange={(value) => {
            setPanel(value as LabPanel | 'all');
            setSelected(null);
          }}
          options={[
            { label: t('devices:labs.all'), value: 'all' },
            ...panels.map((p) => ({ label: t(`devices:labs.panels.${p}`), value: p })),
          ]}
        />
      )}
      <div style={{ marginBottom: 8 }}>
        <Text type="secondary">{t('devices:labs.hint')}</Text>
      </div>
      <Table<LabGridRow>
        size="small"
        rowKey="key"
        columns={columns}
        dataSource={grid.rows}
        pagination={false}
        scroll={{ x: 'max-content' }}
        onRow={(row) => ({
          onClick: () => setSelected(row.key),
          style: {
            cursor: 'pointer',
            background: row.key === selected ? token.controlItemBgActive : undefined,
          },
        })}
      />
      {selectedRow && (
        <Card
          size="small"
          style={{ marginTop: 16 }}
          title={
            <span>
              {t('devices:labs.trend.title', { code: selectedRow.code })}
              {selectedRow.unit && <Text type="secondary"> ({selectedRow.unit})</Text>}
            </span>
          }
          extra={
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              aria-label={t('devices:labs.trend.close')}
              onClick={() => setSelected(null)}
            />
          }
        >
          {points.length === 0 ? (
            <Text type="secondary">{t('devices:labs.trend.noNumbers')}</Text>
          ) : (
            <LabTrendChart
              points={points}
              label={t('devices:labs.trend.label', { code: selectedRow.code })}
              bandLabel={t('devices:labs.trend.band')}
            />
          )}
        </Card>
      )}
    </div>
  );
};

export default LabsTab;
