import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Table, Button, Tag, Space, Typography, Tooltip, App, Modal } from 'antd';
import { CheckCircleOutlined, WarningOutlined, EyeOutlined, PlusOutlined, FileSearchOutlined } from '@ant-design/icons';
import { fileHistoryService } from '../services/fileHistoryService';
import type { FileAccessHistoryWithRecord } from '../types/fileHistory';
import { getDeviceTypeDisplayName } from '../types/deviceIntegration';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { errorText } from '@/utils/notifyError';
import { formatDateTime } from '../utils/dateFormatter';

dayjs.extend(relativeTime);

const { Text } = Typography;

interface RecentDeviceFilesProps {
  onAddToRecord?: (fileId: string, originalName: string) => void;
  days?: number;
  onRefreshNeeded?: (refreshFn: () => void) => void;
}

const RecentDeviceFiles: React.FC<RecentDeviceFilesProps> = ({ onAddToRecord, days = 14, onRefreshNeeded }) => {
  const [files, setFiles] = useState<FileAccessHistoryWithRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();
  const { t } = useTranslation('devices');

  const loadRecentFiles = async () => {
    setLoading(true);
    try {
      console.log('[RecentDeviceFiles] Loading files for last', days, 'days');
      const recentFiles = await fileHistoryService.getRecentDeviceFiles(days);
      console.log('[RecentDeviceFiles] Loaded', recentFiles.length, 'files');
      setFiles(recentFiles);
    } catch (error) {
      console.error('[RecentDeviceFiles] Failed to load recent device files:', error);
      message.error(t('medical:recentFiles.loadFailed'));
      setFiles([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  // The refresh handed out stays the same function and always loads with the current props.
  const loadRef = useRef(loadRecentFiles);
  loadRef.current = loadRecentFiles;
  const refresh = useCallback(() => {
    void loadRef.current();
  }, []);

  useEffect(() => {
    refresh();
  }, [days, refresh]);

  // Expose refresh function to parent
  useEffect(() => {
    if (onRefreshNeeded) {
      onRefreshNeeded(refresh);
    }
  }, [onRefreshNeeded, refresh]);

  const handleAddToRecord = (file: FileAccessHistoryWithRecord) => {
    if (onAddToRecord) {
      onAddToRecord(file.fileId, file.originalName);
    }
  };

  /**
   * Open the file's raw bytes in the OS default app — for debugging what a device
   * actually sent (e.g. inspecting the XML/JSON, checking a 0-byte or malformed file).
   */
  const handleOpenFile = async (file: FileAccessHistoryWithRecord) => {
    const hide = message.loading(t('medical:recentFiles.opening', { name: file.originalName }), 0);
    try {
      await fileHistoryService.openDeviceFile(file.fileId);
      hide();
    } catch (error) {
      hide();
      console.error('[RecentDeviceFiles] Failed to open device file:', error);
      message.error(t('medical:recentFiles.openFailed', { error: errorText(error, t) }));
    }
  };

  const handleViewFile = (file: FileAccessHistoryWithRecord) => {
    Modal.info({
      title: t('medical:recentFiles.fileDetails'),
      width: 600,
      content: (
        <div style={{ marginTop: 16 }}>
          <p><strong>{t('medical:recentFiles.fileName')}:</strong> {file.originalName}</p>
          <p><strong>{t('medical:recentFiles.device')}:</strong> {file.deviceName} ({file.deviceType})</p>
          <p><strong>{t('medical:recentFiles.connection')}:</strong> {file.connectionMethod || t('medical:recentFiles.unknown')}</p>
          <p><strong>{t('medical:recentFiles.received')}:</strong> {formatDateTime(file.receivedAt)}</p>
          <p><strong>{t('medical:recentFiles.fileSize')}:</strong> {file.fileSize ? `${(file.fileSize / 1024).toFixed(2)} KB` : t('medical:recentFiles.unknown')}</p>
          <p><strong>{t('medical:recentFiles.mimeType')}:</strong> {file.mimeType || t('medical:recentFiles.unknown')}</p>
          {file.firstAttachedToRecordId && (
            <>
              <p><strong>{t('medical:recentFiles.attachedTo')}:</strong> {file.patientName} - {file.recordName}</p>
              <p><strong>{t('medical:recentFiles.attachedAt')}:</strong> {file.firstAttachedAt ? formatDateTime(file.firstAttachedAt) : t('medical:recentFiles.unknown')}</p>
            </>
          )}
          <p><strong>{t('medical:recentFiles.attachmentCount')}:</strong> {file.attachmentCount}</p>
          <div style={{ marginTop: 16 }}>
            <Button icon={<FileSearchOutlined />} onClick={() => handleOpenFile(file)}>
              {t('medical:recentFiles.openFile')}
            </Button>
          </div>
        </div>
      ),
    });
  };

  const getDeviceTypeColor = (deviceType: string): string => {
    switch (deviceType.toLowerCase()) {
      case 'exigo_eos_vet':
        return 'blue';
      case 'healvet_hv_fia_3000':
        return 'green';
      case 'mnchip_pointcare_chemistry':
        return 'cyan';
      case 'mnchip_pcr_analyzer':
      case 'mnchip_pointcare_pcr_v1':
        return 'purple';
      default:
        return 'default';
    }
  };

  const columns = [
    {
      title: t('medical:recentFiles.fileName'),
      dataIndex: 'originalName',
      key: 'originalName',
      ellipsis: {
        showTitle: false,
      },
      render: (name: string, record: FileAccessHistoryWithRecord) => (
        <Tooltip title={name}>
          <div>
            <Text strong style={{ display: 'block' }}>{name}</Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {dayjs(record.receivedAt).fromNow()}
            </Text>
          </div>
        </Tooltip>
      ),
    },
    {
      title: t('medical:recentFiles.device'),
      dataIndex: 'deviceType',
      key: 'deviceType',
      width: 180,
      render: (deviceType: string, record: FileAccessHistoryWithRecord) => (
        <Tooltip title={t('medical:recentFiles.via', { device: record.deviceName, connection: record.connectionMethod || t('medical:recentFiles.unknown') })}>
          <Tag color={getDeviceTypeColor(deviceType)}>
            {getDeviceTypeDisplayName(deviceType)}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: t('medical:recentFiles.status'),
      key: 'status',
      width: 100,
      align: 'center' as const,
      render: (_: unknown, record: FileAccessHistoryWithRecord) => {
        if (record.status === 'failed') {
          return (
            <Tooltip title={`${t('recentFiles.couldNotReadHint')}${record.error ? ` (${record.error})` : ''}`}>
              <Tag color="error">{t('recentFiles.couldNotRead')}</Tag>
            </Tooltip>
          );
        }
        if (record.firstAttachedToRecordId) {
          return (
            <Tooltip title={t('medical:recentFiles.attachedToRecord', { patient: record.patientName, record: record.recordName, times: record.attachmentCount })}>
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '18px' }} />
            </Tooltip>
          );
        } else {
          return (
            <Tooltip title={t('medical:recentFiles.notAttached')}>
              <WarningOutlined style={{ color: '#faad14', fontSize: '18px' }} />
            </Tooltip>
          );
        }
      },
    },
    {
      title: t('common:actionsLabel'),
      key: 'actions',
      width: 210,
      fixed: 'right' as const,
      render: (_: unknown, record: FileAccessHistoryWithRecord) => (
        <Space size="small">
          <Tooltip title={t('medical:recentFiles.fileDetailsTooltip')}>
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewFile(record)}
            />
          </Tooltip>
          <Tooltip title={t('medical:recentFiles.openFileDebug')}>
            <Button
              type="link"
              size="small"
              icon={<FileSearchOutlined />}
              onClick={() => handleOpenFile(record)}
            />
          </Tooltip>
          {onAddToRecord && record.status !== 'failed' && (
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => handleAddToRecord(record)}
            >
              {t('common:add')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Table
        columns={columns}
        dataSource={files}
        rowKey={(record) => record.id.toString()}
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => t('medical:recentFiles.total', { count: total }),
        }}
        size="small"
        scroll={{ x: 700 }}
        locale={{
          emptyText: t('medical:recentFiles.empty'),
        }}
      />
    </div>
  );
};

export default RecentDeviceFiles;
