import React, { useEffect, useState } from 'react';
import { Button, Space, Spin, Typography } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { highlightXml } from './highlightXml';
import styles from './AttachmentPreview.module.css';

const { Text } = Typography;

export type TextPreviewKind = 'json' | 'xml' | 'text';

const JSON_TOKEN =
  /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],])/g;

const JSON_COLORS = {
  key: '#9CDCFE',
  string: '#CE9178',
  number: '#B5CEA8',
  literal: '#569CD6',
  punctuation: '#FFD700',
};

const highlightJson = (json: string): React.ReactNode =>
  json.split('\n').map((line, lineIdx) => {
    const parts: React.ReactNode[] = [];
    let last = 0;
    for (const match of line.matchAll(JSON_TOKEN)) {
      const [full, str, colon, num, literal] = match;
      const start = match.index ?? 0;
      if (start > last) parts.push(line.slice(last, start));
      const key = `${lineIdx}-${start}`;
      if (str !== undefined) {
        parts.push(
          <span key={key} style={{ color: colon ? JSON_COLORS.key : JSON_COLORS.string }}>{str}</span>,
        );
        if (colon) parts.push(colon);
      } else {
        const color =
          num !== undefined
            ? JSON_COLORS.number
            : literal !== undefined
              ? JSON_COLORS.literal
              : JSON_COLORS.punctuation;
        parts.push(<span key={key} style={{ color }}>{full}</span>);
      }
      last = start + full.length;
    }
    if (last < line.length) parts.push(line.slice(last));
    return <div key={lineIdx}>{parts.length > 0 ? parts : ' '}</div>;
  });

const formatXml = (xml: string): string => {
  let formatted = '';
  let indent = 0;
  const tab = '  ';

  xml.split(/>\s*</).forEach((node) => {
    if (node.match(/^\/\w/)) indent--;
    formatted += tab.repeat(indent) + '<' + node + '>\n';
    if (node.match(/^<?\w[^>]*[^/]$/)) indent++;
  });

  return formatted.substring(1, formatted.length - 2);
};

const prettify = (text: string, kind: TextPreviewKind): string => {
  try {
    if (kind === 'json') return JSON.stringify(JSON.parse(text), null, 2);
    if (kind === 'xml') return formatXml(text);
  } catch {
    // Invalid content is shown as-is.
  }
  return text;
};

const readBlobText = (blob: Blob): Promise<string> =>
  typeof blob.text === 'function'
    ? blob.text()
    : new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.readAsText(blob);
      });

interface TextAttachmentPreviewProps {
  blob: Blob | null;
  kind: TextPreviewKind;
}

/**
 * Shows JSON, XML and plain-text attachments. Content only ever reaches the
 * DOM as React text nodes, so markup inside a file is never parsed.
 */
export const TextAttachmentPreview: React.FC<TextAttachmentPreviewProps> = ({ blob, kind }) => {
  const { t } = useTranslation(['medical']);
  const [content, setContent] = useState<React.ReactNode>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!blob) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    readBlobText(blob)
      .then((text) => {
        if (cancelled) return;
        const pretty = prettify(text, kind);
        setContent(
          kind === 'json' ? highlightJson(pretty) : kind === 'xml' ? highlightXml(pretty) : pretty,
        );
      })
      .catch((error) => {
        console.error('Failed to load file content:', error);
        if (!cancelled) setContent(t('medical:detail.fileContentLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [blob, kind]);

  if (loading) {
    return <Spin />;
  }

  return (
    <div className={styles.codePreview}>
      <pre className={styles.codeBlock}>{content}</pre>
    </div>
  );
};

interface HtmlAttachmentNoticeProps {
  onOpenExternally: () => void;
}

export const HtmlAttachmentNotice: React.FC<HtmlAttachmentNoticeProps> = ({ onOpenExternally }) => {
  const { t } = useTranslation(['medical']);
  return (
    <Space direction="vertical">
      <Text type="secondary">{t('medical:detail.htmlNotPreviewed')}</Text>
      <Button size="small" icon={<ExportOutlined />} onClick={onOpenExternally}>
        {t('medical:detail.openExternally')}
      </Button>
    </Space>
  );
};
