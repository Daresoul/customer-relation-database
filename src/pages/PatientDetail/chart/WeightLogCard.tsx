import React from 'react';
import { Button, Empty, List, Popconfirm, Skeleton, Tooltip, Typography } from 'antd';
import { DeleteOutlined, FileTextOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { LoadError } from '../../../components/common/LoadError';
import { WeightSparkline } from '../../../components/patient/WeightSparkline';
import { useDeleteWeight, usePatientWeights } from '../../../hooks/usePatientChart';
import { formatDate } from '../../../utils/dateFormatter';
import { formatKg } from '../../../utils/patientChart';
import styles from './PatientChart.module.css';

const { Text } = Typography;

/** The weight log on the overview: trend line and every entry, newest first. */
export const WeightLogCard: React.FC<{ patientId: number }> = ({ patientId }) => {
  const { t } = useTranslation(['patients', 'common']);
  const { data: weights = [], isLoading, isError, refetch, isFetching } = usePatientWeights(patientId);
  const deleteWeight = useDeleteWeight();

  let body: React.ReactNode;
  if (isError) {
    body = <LoadError title={t('patients:chart.weights.loadFailed')} onRetry={() => refetch()} retrying={isFetching} />;
  } else if (isLoading) {
    body = <Skeleton active paragraph={{ rows: 2 }} />;
  } else if (weights.length === 0) {
    body = <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('patients:chart.weights.empty')} />;
  } else {
    body = (
      <>
        <div className={styles.trend}>
          <WeightSparkline weights={weights} width={260} height={48} label={t('patients:chart.weights.trend')} />
        </div>
        <List
          size="small"
          dataSource={weights}
          rowKey="id"
          renderItem={(w) => (
            <List.Item
              actions={[
                <Popconfirm
                  key="remove"
                  title={t('patients:chart.weights.removeConfirm')}
                  okText={t('common:delete')}
                  cancelText={t('common:cancel')}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => deleteWeight.mutateAsync({ id: w.id }).catch(() => {})}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    aria-label={t('patients:chart.weights.remove')}
                  />
                </Popconfirm>,
              ]}
            >
              <span className={styles.weightRow}>
                <Text type="secondary">{formatDate(w.measuredOn)}</Text>
                <Text strong>{t('patients:units.weightKg', { weight: formatKg(w.weight) })}</Text>
                {w.medicalRecordId != null && (
                  <Tooltip title={t('patients:chart.weights.fromRecord')}>
                    <FileTextOutlined />
                  </Tooltip>
                )}
              </span>
            </List.Item>
          )}
        />
      </>
    );
  }

  return (
    <div className={styles.card}>
      <Typography.Title level={5} className={styles.cardTitle}>
        {t('patients:chart.weights.title')}
      </Typography.Title>
      {body}
    </div>
  );
};

export default WeightLogCard;
