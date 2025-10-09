import React, { useState } from 'react';
import { Upload, Button, App } from 'antd';
import { UploadOutlined, InboxOutlined } from '@ant-design/icons';
import { useUploadAttachment } from '@/hooks/useMedicalRecords';
import { MedicalService } from '@/services/medicalService';
import type { UploadFile, UploadProps } from 'antd/es/upload';
import styles from './FileUpload.module.css';

const { Dragger } = Upload;

interface FileUploadProps {
  medicalRecordId: number;
  onUploadSuccess?: () => void;
  isDragger?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({
  medicalRecordId,
  onUploadSuccess,
  isDragger = false,
}) => {
  const { notification } = App.useApp();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const uploadMutation = useUploadAttachment();

  const beforeUpload = (file: File) => {
    // Validate file
    const error = MedicalService.validateFile(file);
    if (error) {
      notification.error({ message: "Error", description: error, placement: "bottomRight", duration: 5 });
      return false;
    }

    setFileList(prev => [...prev, file as any]);
    return false; // Prevent automatic upload
  };

  const handleUpload = async () => {
    if (fileList.length === 0) {
      notification.warning({
        message: 'Warning',
        description: 'Please select files to upload',
        placement: 'bottomRight',
        duration: 4,
      });
      return;
    }

    setUploading(true);
    const uploadPromises = fileList.map(file =>
      uploadMutation.mutateAsync({
        medicalRecordId,
        file: file as any as File,
      })
    );

    try {
      await Promise.all(uploadPromises);
      notification.success({
        message: 'Success',
        description: `${fileList.length} file(s) uploaded successfully`,
        placement: 'bottomRight',
        duration: 3,
      });
      setFileList([]);
      onUploadSuccess?.();
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = (file: UploadFile) => {
    setFileList(prev => prev.filter(f => f.uid !== file.uid));
  };

  const uploadProps: UploadProps = {
    beforeUpload,
    onRemove: handleRemove,
    fileList,
    multiple: true,
    accept: '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif,.bmp',
  };

  if (isDragger) {
    return (
      <div>
        <Dragger {...uploadProps}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Click or drag files to this area to upload</p>
          <p className="ant-upload-hint">
            Support for PDF, Word, Excel, images and text files. Max 100MB per file.
          </p>
        </Dragger>
        {fileList.length > 0 && (
          <div className={styles.fileList}>
            <Button
              type="primary"
              onClick={handleUpload}
              loading={uploading}
            >
              {uploading ? 'Uploading' : `Upload ${fileList.length} file(s)`}
            </Button>
            <Button
              className={styles.buttonSpacing}
              onClick={() => setFileList([])}
              disabled={uploading}
            >
              Clear
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <Upload {...uploadProps}>
        <Button icon={<UploadOutlined />}>Select Files</Button>
      </Upload>
      {fileList.length > 0 && (
        <div className={styles.fileList}>
          <Button
            type="primary"
            onClick={handleUpload}
            loading={uploading}
          >
            {uploading ? 'Uploading' : `Upload ${fileList.length} file(s)`}
          </Button>
          <Button
            className={styles.buttonSpacing}
            onClick={() => setFileList([])}
            disabled={uploading}
          >
            Clear
          </Button>
        </div>
      )}
    </div>
  );
};

export default FileUpload;