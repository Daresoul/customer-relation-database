import React, { useEffect, useState } from 'react';
import { Card, Input, Table, Tag, Space, Typography, Button, App } from 'antd';
import type { PendingDeviceEntryWithFile } from '@/types/fileHistory';
import { fileHistoryService } from '@/services/fileHistoryService';
import { invoke } from '@tauri-apps/api/tauri';
import { useDeviceImport } from '@/contexts/DeviceImportContext';

const { Text } = Typography;

const PendingDeviceTable: React.FC = () => {
  const [items, setItems] = useState<PendingDeviceEntryWithFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const { addDeviceFile, openModal, setSuggestedPatient } = useDeviceImport();
  const { message } = App.useApp();

  const load = async () => {
    setLoading(true);
    try {
      const res = await fileHistoryService.listPendingDeviceEntries(query);
      setItems(res);
    } catch (e) {
      console.error(e);
      message.error('Failed to load saved items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = [
    {
      title: 'Patient Serial',
      dataIndex: 'patientSerial',
      key: 'patientSerial',
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: 'File Name',
      dataIndex: 'originalName',
      key: 'originalName',
    },
    {
      title: 'Device',
      dataIndex: 'deviceType',
      key: 'deviceType',
      render: (_: string, record: PendingDeviceEntryWithFile) => <Tag>{record.deviceName}</Tag>,
    },
    {
      title: 'Received',
      dataIndex: 'receivedAt',
      key: 'receivedAt',
      render: (d: string) => new Date(d).toLocaleString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_: any, rec: PendingDeviceEntryWithFile) => (
        <Space>
          <Button
            size="small"
            onClick={async () => {
              try {
                setLoading(true);
                const data: any = await invoke('get_device_data_from_history', { fileId: rec.fileId });
                let resolvedId: number | undefined;
                if (data.patientIdentifier) {
                  try {
                    const resolved = await invoke<{ id: number } | null>('resolve_patient_from_identifier', { identifier: data.patientIdentifier });
                    if (resolved) resolvedId = resolved.id;
                  } catch {}
                }
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
                });
                if (resolvedId) setSuggestedPatient(resolvedId);
                openModal();
                message.success('Loaded into import');
              } catch (e) {
                console.error(e);
                message.error('Failed to open in import');
              } finally {
                setLoading(false);
              }
            }}
          >
            Open
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="Saved For Later"
      extra={
        <Space>
          <Input.Search
            allowClear
            placeholder="Search by patient serial"
            style={{ width: 280 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onSearch={() => load()}
          />
          <Button onClick={load}>Refresh</Button>
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
    </Card>
  );
};

export default PendingDeviceTable;
