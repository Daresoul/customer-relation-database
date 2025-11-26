import React, { useState, useEffect } from 'react';
import { Modal, Spin, Typography, Button, Space, message } from 'antd';
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/tauri';
import styles from './TextFileViewer.module.css';

const { Text } = Typography;

interface TextFileViewerProps {
  open: boolean;
  onClose: () => void;
  attachmentId: number;
  fileName: string;
  mimeType?: string;
}

const TextFileViewer: React.FC<TextFileViewerProps> = ({
  open,
  onClose,
  attachmentId,
  fileName,
  mimeType,
}) => {
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState<string>('');

  useEffect(() => {
    console.log('📄 TextFileViewer effect:', { open, attachmentId, fileName });
    if (open && attachmentId) {
      console.log('📥 Loading file content...');
      loadFileContent();
    }
  }, [open, attachmentId]);

  const loadFileContent = async () => {
    try {
      setLoading(true);
      const fileData = await invoke<number[]>('get_attachment_content', {
        attachmentId,
      });

      // Convert byte array to string
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(new Uint8Array(fileData));

      // Prettify if JSON or XML
      const prettified = prettifyContent(text, mimeType, fileName);
      setContent(prettified);
    } catch (error) {
      console.error('Failed to load file content:', error);
      message.error('Failed to load file content');
      setContent('Error loading file content');
    } finally {
      setLoading(false);
    }
  };

  const prettifyContent = (text: string, mimeType?: string, fileName?: string): string => {
    try {
      // Check if it's JSON
      const isJson = mimeType === 'application/json' || fileName.toLowerCase().endsWith('.json');

      if (isJson) {
        const parsed = JSON.parse(text);
        return JSON.stringify(parsed, null, 2);
      }

      // Check if it's XML
      const isXml = mimeType?.includes('xml') || fileName.toLowerCase().endsWith('.xml');

      if (isXml) {
        // Simple XML formatting (could be enhanced with a library)
        return formatXml(text);
      }

      // Return as-is for other text files
      return text;
    } catch (error) {
      // If parsing fails, return original
      return text;
    }
  };

  const formatXml = (xml: string): string => {
    let formatted = '';
    let indent = 0;
    const tab = '  ';

    xml.split(/>\s*</).forEach((node) => {
      if (node.match(/^\/\w/)) indent--; // Closing tag
      formatted += tab.repeat(indent) + '<' + node + '>\n';
      if (node.match(/^<?\w[^>]*[^\/]$/)) indent++; // Opening tag
    });

    return formatted.substring(1, formatted.length - 2);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    message.success('Content copied to clipboard');
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success('File downloaded');
  };

  return (
    <Modal
      title={fileName}
      open={open}
      onCancel={onClose}
      width={900}
      footer={
        <Space>
          <Button icon={<CopyOutlined />} onClick={handleCopy}>
            Copy to Clipboard
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleDownload}>
            Download
          </Button>
          <Button onClick={onClose}>Close</Button>
        </Space>
      }
    >
      <Spin spinning={loading}>
        <div className={styles.contentContainer}>
          <pre className={styles.codeBlock}>
            <code>{content}</code>
          </pre>
        </div>
      </Spin>
    </Modal>
  );
};

export default TextFileViewer;
