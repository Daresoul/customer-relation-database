import React from 'react';
import { Drawer, Descriptions, Typography, Space, Button, List, App } from 'antd';
import { useTranslation } from 'react-i18next';
import { useMedicalRecord } from '@/hooks/useMedicalRecords';
import { MedicalService } from '@/services/medicalService';
import type { MedicalRecordHistory } from '@/types/medical';
import styles from './MedicalRecordDetail.module.css';

const { Text, Paragraph } = Typography;

interface MedicalRecordDetailDrawerProps {
  recordId: number;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

export const MedicalRecordDetailDrawer: React.FC<MedicalRecordDetailDrawerProps> = ({ recordId, open, onClose, onChanged }) => {
  const { t } = useTranslation(['medical', 'common']);
  const { notification } = App.useApp();
  const { data, isLoading, refetch } = useMedicalRecord(recordId, true);

  const handleRevert = async () => {
    try {
      await MedicalService.revertMedicalRecord(recordId);
      notification.success({
        message: t('medical:history.reverted'),
        description: t('medical:history.reverted'),
        placement: 'bottomRight',
        duration: 3,
      });
      await refetch();
      onChanged?.();
    } catch (e: any) {
      notification.error({
        message: t('common:error'),
        description: typeof e === 'string' ? e : (e?.message || t('medical:history.revertFailed')),
        placement: "bottomRight",
        duration: 5
      });
    }
  };

  const record = data?.record;
  const history = data?.history || [];

  const formatHistory = (items: MedicalRecordHistory[]) => {
    const seen = new Set<string>();
    return items.filter(h => {
      const key = `${h.version}|${h.changedAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => {
      const ad = new Date(a.changedAt).getTime();
      const bd = new Date(b.changedAt).getTime();
      if (!isNaN(ad) && !isNaN(bd) && bd !== ad) return bd - ad;
      return (b.version || 0) - (a.version || 0);
    });
  };

  const parsedHistory = formatHistory(history);

  return (
    <Drawer title={t('medical:detail.recordDetails')} open={open} onClose={onClose} width={720}>
      {record && (
        <Descriptions bordered size="small" column={1} className={styles.marginBottom16}>
          <Descriptions.Item label={t('medical:fields.recordType')}>{record.recordType}</Descriptions.Item>
          <Descriptions.Item label={t('medical:fields.name')}>{record.name}</Descriptions.Item>
          {record.procedureName && (
            <Descriptions.Item label={t('medical:recordTypes.procedure')}>{record.procedureName}</Descriptions.Item>
          )}
          {record.price !== undefined && (
            <Descriptions.Item label={t('medical:fields.price')}>{record.price}</Descriptions.Item>
          )}
          <Descriptions.Item label={t('medical:fields.description')}>
            <Paragraph className={styles.preWrapNoMargin}>{record.description}</Paragraph>
          </Descriptions.Item>
          <Descriptions.Item label={t('medical:fields.createdAt')}>{new Date(record.createdAt).toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label={t('medical:fields.updatedAt')}>{new Date(record.updatedAt).toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label={t('medical:fields.version')}>{record.version}</Descriptions.Item>
        </Descriptions>
      )}

      <Space className={styles.marginBottom16}>
        <Button onClick={handleRevert} disabled={parsedHistory.length === 0}>{t('medical:history.revertPrevious')}</Button>
      </Space>

      <Typography.Title level={5}>{t('medical:history.title')}</Typography.Title>
      <List
        size="small"
        dataSource={parsedHistory}
        renderItem={(item) => (
          <List.Item>
            <Space direction="vertical" size={0} className={styles.fullWidth}>
              <div className={styles.flexSpaceBetween}>
                <Text>{t('medical:versionLabel', { version: item.version })}</Text>
                <Text type="secondary">{new Date(item.changedAt).toLocaleString()}</Text>
              </div>
              {(() => {
                // Prefer exact diffs
                const parseMaybeJson = (v: any) => {
                  if (!v) return null;
                  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
                  if (typeof v === 'object') return v;
                  return null;
                };
                const oldVals: any = parseMaybeJson((item as any).oldValues);
                const newVals: any = parseMaybeJson((item as any).newValues);
                if (oldVals && newVals) {
                  const keys = Object.keys(newVals);
                  if (keys.length > 0) {
                    return (
                      <div>
                        {keys.map(k => (
                          <Text key={k} type="secondary" className={styles.displayBlock}>
                            {k}: {String(oldVals[k])} 	→ {String(newVals[k])}
                          </Text>
                        ))}
                      </div>
                    );
                  }
                }
                const cf: any = (item as any).changedFields;
                if (Array.isArray(cf) && cf.length > 0) return <Text type="secondary">{t('medical:history.changed', { fields: cf.join(', ') })}</Text>;
                if (typeof cf === 'string' && cf.trim().length > 0) return <Text type="secondary">{t('medical:history.changed', { fields: cf })}</Text>;
                return <Text type="secondary">{t('medical:history.noFieldDetails')}</Text>;
              })()}
            </Space>
          </List.Item>
        )}
      />
    </Drawer>
  );
};

export default MedicalRecordDetailDrawer;

