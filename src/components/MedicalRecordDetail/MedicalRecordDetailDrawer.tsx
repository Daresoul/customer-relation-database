import React from 'react';
import { Drawer, Descriptions, Typography, Space, Button, List, App } from 'antd';
import { useMedicalRecord } from '@/hooks/useMedicalRecords';
import { MedicalService } from '@/services/medicalService';
import type { MedicalRecordHistory } from '@/types/medical';

const { Text, Paragraph } = Typography;

interface MedicalRecordDetailDrawerProps {
  recordId: number;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

export const MedicalRecordDetailDrawer: React.FC<MedicalRecordDetailDrawerProps> = ({ recordId, open, onClose, onChanged }) => {
  const { message } = App.useApp();
  const { data, isLoading, refetch } = useMedicalRecord(recordId, true);

  const handleRevert = async () => {
    try {
      await MedicalService.revertMedicalRecord(recordId);
      message.success('Reverted to previous version');
      await refetch();
      onChanged?.();
    } catch (e: any) {
      message.error(typeof e === 'string' ? e : (e?.message || 'Failed to revert'));
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
    <Drawer title="Medical Record Details" open={open} onClose={onClose} width={720}>
      {record && (
        <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Type">{record.recordType}</Descriptions.Item>
          <Descriptions.Item label="Name">{record.name}</Descriptions.Item>
          {record.procedureName && (
            <Descriptions.Item label="Procedure">{record.procedureName}</Descriptions.Item>
          )}
          {record.price !== undefined && (
            <Descriptions.Item label="Price">{record.price}</Descriptions.Item>
          )}
          <Descriptions.Item label="Description">
            <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{record.description}</Paragraph>
          </Descriptions.Item>
          <Descriptions.Item label="Created">{new Date(record.createdAt).toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="Updated">{new Date(record.updatedAt).toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="Version">{record.version}</Descriptions.Item>
        </Descriptions>
      )}

      <Space style={{ marginBottom: 16 }}>
        <Button onClick={handleRevert} disabled={parsedHistory.length === 0}>Revert to Previous Version</Button>
      </Space>

      <Typography.Title level={5}>Change History</Typography.Title>
      <List
        size="small"
        dataSource={parsedHistory}
        renderItem={(item) => (
          <List.Item>
            <Space direction="vertical" size={0} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>Version {item.version}</Text>
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
                          <Text key={k} type="secondary" style={{ display: 'block' }}>
                            {k}: {String(oldVals[k])} 	→ {String(newVals[k])}
                          </Text>
                        ))}
                      </div>
                    );
                  }
                }
                const cf: any = (item as any).changedFields;
                if (Array.isArray(cf) && cf.length > 0) return <Text type="secondary">Changed: {cf.join(', ')}</Text>;
                if (typeof cf === 'string' && cf.trim().length > 0) return <Text type="secondary">Changed: {cf}</Text>;
                return <Text type="secondary">No field-level details recorded</Text>;
              })()}
            </Space>
          </List.Item>
        )}
      />
    </Drawer>
  );
};

export default MedicalRecordDetailDrawer;

