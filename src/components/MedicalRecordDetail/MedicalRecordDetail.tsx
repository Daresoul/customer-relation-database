import React from 'react';
import { Modal, Descriptions, Tag, Timeline, Typography, Space, Divider } from 'antd';
import {
  FileTextOutlined,
  HistoryOutlined,
  UserOutlined,
  CalendarOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import FileAttachmentList from '../FileUpload/FileAttachmentList';
import { useMedicalRecord } from '@/hooks/useMedicalRecords';
import { MedicalService } from '@/services/medicalService';
import type { MedicalRecord } from '@/types/medical';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { formatDateTime } from '@/utils/dateFormatter';

dayjs.extend(relativeTime);

const { Text, Title } = Typography;

interface MedicalRecordDetailProps {
  open: boolean;
  onClose: () => void;
  recordId: number;
}

const MedicalRecordDetail: React.FC<MedicalRecordDetailProps> = ({
  open,
  onClose,
  recordId,
}) => {
  const { data, isLoading, refetch } = useMedicalRecord(recordId, open);

  if (!data) return null;

  const { record, history } = data;

  return (
    <Modal
      title={
        <Space>
          <FileTextOutlined />
          Medical Record Details
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      loading={isLoading}
    >
      <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        {/* Record Information */}
        <Title level={5}>Record Information</Title>
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="Type">
            <Tag color={record.recordType === 'procedure' ? 'blue' : 'green'}>
              {record.recordType.charAt(0).toUpperCase() + record.recordType.slice(1)}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Status">
            {record.isArchived ? (
              <Tag color="default">Archived</Tag>
            ) : (
              <Tag color="success">Active</Tag>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="Title/Name" span={2}>
            {record.name}
          </Descriptions.Item>
          {record.procedureName && (
            <Descriptions.Item label="Procedure Name" span={2}>
              {record.procedureName}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="Description" span={2}>
            <Text style={{ whiteSpace: 'pre-wrap' }}>{record.description}</Text>
          </Descriptions.Item>
          {record.price && (
            <>
              <Descriptions.Item label="Price">
                {MedicalService.formatPrice(record.price, record.currency)}
              </Descriptions.Item>
              <Descriptions.Item label="Currency">
                {record.currency?.code || 'N/A'}
              </Descriptions.Item>
            </>
          )}
          <Descriptions.Item label="Created">
            <Space direction="vertical" size={0}>
              <Text>{formatDateTime(record.createdAt)}</Text>
              <Text type="secondary">{dayjs(record.createdAt).fromNow()}</Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Last Modified">
            <Space direction="vertical" size={0}>
              <Text>{formatDateTime(record.updatedAt)}</Text>
              <Text type="secondary">{dayjs(record.updatedAt).fromNow()}</Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Version">
            <Tag color="blue">v{record.version}</Tag>
          </Descriptions.Item>
        </Descriptions>

        {/* File Attachments */}
        <Divider />
        <Title level={5}>
          <Space>
            File Attachments
            {record.attachments && record.attachments.length > 0 && (
              <Tag>{record.attachments.length}</Tag>
            )}
          </Space>
        </Title>
        {record.attachments && record.attachments.length > 0 ? (
          <FileAttachmentList
            attachments={record.attachments}
            onDelete={() => refetch()}
          />
        ) : (
          <Text type="secondary">No attachments</Text>
        )}

        {/* Version History */}
        {history && history.length > 0 && (
          <>
            <Divider />
            <Title level={5}>
              <Space>
                <HistoryOutlined />
                Version History
                <Tag>{history.length + 1} versions</Tag>
              </Space>
            </Title>
            <Timeline
              mode="left"
              items={[
                {
                  label: formatDateTime(record.updatedAt),
                  color: 'green',
                  children: (
                    <Space direction="vertical">
                      <Text strong>Current Version (v{record.version})</Text>
                      <Text type="secondary">Latest changes</Text>
                    </Space>
                  ),
                },
                ...history.map((item) => ({
                  label: formatDateTime(item.modifiedAt),
                  color: 'gray',
                  children: (
                    <Space direction="vertical">
                      <Text>Version {item.version}</Text>
                      <Text type="secondary">
                        {item.changedFields ? `Changed: ${item.changedFields}` : 'Modified'}
                      </Text>
                      {item.modifiedBy && (
                        <Text type="secondary">
                          <UserOutlined /> {item.modifiedBy}
                        </Text>
                      )}
                    </Space>
                  ),
                })),
              ]}
            />
          </>
        )}
      </div>
    </Modal>
  );
};

export default MedicalRecordDetail;