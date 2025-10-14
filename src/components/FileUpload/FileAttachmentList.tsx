import React from 'react';
import { List, Button, Space, Typography, Popconfirm, Avatar, App } from 'antd';
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
  ReloadOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/tauri';
import { useDeleteAttachment } from '@/hooks/useMedicalRecords';
import { MedicalService } from '@/services/medicalService';
import type { MedicalAttachment } from '@/types/medical';
import dayjs from 'dayjs';
import { formatDate } from '@/utils/dateFormatter';
import styles from './FileUpload.module.css';

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
  const [regeneratingId, setRegeneratingId] = React.useState<number | null>(null);
  const { notification } = App.useApp();

  const getFileIcon = (mimeType?: string, fileName?: string) => {
    if (!mimeType && fileName) {
      const ext = fileName.split('.').pop()?.toLowerCase();
      if (ext === 'pdf') return <FilePdfOutlined className={styles.fileIcon} />;
      if (['doc', 'docx'].includes(ext || '')) return <FileWordOutlined className={styles.fileIcon} />;
      if (['xls', 'xlsx'].includes(ext || '')) return <FileExcelOutlined className={styles.fileIcon} />;
      if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext || ''))
        return <FileImageOutlined className={styles.fileIcon} />;
      if (['txt', 'csv'].includes(ext || '')) return <FileTextOutlined className={styles.fileIcon} />;
    }

    if (mimeType) {
      if (mimeType === 'application/pdf') return <FilePdfOutlined className={styles.fileIcon} />;
      if (mimeType.includes('word')) return <FileWordOutlined className={styles.fileIcon} />;
      if (mimeType.includes('excel') || mimeType.includes('spreadsheet'))
        return <FileExcelOutlined className={styles.fileIcon} />;
      if (mimeType.startsWith('image/')) return <FileImageOutlined className={styles.fileIcon} />;
      if (mimeType.startsWith('text/')) return <FileTextOutlined className={styles.fileIcon} />;
    }

    return <FileOutlined className={styles.fileIcon} />;
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

  const handleRegeneratePdf = async (attachment: MedicalAttachment) => {
    try {
      setRegeneratingId(attachment.id);
      console.log('🔄 Regenerating PDF from attachment:', attachment.id);

      const newAttachment = await invoke<MedicalAttachment>('regenerate_pdf_from_attachment', {
        attachmentId: attachment.id,
      });

      notification.success({
        message: 'PDF Regenerated',
        description: `Successfully regenerated PDF report from ${attachment.originalName}`,
        placement: 'bottomRight',
        duration: 5,
      });

      console.log('✅ PDF regenerated successfully:', newAttachment);

      // Refresh the list
      onDelete?.();
    } catch (error: any) {
      console.error('❌ Failed to regenerate PDF:', error);
      notification.error({
        message: 'PDF Regeneration Failed',
        description: error?.toString() || 'An unknown error occurred',
        placement: 'bottomRight',
        duration: 7,
      });
    } finally {
      setRegeneratingId(null);
    }
  };

  const canRegeneratePdf = (attachment: MedicalAttachment): boolean => {
    // Can regenerate if it's an XML file with device metadata
    const isXml = attachment.mimeType?.includes('xml') || attachment.originalName.toLowerCase().endsWith('.xml');
    const hasDeviceMetadata = !!attachment.deviceType && !!attachment.deviceName;
    return isXml && hasDeviceMetadata;
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
            ...(canRegeneratePdf(item) ? [
              <Button
                type="link"
                icon={<ReloadOutlined />}
                onClick={() => handleRegeneratePdf(item)}
                loading={regeneratingId === item.id}
                title="Regenerate PDF report from this device data"
              >
                Regenerate PDF
              </Button>
            ] : []),
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
                className={styles.avatarBackground}
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
                  {formatDate(item.uploadedAt)}
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
