import React, { useEffect, useState } from 'react';
import { Modal, Spin, message, Alert, Button, Divider, List, Typography, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import MedicalRecordForm from './MedicalRecordForm';
import { useMedicalRecord, useCreateMedicalRecord, useUpdateMedicalRecord, useUploadAttachment } from '@/hooks/useMedicalRecords';
import type { CreateMedicalRecordInput, UpdateMedicalRecordInput, MedicalRecordHistory } from '@/types/medical';

interface MedicalRecordModalProps {
  open: boolean;
  onClose: () => void;
  patientId: number;
  patientName: string;
  recordId: number | null;
}

const MedicalRecordModal: React.FC<MedicalRecordModalProps> = ({
  open,
  onClose,
  patientId,
  patientName,
  recordId,
}) => {
  const { t } = useTranslation('medical');
  const [loading, setLoading] = useState(false);
  const { data: recordDetail, isLoading: isLoadingRecord, isError, error, refetch } = useMedicalRecord(
    recordId || 0,
    true // include history when editing
  );
  const createMutation = useCreateMedicalRecord();
  const updateMutation = useUpdateMedicalRecord();
  const uploadMutation = useUploadAttachment();

  const isEdit = !!recordId;
  const title = isEdit
    ? `${t('form.editTitle')} - ${patientName}`
    : `${t('form.createTitle')} - ${patientName}`;

  // Debugging: log modal state and fetch status
  useEffect(() => {
    if (isEdit) {
    } else {
    }
  }, [isEdit, recordId, patientId]);

  useEffect(() => {
    if (isEdit) {
      if (isError) {
        console.error('[MedicalRecordModal] Load error:', error);
      }
      if (recordDetail) {
      }
    }
  }, [isEdit, isLoadingRecord, isError, error, recordDetail]);

  const handleSubmit = async (values: CreateMedicalRecordInput | UpdateMedicalRecordInput, files?: File[]) => {
    setLoading(true);
    try {
      if (isEdit && recordId) {
        await updateMutation.mutateAsync({
          recordId,
          updates: values as UpdateMedicalRecordInput,
        });
      } else {
        // Create the medical record first
        const result = await createMutation.mutateAsync({
          ...values as CreateMedicalRecordInput,
          patientId,
        });

        // Upload files if any were selected
        if (files && files.length > 0 && result) {
          const uploadPromises = files.map(file =>
            uploadMutation.mutateAsync({
              medicalRecordId: result.id,
              file,
            })
          );

          try {
            await Promise.all(uploadPromises);
            message.success(t('messages.uploadSuccess'));
          } catch (uploadError) {
            message.error(t('messages.uploadFailed'));
            console.error('Upload error:', uploadError);
          }
        }
      }
      onClose();
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnHidden
    >
      {isEdit && isLoadingRecord ? (
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" />
        </div>
      ) : isEdit && isError ? (
        <div style={{ padding: 16 }}>
          <Alert
            type="error"
            showIcon
            message={t('messages.loadError')}
            description={
              typeof error === 'string'
                ? error
                : (error && (error as any).message)
                  ? String((error as any).message)
                  : 'An error occurred while loading the record.'
            }
            action={
              <Button size="small" onClick={() => refetch()}>
                {t('actions.retry')}
              </Button>
            }
          />
        </div>
      ) : (
        <div>
          <MedicalRecordForm
            initialValues={isEdit && recordDetail ? recordDetail.record : undefined}
            onSubmit={handleSubmit}
            onCancel={onClose}
            loading={loading}
            isEdit={isEdit}
            patientId={patientId}
            recordId={recordId}
          />

          {isEdit && recordDetail?.history && recordDetail.history.length > 0 && (
            <>
              <Divider style={{ marginTop: 24 }} />
              <HistoryList history={recordDetail.history} />
            </>
          )}
        </div>
      )}
    </Modal>
  );
};

const { Text } = Typography;

const HistoryList: React.FC<{ history: MedicalRecordHistory[] }> = ({ history }) => {
  // Deduplicate obvious duplicates (same version and timestamp)
  const seen = new Set<string>();
  // Normalize and sort by changedAt desc (fallback to version desc)
  const items = history.filter(h => {
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

  return (
    <div>
      <Text strong style={{ color: '#E6E6E6' }}>Change History</Text>
      <List
        size="small"
        dataSource={items}
        renderItem={(item) => (
          <List.Item>
            <Space direction="vertical" size={0} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>Version {item.version}</Text>
                <Text type="secondary">{new Date(item.changedAt).toLocaleString()}</Text>
              </div>
              {item.changedBy && (
                <Text type="secondary">by {item.changedBy}</Text>
              )}
              {(() => {
                // Prefer showing exact diffs if available
                const oldRaw: any = (item as any).oldValues;
                const newRaw: any = (item as any).newValues;
                const parseMaybeJson = (v: any) => {
                  if (!v) return null;
                  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
                  if (typeof v === 'object') return v;
                  return null;
                };
                const oldVals = parseMaybeJson(oldRaw);
                const newVals = parseMaybeJson(newRaw);
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
                // Fallback to changedFields list
                const cf: any = (item as any).changedFields;
                let fields: string[] | null = null;
                if (Array.isArray(cf)) {
                  fields = cf as string[];
                } else if (typeof cf === 'string' && cf.trim().length > 0) {
                  fields = cf.split(',').map((s: string) => s.trim()).filter(Boolean);
                }
                return fields && fields.length > 0 ? (
                  <Text type="secondary">Changed: {fields.join(', ')}</Text>
                ) : (
                  <Text type="secondary">No field-level details recorded</Text>
                );
              })()}
            </Space>
          </List.Item>
        )}
        style={{ marginTop: 8 }}
      />
    </div>
  );
};

export default MedicalRecordModal;
