import React, { useEffect, useState } from 'react';
import { Table, Button, Tag, Space, Typography, Tooltip, message, Modal } from 'antd';
import { ClockCircleOutlined, CheckCircleOutlined, WarningOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import { fileHistoryService } from '../services/fileHistoryService';
import type { FileAccessHistoryWithRecord } from '../types/fileHistory';
import { formatDistanceToNow } from 'date-fns';

const { Text } = Typography;

interface RecentDeviceFilesProps {
  onAddToRecord?: (fileId: string, originalName: string) => void;
  days?: number;
}

const RecentDeviceFiles: React.FC<RecentDeviceFilesProps> = ({ onAddToRecord, days = 14 }) => {
  const [files, setFiles] = useState<FileAccessHistoryWithRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRecentFiles = async () => {
    setLoading(true);
    try {
      console.log('[RecentDeviceFiles] Loading files for last', days, 'days');
      const recentFiles = await fileHistoryService.getRecentDeviceFiles(days);
      console.log('[RecentDeviceFiles] Loaded', recentFiles.length, 'files');
      setFiles(recentFiles);
    } catch (error) {
      console.error('[RecentDeviceFiles] Failed to load recent device files:', error);
      message.error('Failed to load recent device files');
      setFiles([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecentFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const handleAddToRecord = (file: FileAccessHistoryWithRecord) => {
    if (onAddToRecord) {
      onAddToRecord(file.fileId, file.originalName);
    }
  };

  const handleViewFile = (file: FileAccessHistoryWithRecord) => {
    Modal.info({
      title: 'File Details',
      width: 600,
      content: (
        <div style={{ marginTop: 16 }}>
          <p><strong>File Name:</strong> {file.originalName}</p>
          <p><strong>Device:</strong> {file.deviceName} ({file.deviceType})</p>
          <p><strong>Connection:</strong> {file.connectionMethod || 'Unknown'}</p>
          <p><strong>Received:</strong> {new Date(file.receivedAt).toLocaleString()}</p>
          <p><strong>File Size:</strong> {file.fileSize ? `${(file.fileSize / 1024).toFixed(2)} KB` : 'Unknown'}</p>
          <p><strong>MIME Type:</strong> {file.mimeType || 'Unknown'}</p>
          {file.firstAttachedToRecordId && (
            <>
              <p><strong>Attached to:</strong> {file.patientName} - {file.recordName}</p>
              <p><strong>Attached at:</strong> {file.firstAttachedAt ? new Date(file.firstAttachedAt).toLocaleString() : 'Unknown'}</p>
            </>
          )}
          <p><strong>Attachment Count:</strong> {file.attachmentCount}</p>
        </div>
      ),
    });
  };

  const getDeviceTypeColor = (deviceType: string): string => {
    switch (deviceType.toLowerCase()) {
      case 'exigo_eos_vet':
        return 'blue';
      case 'healvet_hv_fia3000':
        return 'green';
      case 'mnchip_pointcare_pcr_v1':
        return 'purple';
      default:
        return 'default';
    }
  };

  const getDeviceTypeDisplay = (deviceType: string): string => {
    switch (deviceType) {
      case 'exigo_eos_vet':
        return 'Exigo Eos Vet';
      case 'healvet_hv_fia3000':
        return 'Healvet HV-FIA 3000';
      case 'mnchip_pointcare_pcr_v1':
        return 'MNCHIP PointCare PCR';
      default:
        return deviceType;
    }
  };

  const columns = [
    {
      title: 'File Name',
      dataIndex: 'originalName',
      key: 'originalName',
      width: '25%',
      render: (name: string) => <Text ellipsis={{ tooltip: name }} strong>{name}</Text>,
    },
    {
      title: 'Device',
      dataIndex: 'deviceType',
      key: 'deviceType',
      width: '15%',
      render: (deviceType: string, record: FileAccessHistoryWithRecord) => (
        <Tooltip title={`${record.deviceName} via ${record.connectionMethod || 'Unknown'}`}>
          <Tag color={getDeviceTypeColor(deviceType)}>
            {getDeviceTypeDisplay(deviceType)}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: 'Received',
      dataIndex: 'receivedAt',
      key: 'receivedAt',
      width: '15%',
      render: (receivedAt: string) => (
        <Tooltip title={new Date(receivedAt).toLocaleString()}>
          <Space>
            <ClockCircleOutlined />
            <Text type="secondary">
              {formatDistanceToNow(new Date(receivedAt), { addSuffix: true })}
            </Text>
          </Space>
        </Tooltip>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: '30%',
      render: (_: any, record: FileAccessHistoryWithRecord) => {
        if (record.firstAttachedToRecordId) {
          return (
            <Tooltip title={`Attached ${record.attachmentCount} time(s)`}>
              <Space>
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                <Text type="success">
                  Attached to: {record.patientName} - {record.recordName}
                </Text>
              </Space>
            </Tooltip>
          );
        } else {
          return (
            <Space>
              <WarningOutlined style={{ color: '#faad14' }} />
              <Text type="warning">NOT YET ATTACHED</Text>
            </Space>
          );
        }
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: '15%',
      render: (_: any, record: FileAccessHistoryWithRecord) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewFile(record)}
          >
            View
          </Button>
          {onAddToRecord && (
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => handleAddToRecord(record)}
            >
              Add to Record
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
          showTotal: (total) => `Total ${total} files`,
        }}
        size="middle"
        locale={{
          emptyText: 'No device files received in the last 14 days. Files will appear here when devices send data.',
        }}
      />
    </div>
  );
};

export default RecentDeviceFiles;
