import React from 'react';
import { List, Button, Space, Typography, Popconfirm, Avatar } from 'antd';
import {
  FileOutlined,
  DownloadOutlined,
  DeleteOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FileTextOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useDeleteAttachment } from '@/hooks/useMedicalRecords';
import { MedicalService } from '@/services/medicalService';
import type { MedicalAttachment } from '@/types/medical';
import dayjs from 'dayjs';

const { Text } = Typography;

interface FileAttachmentListProps {
  attachments: MedicalAttachment[];
  onDelete?: () => void;
}

const FileAttachmentList: React.FC<FileAttachmentListProps> = ({
  attachments,
  onDelete,
}) => {
  const deleteMutation = useDeleteAttachment();
  const [savingId, setSavingId] = React.useState<number | null>(null);
  const [openingId, setOpeningId] = React.useState<number | null>(null);

  const getFileIcon = (mimeType?: string, fileName?: string) => {
    if (!mimeType && fileName) {
      const ext = fileName.split('.').pop()?.toLowerCase();
      if (ext === 'pdf') return <FilePdfOutlined style={{ fontSize: 24 }} />;
      if (['doc', 'docx'].includes(ext || '')) return <FileWordOutlined style={{ fontSize: 24 }} />;
      if (['xls', 'xlsx'].includes(ext || '')) return <FileExcelOutlined style={{ fontSize: 24 }} />;
      if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext || ''))
        return <FileImageOutlined style={{ fontSize: 24 }} />;
      if (['txt', 'csv'].includes(ext || '')) return <FileTextOutlined style={{ fontSize: 24 }} />;
    }

    if (mimeType) {
      if (mimeType === 'application/pdf') return <FilePdfOutlined style={{ fontSize: 24 }} />;
      if (mimeType.includes('word')) return <FileWordOutlined style={{ fontSize: 24 }} />;
      if (mimeType.includes('excel') || mimeType.includes('spreadsheet'))
        return <FileExcelOutlined style={{ fontSize: 24 }} />;
      if (mimeType.startsWith('image/')) return <FileImageOutlined style={{ fontSize: 24 }} />;
      if (mimeType.startsWith('text/')) return <FileTextOutlined style={{ fontSize: 24 }} />;
    }

    return <FileOutlined style={{ fontSize: 24 }} />;
  };

  const handleSaveAs = async (attachment: MedicalAttachment) => {
    try {
      setSavingId(attachment.id);
      await MedicalService.saveAttachmentAs(attachment.id, attachment.originalName);
    } finally {
      setSavingId(null);
    }
  };

  const handleView = async (attachment: MedicalAttachment) => {
    try {
      setOpeningId(attachment.id);
      await MedicalService.openAttachmentExternally(attachment.id);
    } finally {
      setOpeningId(null);
    }
  };

  const handleDelete = async (attachmentId: number) => {
    await deleteMutation.mutateAsync(attachmentId);
    onDelete?.();
  };

  if (attachments.length === 0) {
    return <Text type="secondary">No attachments</Text>;
  }

  return (
    <List
      itemLayout="horizontal"
      dataSource={attachments}
      size="small"
      renderItem={(item) => (
        <List.Item
          actions={[
            <Button type="link" icon={<EyeOutlined />} onClick={() => handleView(item)} loading={openingId === item.id}>
              View
            </Button>,
            <Button type="link" icon={<DownloadOutlined />} onClick={() => handleSaveAs(item)} loading={savingId === item.id}>
              Save As
            </Button>,
            <Popconfirm
              title="Delete this attachment?"
              description="This action cannot be undone."
              onConfirm={() => handleDelete(item.id)}
              okText="Delete"
              cancelText="Cancel"
            >
              <Button
                type="link"
                danger
                icon={<DeleteOutlined />}
                loading={deleteMutation.isPending}
              >
                Delete
              </Button>
            </Popconfirm>,
          ]}
        >
          <List.Item.Meta
            avatar={
              <Avatar
                shape="square"
                size="large"
                icon={getFileIcon(item.mimeType, item.originalName)}
                style={{ backgroundColor: '#f0f0f0' }}
              />
            }
            title={item.originalName}
            description={
              <Space size="small">
                <Text type="secondary">
                  {MedicalService.formatFileSize(item.fileSize)}
                </Text>
                <Text type="secondary">•</Text>
                <Text type="secondary">
                  {dayjs(item.uploadedAt).format('MMM DD, YYYY')}
                </Text>
              </Space>
            }
          />
        </List.Item>
      )}
    />
  );
};

export default FileAttachmentList;
