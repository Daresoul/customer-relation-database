import React, { useEffect, useRef, useState } from 'react';
import { Upload, Button, Progress, Typography, Space } from 'antd';
import { InboxOutlined, ReloadOutlined, CloseOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { MedicalService } from '@/services/medicalService';
import styles from './MedicalRecordDetailPage.module.css';

const { Text } = Typography;

/** Matches the backend's limit in `upload_medical_attachment`. */
export const MAX_UPLOAD_MB = 100;

type UploadStatus = 'waiting' | 'uploading' | 'failed' | 'refused';

interface UploadItem {
  uid: string;
  file: File;
  status: UploadStatus;
  error?: string;
}

interface DocumentUploadProps {
  recordId: number;
  /** Called after each file is stored, so the record's file list refreshes. */
  onUploaded: () => void;
}

function errorText(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  return '';
}

/**
 * Drop zone for adding files to a saved record. Files go up one at a time;
 * a failed one stays in the list with its error and a Retry. Tauri's IPC
 * reports no byte progress, so a file shows waiting, then sending.
 */
const DocumentUpload: React.FC<DocumentUploadProps> = ({ recordId, onUploaded }) => {
  const { t } = useTranslation(['medical', 'common']);
  const [items, setItems] = useState<UploadItem[]>([]);
  const nextId = useRef(0);
  const busy = useRef(false);

  const patch = (uid: string, change: Partial<UploadItem>) =>
    setItems((prev) => prev.map((i) => (i.uid === uid ? { ...i, ...change } : i)));

  useEffect(() => {
    if (busy.current) return;
    const next = items.find((i) => i.status === 'waiting');
    if (!next) return;
    busy.current = true;
    patch(next.uid, { status: 'uploading', error: undefined });
    MedicalService.uploadAttachment(recordId, next.file)
      .then(() => {
        setItems((prev) => prev.filter((i) => i.uid !== next.uid));
        onUploaded();
      })
      .catch((e: unknown) => patch(next.uid, { status: 'failed', error: errorText(e) }))
      .finally(() => {
        busy.current = false;
        // Wake the effect for the next waiting file.
        setItems((prev) => [...prev]);
      });
  }, [items, recordId, onUploaded]);

  const add = (file: File) => {
    const refusal = MedicalService.validateFile(file, MAX_UPLOAD_MB);
    nextId.current += 1;
    const item: UploadItem = {
      uid: `${nextId.current}-${file.name}`,
      file,
      status: refusal ? 'refused' : 'waiting',
      error: refusal ?? undefined,
    };
    setItems((prev) => [...prev, item]);
  };

  return (
    <div className={styles.marginTop16}>
      <Upload.Dragger
        multiple
        showUploadList={false}
        beforeUpload={(file) => {
          add(file as unknown as File);
          return false;
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">{t('medical:upload.drop')}</p>
        <p className="ant-upload-hint">{t('medical:upload.limit', { max: MAX_UPLOAD_MB })}</p>
      </Upload.Dragger>

      {items.map((item) => (
        <div key={item.uid} data-testid={`upload-row-${item.file.name}`} className={styles.uploadRow}>
          <Space direction="vertical" size={0} style={{ flex: 1, minWidth: 0 }}>
            <Text ellipsis>{item.file.name}</Text>
            {item.status === 'waiting' && <Text type="secondary">{t('medical:upload.waiting')}</Text>}
            {item.status === 'uploading' && (
              <Progress percent={50} status="active" showInfo={false} size="small" aria-label={t('medical:upload.sending')} />
            )}
            {item.status === 'failed' && (
              <>
                <Text type="danger">{t('medical:upload.failed')}</Text>
                {item.error && <Text type="secondary">{item.error}</Text>}
              </>
            )}
            {item.status === 'refused' && <Text type="danger">{item.error}</Text>}
          </Space>
          <Space>
            {item.status === 'failed' && (
              <Button size="small" icon={<ReloadOutlined />} onClick={() => patch(item.uid, { status: 'waiting' })}>
                {t('medical:upload.retry')}
              </Button>
            )}
            {(item.status === 'failed' || item.status === 'refused') && (
              <Button
                size="small"
                type="text"
                icon={<CloseOutlined />}
                aria-label={t('medical:upload.remove')}
                onClick={() => setItems((prev) => prev.filter((i) => i.uid !== item.uid))}
              />
            )}
          </Space>
        </div>
      ))}
    </div>
  );
};

export default DocumentUpload;
