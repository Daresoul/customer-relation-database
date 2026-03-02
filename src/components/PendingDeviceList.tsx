import React, { useEffect, useState } from 'react';
import { Drawer, Input, Table, Tag, Space, Typography, message, Button } from 'antd';
import type { PendingDeviceEntryWithFile } from '@/types/fileHistory';
import { fileHistoryService } from '@/services/fileHistoryService';
import { invoke } from '@tauri-apps/api/tauri';
import { useDeviceImport } from '@/contexts/DeviceImportContext';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

interface PendingDeviceListProps {
  open: boolean;
  onClose: () => void;
}

const PendingDeviceList: React.FC<PendingDeviceListProps> = ({ open, onClose }) => {
  const [items, setItems] = useState<PendingDeviceEntryWithFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const { addDeviceFile, openModal, setSuggestedPatient } = useDeviceImport();
  const { t } = useTranslation(['devices','common']);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fileHistoryService.listPendingDeviceEntries(query);
      setItems(res);
    } catch (e) {
      console.error('Failed to load pending items', e);
      message.error(t('common:error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const columns = [
    {
      title: t('devices:pending.patientSerial'),
      dataIndex: 'patientSerial',
      key: 'patientSerial',
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: t('devices:pending.fileName'),
      dataIndex: 'originalName',
      key: 'originalName',
    },
    {
      title: t('devices:pending.device'),
      dataIndex: 'deviceType',
      key: 'deviceType',
      render: (deviceType: string, r: PendingDeviceEntryWithFile) => (
        <Tag>{r.deviceName}</Tag>
      ),
    },
    {
      title: t('devices:pending.received'),
      dataIndex: 'receivedAt',
      key: 'receivedAt',
      render: (d: string) => new Date(d).toLocaleString(),
    },
    {
      title: t('common:actions'),
      key: 'actions',
      width: 160,
      render: (_: any, rec: PendingDeviceEntryWithFile) => (
        <Space>
          <Button
            size="small"
            onClick={async () => {
              try {
                setLoading(true);
                // Get normalized DeviceData from backend
                const data: any = await invoke('get_device_data_from_history', { fileId: rec.fileId });

                // Optional: resolve patient by identifier
                let resolvedId: number | undefined;
                if (data.patientIdentifier) {
                  try {
                    const resolved = await invoke<{ id: number } | null>('resolve_patient_from_identifier', { identifier: data.patientIdentifier });
                    if (resolved) {
                      resolvedId = resolved.id;
                    }
                  } catch {}
                }

                // Compose PendingDeviceFile
                const fileBytes: number[] = data.fileData || [];
                addDeviceFile({
                  id: `${data.deviceName}-${Date.now()}-${Math.random()}`,
                  deviceType: data.deviceType,
                  deviceName: data.deviceName,
                  connectionMethod: data.connectionMethod || 'file_watch',
                  fileName: data.originalFileName,
                  fileData: fileBytes,
                  mimeType: data.mimeType || 'application/octet-stream',
                  testResults: data.testResults || {},
                  patientId: resolvedId,
                  patientIdentifier: data.patientIdentifier || undefined,
                  detectedAt: data.detectedAt || new Date().toISOString(),
                  pendingEntryId: rec.id,
                  sourceFileId: rec.fileId,
                });

                if (resolvedId) setSuggestedPatient(resolvedId);
                openModal();
                message.success(t('devices:pending.loadedIntoImport'));
              } catch (e) {
                console.error(e);
                message.error(t('devices:pending.failedOpenImport'));
              } finally {
                setLoading(false);
              }
            }}
          >
            {t('common:open')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Drawer
      title={t('devices:pending.title')}
      placement="right"
      width={800}
      open={open}
      onClose={onClose}
      destroyOnClose
      extra={
        <Space>
          <Input.Search
            allowClear
            placeholder={t('devices:pending.searchPlaceholder')}
            style={{ width: 280 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onSearch={() => load()}
          />
        </Space>
      }
    >
      <Table
        rowKey={(r) => r.id}
        columns={columns as any}
        dataSource={items}
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
    </Drawer>
  );
};

export default PendingDeviceList;
