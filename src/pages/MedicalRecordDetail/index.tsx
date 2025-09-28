import React, { useMemo, useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Layout, Card, Typography, Space, Button, Alert, Spin, Table, Tag, Descriptions, App, Switch, Breadcrumb } from 'antd';
import { invoke, convertFileSrc } from '@tauri-apps/api/tauri';
import { useTranslation } from 'react-i18next';
import PdfInlineViewer from '@/components/PdfInlineViewer';
import PdfMultiPagePreview from '@/components/PdfMultiPagePreview';
import { HomeOutlined, ArrowLeftOutlined, EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { useMedicalRecord, useUpdateMedicalRecord, useCurrencies } from '@/hooks/useMedicalRecords';
import { MedicalService } from '@/services/medicalService';
import MedicalRecordForm from '@/components/MedicalRecordModal/MedicalRecordForm';
// Inline PDF viewer handled by PdfInlineViewer with reliable fallbacks
import type { MedicalRecord, MedicalRecordHistory, UpdateMedicalRecordInput } from '@/types/medical';

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;

export const MedicalRecordDetailPage: React.FC = () => {
  const { t } = useTranslation(['medical', 'common', 'navigation']);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const recordId = parseInt(id || '0', 10);
  const attachmentIdToExpand = searchParams.get('attachmentId');
  const { message } = App.useApp();

  const { data, isLoading, isError, error, refetch } = useMedicalRecord(recordId, true);
  const updateMutation = useUpdateMedicalRecord();
  const { data: currencies } = useCurrencies();
  const [isEditing, setIsEditing] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<MedicalRecordHistory | null>(null);
  const [showDiffs, setShowDiffs] = useState(false);
  const [displayRecord, setDisplayRecord] = useState<MedicalRecord | null>(null);

  const record = data?.record;
  const history = (data?.history || []) as MedicalRecordHistory[];
  const attachments = (data as any)?.attachments || [];

  const sortedHistory = useMemo(() => {
    const seen = new Set<string>();
    return history
      .filter(h => {
        const key = `${h.version}|${h.changedAt}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const ad = new Date(a.changedAt).getTime();
        const bd = new Date(b.changedAt).getTime();
        if (!isNaN(ad) && !isNaN(bd) && bd !== ad) return bd - ad;
        return (b.version || 0) - (a.version || 0);
      });
  }, [history]);

  function parseMaybeJson(v: any): any | null {
    if (!v) return null;
    if (typeof v === 'string') {
      try { return JSON.parse(v); } catch { return null; }
    }
    if (typeof v === 'object') return v;
    return null;
  }

  const buildSnapshotForVersion = (targetVersion: number | null) => {
    if (!record) return null;
    if (!targetVersion) return record;
    let snap: any = { ...record };
    const withDiffs = sortedHistory.filter(h => (h as any).oldValues || (h as any).newValues);
    if (withDiffs.length === 0) return snap;
    for (const h of withDiffs) {
      if (h.version > targetVersion) {
        const oldVals = parseMaybeJson((h as any).oldValues);
        if (oldVals) {
          Object.keys(oldVals).forEach(k => {
            (snap as any)[camelize(k)] = oldVals[k];
          });
        }
      }
    }
    return snap as MedicalRecord;
  };

  const currentTargetVersion = selectedVersion ?? record?.version ?? null;
  const prevVersion = useMemo(() => {
    if (!currentTargetVersion) return null;
    const lower = sortedHistory.find(h => h.version < currentTargetVersion);
    return lower ? lower.version : null;
  }, [sortedHistory, currentTargetVersion]);

  const snapshot = useMemo(() => buildSnapshotForVersion(currentTargetVersion), [currentTargetVersion, sortedHistory]);
  const prevSnapshot = useMemo(() => buildSnapshotForVersion(prevVersion), [prevVersion, sortedHistory]);
  // Auto-select the latest version on first load if none selected
  useEffect(() => {
    if (!selectedVersion && sortedHistory.length > 0) {
      setSelectedVersion(sortedHistory[0].version);
      setSelectedHistory(sortedHistory[0] as any);
    }
  }, [sortedHistory, selectedVersion]);
  useEffect(() => {
    if (selectedVersion) {
      setShowDiffs(true);
    }
  }, [selectedVersion]);

  // Load concrete snapshot from backend when selecting a version
  useEffect(() => {
    let active = true;
    (async () => {
      if (!record) return;
      if (!selectedVersion) {
        setDisplayRecord(record);
        return;
      }
      try {
        const snap = await MedicalService.getMedicalRecordAtVersion(record.id, selectedVersion);
        if (active) {
          setDisplayRecord(snap);
        }
      } catch (e) {
        if (active) setDisplayRecord(snapshot || record);
      }
    })();
    return () => { active = false; };
  }, [record, selectedVersion, snapshot]);

  // Selected history entry and parsed values for inline diffs
  const selectedEntry = useMemo(() => {
    if (!selectedVersion) return null;
    return sortedHistory.find(h => h.version === selectedVersion) || null;
  }, [sortedHistory, selectedVersion]);
  const selectedOld = useMemo(() => parseMaybeJson((selectedEntry as any)?.oldValues), [selectedEntry]);
  const selectedNew = useMemo(() => parseMaybeJson((selectedEntry as any)?.newValues), [selectedEntry]);

  // useEffect removed - was only used for debug logging

  function camelize(s: string) {
    return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  }

  const columns = [
    {
      title: t('medical:fields.version'),
      dataIndex: 'version',
      key: 'version',
      width: 120,
      render: (_: any, row: any) => (
        <Button type="link" size="small" onClick={() => { setSelectedVersion(row.version); setSelectedHistory(row as any); setShowDiffs(true); }}>
          v{row.version}
        </Button>
      )
    },
    { title: t('medical:detail.changedAt'), dataIndex: 'changedAt', key: 'changedAt', render: (v: string) => new Date(v).toLocaleString() },
    { title: t('medical:detail.changedBy'), dataIndex: 'changedBy', key: 'changedBy', render: (v: string) => v || '-' },
    {
      title: t('medical:detail.fields'), key: 'fields', render: (_: any, row: any) => {
        const cf = (row as any).changedFields;
        let fields: string[] = [];
        if (Array.isArray(cf)) fields = cf;
        else if (typeof cf === 'string' && cf.trim().length > 0) fields = cf.split(',').map((s: string) => s.trim());
        return fields.length > 0 ? fields.map(f => <Tag key={f}>{f}</Tag>) : <Text type="secondary">-</Text>;
      }
    }
  ];

  // Attachments table state for inline preview
  // Use string keys to match Table rowKey (String(id))
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [previewBlobs, setPreviewBlobs] = useState<Record<string, Blob>>({});
  const [previewKinds, setPreviewKinds] = useState<Record<string, 'pdfium' | 'blob' | 'other'>>({});

  // Track if we need to auto-expand an attachment
  const [shouldAutoExpand, setShouldAutoExpand] = useState(true);

  const isPreviewable = (mime?: string, name?: string) => {
    if (mime) {
      if (mime.startsWith('image/')) return true;
      if (mime === 'application/pdf') return true;
      if (mime.startsWith('text/')) return true;
    }
    if (name) {
      const ext = String(name).split('.').pop()?.toLowerCase();
      if (!ext) return false;
      if (["png","jpg","jpeg","gif","bmp","svg"].includes(ext)) return true;
      if (ext === 'pdf') return true;
      if (["txt","csv","md","log"].includes(ext)) return true;
    }
    return false;
  };

  const onExpand = async (expanded: boolean, row: any) => {
    const key = String(row.id);
    if (expanded) {
      if (!isPreviewable(row.mimeType, row.originalName)) {
        message.info(t('medical:detail.previewNotAvailable'));
        return;
      }
      // Only one open at a time
      setExpandedRowKeys([key]);
      // Create blob URL if not already present
      if (!previewUrls[key]) {
        try {
          const isPdf = (row.mimeType || '').toLowerCase() === 'application/pdf' || String(row.originalName).toLowerCase().endsWith('.pdf');
          const isTauri = typeof (window as any).__TAURI__ !== 'undefined';
          if (isPdf && isTauri) {
            // Try fast, reliable PDFium PNG preview (requires system PDFium for now)
            try {
              const pngPath = await MedicalService.renderPdfAttachmentThumbnail(row.id, 1, 900);
              const { readBinaryFile } = await import('@tauri-apps/api/fs');
              const bytes = await readBinaryFile(pngPath);
              const blob = new Blob([new Uint8Array(bytes as any)], { type: 'image/png' });
              const dataUrl: string = await new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onerror = () => reject(fr.error);
                fr.onload = () => resolve(fr.result as string);
                fr.readAsDataURL(blob);
              });
              setPreviewUrls(prev => ({ ...prev, [key]: dataUrl }));
              setPreviewKinds(prev => ({ ...prev, [key]: 'pdfium' }));
              return;
            } catch (pdfiumErr: any) {
              // Fall through to pdf.js path
            }
          }
          const blob = await MedicalService.downloadAttachment(row.id);
          const url = URL.createObjectURL(blob);
          setPreviewUrls(prev => ({ ...prev, [key]: url }));
          setPreviewBlobs(prev => ({ ...prev, [key]: blob }));
          setPreviewKinds(prev => ({ ...prev, [key]: 'blob' }));
        } catch (e: any) {
          message.error(e?.message || 'Failed to load preview');
        }
      }
    } else {
      setExpandedRowKeys([]);
      // Revoke URL to free memory
      const url = previewUrls[key];
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
        setPreviewUrls(prev => {
          const copy = { ...prev } as Record<string, string>;
          delete copy[key];
          return copy;
        });
      }
      if (previewBlobs[key]) {
        setPreviewBlobs(prev => {
          const copy = { ...prev } as Record<string, Blob>;
          delete copy[key];
          return copy;
        });
      }
      if (previewKinds[key]) {
        setPreviewKinds(prev => {
          const copy = { ...prev } as Record<string, 'pdfium' | 'blob' | 'other'>;
          delete copy[key];
          return copy;
        });
      }
    }
  };

  // Auto-expand attachment if specified in URL
  useEffect(() => {
    if (attachmentIdToExpand && attachments.length > 0 && shouldAutoExpand) {
      const attachmentExists = attachments.some((att: any) => String(att.id) === attachmentIdToExpand);
      if (attachmentExists) {
        // Set expanded keys to include this attachment
        setExpandedRowKeys([attachmentIdToExpand]);
        // Find the attachment and trigger the expand
        const attachment = attachments.find((att: any) => String(att.id) === attachmentIdToExpand);
        if (attachment) {
          onExpand(true, attachment);
        }
        // Only auto-expand once
        setShouldAutoExpand(false);
      }
    }
  }, [attachmentIdToExpand, attachments, shouldAutoExpand]);

  if (!id || isNaN(recordId)) {
    return (
      <Content style={{ padding: 24, background: '#141414' }}>
        <Alert message={t('medical:detail.invalidRecordId')} type="error" showIcon />
      </Content>
    );
  } 

  if (isLoading) {
    return (
      <Content style={{ padding: 24, textAlign: 'center', background: '#141414', minHeight: '100vh' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: '#E6E6E6' }}>{t('medical:detail.loadingRecord')}</div>
      </Content>
    );
  }

  if (isError || !record) {
    return (
      <Content style={{ padding: 24, background: '#141414' }}>
        <Alert
          message={t('medical:messages.loadError')}
          description={error instanceof Error ? error.message : t('common:error')}
          type="error"
          showIcon
          action={<Button onClick={() => window.location.reload()}>{t('medical:actions.retry')}</Button>}
        />
      </Content>
    );
  }

  return (
    <Content style={{ padding: 24, background: '#141414', minHeight: '100vh' }}>
      {(() => {/* compute display values */})()}
      {(() => {
        // Prefer selected version's snapshot newValues if available
        // Fallback to computed snapshot, then to current record
        // Types in snapshots are snake_case; current record is camelCase
        // We keep them separate and choose in render below via local constants
        return null;
      })()}
      {
        // Local helpers for display values
      }
      {(() => {
        return null;
      })()}
      <div style={{ marginBottom: 16 }}>
        <Breadcrumb
          items={[
            {
              title: <Link to="/" style={{ color: '#4A90E2' }}><HomeOutlined /> {t('navigation:home')}</Link>,
            },
            {
              title: <Link to="/" style={{ color: '#4A90E2' }}>{t('navigation:dashboard')}</Link>,
            },
            {
              title: record?.patientId ? (
                <Link
                  to={`/patients/${record.patientId}`}
                  style={{ color: '#4A90E2' }}
                  onClick={(e) => {
                    // Save the current tab state so we return to the Medical History tab
                    sessionStorage.setItem(
                      `patient-detail-active-tab-${record.patientId}`,
                      'medical-history'
                    );
                  }}
                >
                  {t('navigation:patients')}
                </Link>
              ) : (
                <span style={{ color: '#E6E6E6' }}>{t('navigation:patients')}</span>
              ),
            },
            {
              title: <span style={{ color: '#E6E6E6' }}>{t('medical:title')}</span>,
            },
          ]}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => {
            if (record?.patientId) {
              // Save the tab state before navigating back
              sessionStorage.setItem(
                `patient-detail-active-tab-${record.patientId}`,
                'medical-history'
              );
              navigate(`/patients/${record.patientId}`);
            } else {
              navigate(-1);
            }
          }}
        >
          {t('medical:detail.backToPatient')}
        </Button>
      </div>

      <Card
        title={<Title level={4} style={{ margin: 0, color: '#E6E6E6' }}>{
          (displayRecord?.name) || record.name
        }</Title>}
        extra={
          !isEditing ? (
            <Button type="primary" icon={<EditOutlined />} onClick={() => setIsEditing(true)}>{t('common:edit')}</Button>
          ) : undefined
        }
      >
        <div style={{ marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
          <Space>
            <Switch
              size="small"
              checked={showDiffs}
              onChange={setShowDiffs}
              disabled={!selectedEntry}
            />
            <Text type={selectedEntry ? 'secondary' : undefined}>{t('medical:detail.showDifferences')}</Text>
          </Space>
        </div>
        {!isEditing ? (
          <>
            {(() => {
              const typeVal = displayRecord?.recordType || record.recordType;
              const nameVal = displayRecord?.name || record.name;
              const procVal = typeVal === 'procedure' ? nameVal : undefined;
              const priceVal = (typeof displayRecord?.price !== 'undefined') ? displayRecord?.price : record.price;
              const currencyId = displayRecord?.currencyId || record.currencyId;
              const descVal = displayRecord?.description || record.description;

              // Get currency symbol
              const getCurrencyDisplay = () => {
                if (!currencyId || !currencies) return '';
                const currency = currencies.find(c => c.id === currencyId);
                return currency ? `${currency.symbol || currency.code} ` : '';
              };
              return (
                <>
                  <Descriptions column={2} size="middle">
                    <Descriptions.Item label={t('medical:fields.recordType')}>
                      <Tag color={typeVal === 'procedure' ? 'blue' : 'green'}>
                        {typeVal === 'procedure' ? t('medical:recordTypes.procedure') : t('medical:recordTypes.note')}
                      </Tag>
                    </Descriptions.Item>
                    {typeVal === 'procedure' && (
                      <Descriptions.Item label={t('medical:fields.procedureName')}>{procVal}</Descriptions.Item>
                    )}
                    {typeof priceVal !== 'undefined' && (
                      <Descriptions.Item label={t('medical:fields.price')}>
                        <Text strong style={{ color: '#E6E6E6' }}>
                          {getCurrencyDisplay()}{priceVal}
                        </Text>
                      </Descriptions.Item>
                    )}
                    <Descriptions.Item label={t('medical:fields.createdAt')}>{new Date(record.createdAt).toLocaleString()}</Descriptions.Item>
                    <Descriptions.Item label={t('medical:fields.updatedAt')}>{new Date(((selectedEntry as any)?.changedAt) || record.updatedAt).toLocaleString()}</Descriptions.Item>
                    <Descriptions.Item label={t('medical:fields.version')}>{selectedVersion || record.version}</Descriptions.Item>
                  </Descriptions>

                  <div style={{ marginTop: 16 }}>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>{t('medical:fields.description')}</Text>
                    <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#E6E6E6' }}>{descVal as any}</Paragraph>
                  </div>

                  {/* Attachments now rendered as separate Card below */}
                </>
              );
            })()}
            {/* Single snapshot-driven block only */}
          </>
        ) : (
          <MedicalRecordForm
            initialValues={record}
            onSubmit={async (values: UpdateMedicalRecordInput) => {
              try {
                await updateMutation.mutateAsync({ recordId: record.id, updates: values });
                setIsEditing(false);
                setSelectedVersion(null);
                await refetch();
              } catch (e) {
                // error messages are handled in the hook; keep UI responsive
              }
            }}
            onCancel={() => setIsEditing(false)}
            loading={updateMutation.isPending}
            isEdit={true}
            patientId={record.patientId}
            recordId={record.id}
          />
        )}
      </Card>

      {/* Attachments Card */}
      <Card title={t('medical:fields.attachments')} style={{ marginTop: 16 }}>
        <Table
          size="small"
          rowKey={(r: any) => String(r.id)}
          dataSource={attachments}
          pagination={false}
          locale={{
            emptyText: t('medical:detail.noAttachments') || t('common:noData')
          }}
          onRow={(record: any) => ({
            onClick: () => {
              if (isPreviewable(record.mimeType, record.originalName)) {
                const open = expandedRowKeys.includes(String(record.id));
                onExpand(!open, record);
              }
            },
            style: isPreviewable(record.mimeType, record.originalName) ? { cursor: 'pointer' } : {}
          })}
          expandable={{
            expandedRowKeys,
            onExpand,
            showExpandColumn: false,
            expandedRowRender: (row: any) => {
              const key = String(row.id);
              const url = previewUrls[key];
              const pblob = previewBlobs[key];
              const mime = (row.mimeType || '').toLowerCase();
              const isPdf = mime === 'application/pdf' || String(row.originalName).toLowerCase().endsWith('.pdf');
              const isTauri = typeof (window as any).__TAURI__ !== 'undefined';
              if (!isPreviewable(mime, row.originalName)) {
                return <Text type="secondary">{t('medical:detail.previewNotAvailable')}</Text>;
              }
              // PDF branch first
              if (isPdf) {
                if (isTauri) {
                  // In Tauri prefer PDFium multi-page preview if available
                  if (previewKinds[key] === 'pdfium' && url) {
                    return <PdfMultiPagePreview attachmentId={row.id} initialPageUrl={url} />;
                  }
                  // Otherwise fall back to pdf.js inline viewer using the Blob
                  if (pblob) {
                    return <PdfInlineViewer blob={pblob} fileName={row.originalName} />;
                  }
                  return <Text type="secondary">{t('medical:detail.loadingPreview')}</Text>;
                } else {
                  // In browsers, prefer native PDF viewer for reliability
                  if (url) return <iframe src={url} title={row.originalName} style={{ width: '100%', height: 480, border: 0 }} />;
                  if (!pblob) return <Text type="secondary">{t('medical:detail.loadingPreview')}</Text>;
                  return <PdfInlineViewer blob={pblob} fileName={row.originalName} />;
                }
              }
              if (!url) {
                return <Text type="secondary">{t('medical:detail.loadingPreview')}</Text>;
              }
              if (mime.startsWith('image/')) {
                return <img src={url} alt={row.originalName} style={{ maxWidth: '100%', display: 'block' }} />;
              }
              if (mime.startsWith('text/')) {
                return <iframe src={url} title={row.originalName} style={{ width: '100%', height: 480, border: 0 }} />;
              }
              return <Text type="secondary">{t('medical:detail.previewNotAvailable')}</Text>;
            }
          }}
          columns={[
            {
              title: t('medical:detail.file'),
              dataIndex: 'originalName',
              key: 'originalName',
              render: (v: string, row: any) => (
                <span style={{
                  color: '#E6E6E6',
                  textDecoration: isPreviewable(row.mimeType, row.originalName) ? 'underline' : 'none'
                }}>
                  {v}
                </span>
              )
            },
            {
              title: t('medical:detail.size'),
              dataIndex: 'fileSize',
              key: 'fileSize',
              width: 140,
              render: (size?: number) => MedicalService.formatFileSize(size)
            },
            {
              title: t('medical:detail.uploaded'),
              dataIndex: 'uploadedAt',
              key: 'uploadedAt',
              width: 200,
              render: (v: string) => new Date(v).toLocaleString()
            },
            {
              title: t('common:actions.actions') || t('common:actionsLabel'),
              key: 'actions',
              width: 150,
              render: (_: any, row: any) => (
                <Space>
                  <Button
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      MedicalService.openAttachmentExternally(row.id);
                    }}
                  >
                    {t('medical:detail.openInApp')}
                  </Button>
                  <Button
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      MedicalService.saveAttachmentAs(row.id, row.originalName);
                    }}
                  >
                    {t('common:download')}
                  </Button>
                </Space>
              )
            }
          ] as any}
        />
      </Card>

      <Card title={t('medical:detail.versionHistory')} style={{ marginTop: 16 }}>
        <Table
          dataSource={sortedHistory}
          rowKey={(r) => String(r.id)}
          columns={columns as any}
          size="small"
          onRow={(row) => ({ onClick: () => { setSelectedVersion(row.version); setSelectedHistory(row as any); } })}
          pagination={false}
        />
        {sortedHistory.length === 0 && (
          <Text type="secondary">{t('medical:detail.noHistory')}</Text>
        )}
      </Card>
    </Content>
  );
};

export default MedicalRecordDetailPage;
