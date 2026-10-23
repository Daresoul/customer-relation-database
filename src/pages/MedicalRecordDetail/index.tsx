import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Layout, Card, Typography, Space, Button, Alert, Spin, Table, Tag, Descriptions, App, Switch, Breadcrumb, Drawer, Popconfirm } from 'antd';
import { invoke, convertFileSrc } from '@/services/invoke';
import { useTranslation } from 'react-i18next';
import PdfInlineViewer from '@/components/PdfInlineViewer';
import PdfMultiPagePreview from '@/components/PdfMultiPagePreview';
import { getAttachmentPreviewKind, HtmlAttachmentNotice, TextAttachmentPreview } from '@/components/AttachmentPreview';
import RecentDeviceFiles from '@/components/RecentDeviceFiles';
import { HomeOutlined, ArrowLeftOutlined, EditOutlined, SaveOutlined, CloseOutlined, ReloadOutlined, HistoryOutlined, PrinterOutlined } from '@ant-design/icons';
import { useMedicalRecord, useUpdateMedicalRecord, useCurrencies } from '@/hooks/useMedicalRecords';
import { usePatientDetail } from '@/hooks/usePatient';
import { MedicalService } from '@/services/medicalService';
import { isTauri as detectTauri } from '@/utils/isTauri';
import PrintReportModal from '@/components/PrintReportModal';
import type { PatientOverrides, PatientInfo } from '@/types/report';
import type { MedicalAttachment } from '@/types/medical';
import MedicalRecordForm from '@/components/MedicalRecordModal/MedicalRecordForm';
import DiagnosisTagList from '@/components/DiagnosisTagList';
import { DIAGNOSES_KEYS } from '@/hooks/useDiagnoses';
import { useQueryClient } from '@tanstack/react-query';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
// Inline PDF viewer handled by PdfInlineViewer with reliable fallbacks
import type { MedicalRecord, MedicalRecordHistory, UpdateMedicalRecordInput } from '@/types/medical';
import type { MedicalRecordLineItem } from '@/types/lineItem';
import { DeviceStatusInline } from '@/components/DeviceStatusBar';
import MoveLabResultModal from '@/components/LabInbox/MoveLabResultModal';
import RecordLabValues from '@/components/LabResults/RecordLabValues';
import { labInboxService } from '@/services/labInboxService';
import { invalidateLabInboxData } from '@/hooks/invalidation';
import { InvoiceSummaryRows } from '@/components/InvoiceSummaryRows';
import styles from './MedicalRecordDetailPage.module.css';

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;

export const MedicalRecordDetailPage: React.FC = () => {
  const { t } = useTranslation(['medical', 'common', 'navigation']);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const recordId = parseInt(id || '0', 10);
  const attachmentIdToExpand = searchParams.get('attachmentId');
  const { notification } = App.useApp();

  const { data, isLoading, isError, error, refetch } = useMedicalRecord(recordId, true);
  const updateMutation = useUpdateMedicalRecord();
  const queryClient = useQueryClient();
  const { data: currencies } = useCurrencies();
  const [isEditing, setIsEditing] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  useEffect(() => {
    if (!isEditing) setEditDirty(false);
  }, [isEditing]);
  const confirmLeave = useUnsavedChangesGuard(isEditing && editDirty);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<MedicalRecordHistory | null>(null);
  const [showDiffs, setShowDiffs] = useState(false);
  const [displayRecord, setDisplayRecord] = useState<MedicalRecord | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<number | null>(null);
  const [movingAttachment, setMovingAttachment] = useState<MedicalAttachment | null>(null);
  const [recentFilesDrawerOpen, setRecentFilesDrawerOpen] = useState(false);
  const [refreshRecentFiles, setRefreshRecentFiles] = useState<(() => void) | null>(null);
  const [printReportModalOpen, setPrintReportModalOpen] = useState(false);

  const record = data?.record;
  const history = (data?.history || []) as MedicalRecordHistory[];
  const attachments = (data as any)?.attachments || [];

  // Split attachments into two groups so the user can find documents
  // and raw device data separately:
  //   - documents:   generated PDFs (simple report, pharmacy note,
  //                  invoice, configured combined report) AND any
  //                  files the user manually uploaded (everything
  //                  that isn't a `test_result` from the device
  //                  watcher).
  //   - deviceData:  raw test-result files captured by the device
  //                  watcher (XML, HL7, etc.) — the source data that
  //                  the generated PDFs were built from.
  // Both groups render in the same kind of table so behaviour is
  // consistent; they just sit in two separate cards.
  const documentAttachments = useMemo(
    () => attachments.filter((a: any) => a.attachmentType !== 'test_result'),
    [attachments],
  );
  const deviceDataAttachments = useMemo(
    () => attachments.filter((a: any) => a.attachmentType === 'test_result'),
    [attachments],
  );

  // Fetch patient info for print report modal
  const { data: patientDetail } = usePatientDetail(record?.patientId || 0);

  // Compute patient info for the print report modal
  const patientInfo = useMemo<PatientInfo>(() => {
    if (!patientDetail) {
      return {
        name: '',
        owner: '',
        species: '',
        gender: '',
        dateOfBirth: undefined,
        microchipId: undefined,
      };
    }

    // Get owner name from household primary contact or household name
    let ownerName = '';
    if (patientDetail.household?.primaryContact) {
      const pc = patientDetail.household.primaryContact;
      ownerName = [pc.firstName, pc.lastName].filter(Boolean).join(' ');
    } else if (patientDetail.household?.householdName) {
      ownerName = patientDetail.household.householdName;
    }

    return {
      name: patientDetail.name || '',
      owner: ownerName,
      species: patientDetail.speciesName || patientDetail.species || '',
      gender: patientDetail.gender || '',
      dateOfBirth: patientDetail.dateOfBirth,
      microchipId: patientDetail.microchipId,
    };
  }, [patientDetail]);

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
  // When the record's version increases (= an update just happened and
  // refetch brought back a new version), clear the manual version selection
  // so the auto-select effect below re-picks the new latest. Without this,
  // selectedVersion would stay pinned to the previous latest forever, and
  // the rendered description would not reflect the just-saved value until
  // the user reloads. Track via ref to detect monotonic increases.
  const lastSeenVersion = useRef<number | null>(null);
  useEffect(() => {
    if (!record) return;
    if (lastSeenVersion.current !== null && record.version > lastSeenVersion.current) {
      setSelectedVersion(null);
      setSelectedHistory(null);
    }
    lastSeenVersion.current = record.version;
  }, [record?.version]);

  // Auto-select the latest version on first load (or after a reset above)
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
      // No version pinned, or pinned to the *current* record version → no need
      // to call the history snapshot IPC; the live `record` already is that
      // state. Avoids a race where a stale `selectedVersion` from before an
      // update would fetch the old snapshot even after refetch.
      if (!selectedVersion || selectedVersion === record.version) {
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

  const isPreviewable = (mime?: string, name?: string) =>
    getAttachmentPreviewKind(mime, name) !== 'none';

  // Check if there are any device data attachments that can be used to regenerate PDF
  // This includes test_result attachments and legacy files with device metadata (not PDFs)
  const hasDeviceDataAttachments = useMemo(() => {
    return attachments.some((att: MedicalAttachment) => {
      const hasDeviceMetadata = !!att.deviceType && !!att.deviceName;
      const isTestResult = att.attachmentType === 'test_result';
      const isLegacyDeviceFile = hasDeviceMetadata &&
        att.attachmentType !== 'generated_pdf' &&
        att.mimeType !== 'application/pdf';
      return isTestResult || isLegacyDeviceFile;
    });
  }, [attachments]);

  const handleRegeneratePdf = async () => {
    try {
      setRegeneratingId(-1); // Use -1 to indicate overall regeneration
      console.log('🔄 Regenerating PDF from all test_result attachments for medical record:', recordId);

      await invoke<MedicalAttachment>('regenerate_pdf_from_medical_record', {
        medicalRecordId: recordId,
      });

      notification.success({
        message: t('medical:detail.pdfRegenerated'),
        description: t('medical:detail.pdfRegeneratedDesc'),
        placement: 'bottomRight',
        duration: 5,
      });

      // Refresh the medical record to show the new attachment
      await refetch();
    } catch (error: any) {
      console.error('❌ Failed to regenerate PDF:', error);
      notification.error({
        message: t('medical:detail.pdfRegenerationFailed'),
        description: error?.toString() || t('medical:detail.unknownError'),
        placement: 'bottomRight',
        duration: 7,
      });
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleAddRecentFile = async (fileId: string, originalName: string) => {
    try {
      // Added as a lab result with its device type, so the lab report includes it
      await labInboxService.attach(fileId, recordId);
      invalidateLabInboxData(queryClient);
      try {
        await labInboxService.regenerateLabReport(recordId);
      } catch (pdfError) {
        notification.warning({
          message: t('medical:deviceImport.pdfGenerationFailed'),
          description: t('medical:deviceImport.pdfGenerationFailedDesc'),
          placement: 'bottomRight',
          duration: 5,
        });
      }

      notification.success({
        message: t('common:success'),
        description: t('medical:recentFiles.addedToRecord', { name: originalName }),
        placement: 'bottomRight',
        duration: 3,
      });

      setRecentFilesDrawerOpen(false);

      // Refresh to show the new attachment
      await refetch();

      // Refresh the recent files list to update the status
      if (refreshRecentFiles) {
        refreshRecentFiles();
      }
    } catch (error) {
      console.error('[MedicalRecordDetail] Failed to add recent file:', error);
      notification.error({
        message: t('common:error'),
        description: t('medical:recentFiles.addFromHistoryFailed'),
        placement: 'bottomRight',
        duration: 5,
      });
    }
  };

  const onExpand = async (expanded: boolean, row: any) => {
    const key = String(row.id);
    if (expanded) {
      if (!isPreviewable(row.mimeType, row.originalName)) {
        notification.info({ message: t('common:info'), description: t('medical:detail.previewNotAvailable'), placement: "bottomRight", duration: 3 });
        return;
      }
      // Only one open at a time
      setExpandedRowKeys([key]);
      // Create blob URL if not already present
      if (!previewUrls[key] && getAttachmentPreviewKind(row.mimeType, row.originalName) !== 'html') {
        try {
          const isPdf = (row.mimeType || '').toLowerCase() === 'application/pdf' || String(row.originalName).toLowerCase().endsWith('.pdf');
          const isTauri = detectTauri();
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
          notification.error({ message: t('common:error'), description: e?.message || t('medical:detail.previewLoadFailed'), placement: "bottomRight", duration: 5 });
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
      <Content className={styles.contentPadding}>
        <Alert message={t('medical:detail.invalidRecordId')} type="error" showIcon />
      </Content>
    );
  } 

  if (isLoading) {
    return (
      <Content className={styles.contentCenter}>
        <Spin size="large" />
        <div className={styles.loadingText}>{t('medical:detail.loadingRecord')}</div>
      </Content>
    );
  }

  if (isError || !record) {
    return (
      <Content className={styles.contentPadding}>
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

  /**
   * Render an Attachments table with the standard preview /
   * download / open-externally behaviour. Used twice below — once
   * for documents (generated PDFs + uploads) and once for raw
   * device data (test_result attachments) — so the table config
   * lives here in one place. Both calls share the expanded-row /
   * preview state by attachment id.
   */
  const handleDeleteAttachment = async (row: any) => {
    setDeletingAttachmentId(row.id);
    try {
      await MedicalService.deleteAttachment(row.id);
      // Collapse the row if its preview was expanded — the id no longer exists.
      setExpandedRowKeys(prev => prev.filter(k => k !== String(row.id)));
      notification.success({
        message: t('common:success'),
        description: t('medical:detail.attachmentDeleted', {
          defaultValue: 'File "{{name}}" was deleted.',
          name: row.originalName,
        }),
        placement: 'bottomRight',
        duration: 3,
      });
      await refetch();
    } catch (e: any) {
      notification.error({
        message: t('common:error'),
        description: e?.message || t('medical:detail.attachmentDeleteFailed', 'Failed to delete the file.'),
        placement: 'bottomRight',
        duration: 5,
      });
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  // A raw device result (not a generated PDF) that can be moved to another patient
  const isLabResult = (att: MedicalAttachment) =>
    att.attachmentType === 'test_result' ||
    (!!att.deviceType && !!att.deviceName && att.attachmentType !== 'generated_pdf' && att.mimeType !== 'application/pdf');

  const renderAttachmentsTable = (dataSource: any[], emptyText: string) => (
    <Table
      size="small"
      rowKey={(r: any) => String(r.id)}
      dataSource={dataSource}
      pagination={false}
      locale={{ emptyText }}
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
          const kind = getAttachmentPreviewKind(row.mimeType, row.originalName);
          const isTauri = detectTauri();
          if (kind === 'none') {
            return <Text type="secondary">{t('medical:detail.previewNotAvailable')}</Text>;
          }
          if (kind === 'html') {
            return <HtmlAttachmentNotice onOpenExternally={() => MedicalService.openAttachmentExternally(row.id)} />;
          }
          if (kind === 'pdf') {
            if (isTauri) {
              if (previewKinds[key] === 'pdfium' && url) {
                return <PdfMultiPagePreview attachmentId={row.id} initialPageUrl={url} />;
              }
              if (pblob) {
                return <PdfInlineViewer blob={pblob} fileName={row.originalName} attachmentId={row.id} />;
              }
              return <Text type="secondary">{t('medical:detail.loadingPreview')}</Text>;
            } else {
              if (url) return <iframe src={url} title={row.originalName} className={styles.iframe} />;
              if (!pblob) return <Text type="secondary">{t('medical:detail.loadingPreview')}</Text>;
              return <PdfInlineViewer blob={pblob} fileName={row.originalName} attachmentId={row.id} />;
            }
          }
          if (!url) {
            return <Text type="secondary">{t('medical:detail.loadingPreview')}</Text>;
          }
          if (kind === 'image') {
            return <img src={url} alt={row.originalName} className={styles.image} />;
          }
          return <TextAttachmentPreview blob={pblob} kind={kind} />;
        }
      }}
      columns={[
        {
          title: t('medical:detail.file'),
          dataIndex: 'originalName',
          key: 'originalName',
          render: (v: string, row: any) => (
            <span className={styles.attachmentLink} style={{
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
          title: t('common:actions.actions', { defaultValue: t('common:actionsLabel') }),
          key: 'actions',
          width: 250,
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
              {isLabResult(row) && (
                <Button
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMovingAttachment(row);
                  }}
                >
                  {t('devices:inbox.move')}
                </Button>
              )}
              <Popconfirm
                title={t('medical:detail.deleteAttachmentConfirm', 'Delete this file?')}
                description={t(
                  'medical:detail.deleteAttachmentDesc',
                  'The file will be removed from this record.',
                )}
                okText={t('common:buttons.delete', 'Delete')}
                okButtonProps={{ danger: true }}
                cancelText={t('common:buttons.cancel', 'Cancel')}
                onConfirm={() => handleDeleteAttachment(row)}
                onPopupClick={(e) => e.stopPropagation()}
              >
                <Button
                  size="small"
                  danger
                  loading={deletingAttachmentId === row.id}
                  onClick={(e) => e.stopPropagation()}
                >
                  {t('common:buttons.delete', 'Delete')}
                </Button>
              </Popconfirm>
            </Space>
          )
        }
      ] as any}
    />
  );

  return (
    <Content className={styles.contentMinHeight}>
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
      <div className={styles.breadcrumbContainer}>
        <div className={styles.breadcrumbRow}>
          <Breadcrumb
            items={[
              {
                title: (
                  <Link
                    to="/"
                    className={styles.breadcrumbLink}
                    onClick={(e) => {
                      e.preventDefault();
                      confirmLeave(() => navigate('/'));
                    }}
                  >
                    <HomeOutlined /> {t('navigation:home')}
                  </Link>
                ),
              },
              {
                title: record?.patientId ? (
                  <Link
                    to={`/patients/${record.patientId}`}
                    className={styles.breadcrumbLink}
                    onClick={(e) => {
                      e.preventDefault();
                      confirmLeave(() => {
                        // Save the current tab state so we return to the Medical History tab
                        sessionStorage.setItem(
                          `patient-detail-active-tab-${record.patientId}`,
                          'medical-history'
                        );
                        navigate(`/patients/${record.patientId}`);
                      });
                    }}
                  >
                    {t('navigation:patients')}
                  </Link>
                ) : (
                  <span className={styles.breadcrumbText}>{t('navigation:patients')}</span>
                ),
              },
              {
                title: <span className={styles.breadcrumbText}>{t('medical:title')}</span>,
              },
            ]}
          />
          <DeviceStatusInline />
        </div>
      </div>
      <div className={styles.breadcrumbContainer}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => confirmLeave(() => {
            if (record?.patientId) {
              // Save the tab state before navigating back
              sessionStorage.setItem(
                `patient-detail-active-tab-${record.patientId}`,
                'medical-history'
              );
              navigate(`/patients/${record.patientId}`);
            } else {
              navigate('/');
            }
          })}
        >
          {t('medical:detail.backToPatient')}
        </Button>
      </div>

      <Card
        title={<Title level={4} className={styles.titleZeroMargin}>{
          (displayRecord?.name) || record.name
        }</Title>}
        extra={
          !isEditing ? (
            <Button type="primary" icon={<EditOutlined />} onClick={() => setIsEditing(true)} data-testid="medical-record-edit-btn">{t('common:edit')}</Button>
          ) : undefined
        }
      >
        <div className={styles.versionControls}>
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
              const descVal = displayRecord?.description || record.description;

              return (
                <>
                  <Descriptions column={2} size="middle">
                    <Descriptions.Item label={t('medical:fields.recordType')}>
                      <Tag color={typeVal === 'procedure' ? 'blue' : typeVal === 'test_result' ? 'purple' : 'green'}>
                        {typeVal === 'procedure' ? t('medical:recordTypes.procedure') : typeVal === 'test_result' ? t('medical:recordTypes.testResult') : t('medical:recordTypes.note')}
                      </Tag>
                    </Descriptions.Item>
                    {typeVal === 'procedure' && (
                      <Descriptions.Item label={t('medical:fields.procedureName')}>{procVal}</Descriptions.Item>
                    )}
                    <Descriptions.Item label={t('medical:fields.createdAt')}>{new Date(record.createdAt).toLocaleString()}</Descriptions.Item>
                    <Descriptions.Item label={t('medical:fields.updatedAt')}>{new Date(((selectedEntry as any)?.changedAt) || record.updatedAt).toLocaleString()}</Descriptions.Item>
                    <Descriptions.Item label={t('medical:fields.version')}>{selectedVersion || record.version}</Descriptions.Item>
                  </Descriptions>

                  <div className={styles.marginTop16}>
                    <Text type="secondary" className={styles.descriptionLabel}>{t('medical:fields.description')}</Text>
                    <Paragraph className={styles.descriptionText}>{descVal as any}</Paragraph>
                  </div>

                  {/* Prescription Notes - only show if there's content */}
                  {(displayRecord?.prescriptionNotes || record.prescriptionNotes) && (
                    <div className={styles.marginTop16}>
                      <Text type="secondary" className={styles.descriptionLabel}>{t('medical:fields.prescriptionNotes')}</Text>
                      <Paragraph className={styles.descriptionText}>
                        {displayRecord?.prescriptionNotes || record.prescriptionNotes}
                      </Paragraph>
                    </div>
                  )}

                  {/* Line Items - only show if there are items */}
                  {(() => {
                    const lineItems = displayRecord?.lineItems || record.lineItems;
                    const discount = displayRecord?.discountPercent ?? record.discountPercent;

                    if (!lineItems || lineItems.length === 0) return null;

                    // Get currency for display
                    const firstCurrencyId = lineItems[0]?.currencyId;
                    const currency = currencies?.find(c => c.id === firstCurrencyId);
                    const currencySymbol = currency?.symbol || currency?.code || '';
                    const hasVat = lineItems.some(item => item.vatName);

                    return (
                      <div className={styles.marginTop16}>
                        <Text type="secondary" className={styles.descriptionLabel}>{t('medical:lineItems.title', 'Invoice')}</Text>
                        <Table
                          size="small"
                          dataSource={lineItems}
                          rowKey={(item: MedicalRecordLineItem, index) => item.id?.toString() || `item-${index}`}
                          pagination={false}
                          style={{ marginTop: 8 }}
                          columns={[
                            {
                              title: t('medical:lineItems.itemName', 'Item'),
                              dataIndex: 'name',
                              key: 'name',
                            },
                            ...(hasVat
                              ? [{
                                  title: t('medical:lineItems.vat'),
                                  dataIndex: 'vatName',
                                  key: 'vatName',
                                  width: 110,
                                  render: (name: string | null | undefined) => name ?? t('medical:lineItems.noVat'),
                                }]
                              : []),
                            {
                              title: t('medical:lineItems.quantity', 'Qty'),
                              dataIndex: 'quantity',
                              key: 'quantity',
                              width: 80,
                              align: 'center' as const,
                            },
                            {
                              title: t('medical:lineItems.unitPrice', 'Unit Price'),
                              dataIndex: 'unitPrice',
                              key: 'unitPrice',
                              width: 120,
                              align: 'right' as const,
                              render: (price: number) => `${currencySymbol}${price.toFixed(2)}`,
                            },
                            {
                              title: t('medical:lineItems.subtotal', 'Subtotal'),
                              key: 'subtotal',
                              width: 120,
                              align: 'right' as const,
                              render: (_: any, item: MedicalRecordLineItem) => (
                                <Text strong>{currencySymbol}{(item.unitPrice * item.quantity).toFixed(2)}</Text>
                              ),
                            },
                          ]}
                          summary={() => (
                            <InvoiceSummaryRows
                              lineItems={lineItems}
                              discountPercent={discount}
                              currencySymbol={currencySymbol}
                              labelSpan={hasVat ? 4 : 3}
                            />
                          )}
                        />
                      </div>
                    );
                  })()}

                  {/* Attachments now rendered as separate Card below */}
                </>
              );
            })()}
            {/* Single snapshot-driven block only */}
          </>
        ) : (
          <MedicalRecordForm
            initialValues={record}
            // MedicalRecordForm calls onSubmit with 5 args:
            //   (formData, files, fileSourceIds, deviceDataList, diagnosisIds)
            // We only care about the form values and the diagnosis ids
            // here — files / fileSourceIds / deviceDataList are
            // create-mode concerns (the form hides them in edit). But
            // we MUST receive diagnosisIds and forward them to
            // set_diagnoses_for_record, otherwise edits made through
            // this page silently drop the user's diagnosis selection
            // (the MedicalRecordModal path handled it; this page used
            // to ignore the extra args).
            onSubmit={async (
              values: UpdateMedicalRecordInput,
              _files?: File[],
              _fileSourceIds?: Map<string, string>,
              _deviceDataList?: unknown[],
              diagnosisIds?: number[],
            ) => {
              try {
                await updateMutation.mutateAsync({ recordId: record.id, updates: values });

                if (diagnosisIds !== undefined) {
                  try {
                    await invoke('set_diagnoses_for_record', {
                      medicalRecordId: record.id,
                      diagnosisIds,
                    });
                    // Refresh the per-record + per-patient tag caches
                    // so the inline DiagnosisTagList below the edit
                    // form re-renders with the new selection.
                    await queryClient.invalidateQueries({
                      queryKey: DIAGNOSES_KEYS.forRecord(record.id),
                    });
                    await queryClient.invalidateQueries({
                      queryKey: DIAGNOSES_KEYS.forPatient(record.patientId),
                    });
                  } catch (tagErr) {
                    console.error('Failed to save diagnosis tags:', tagErr);
                    notification.error({
                      message: t(
                        'medical:messages.diagnosesPartialSave',
                        'Diagnoses not saved',
                      ),
                      description: String(tagErr),
                      placement: 'bottomRight',
                      duration: 8,
                    });
                  }
                }

                setIsEditing(false);
                setSelectedVersion(null);
                await refetch();
              } catch (e) {
                // error messages are handled in the hook; keep UI responsive
              }
            }}
            onCancel={() => confirmLeave(() => setIsEditing(false))}
            onDirtyChange={setEditDirty}
            loading={updateMutation.isPending}
            isEdit={true}
            patientId={record.patientId}
            recordId={record.id}
          />
        )}
      </Card>

      {/* Diagnoses applied to this record. Rendered inline (no Card
          wrapper) so when the record has no diagnoses the whole row
          disappears — DiagnosisTagList returns null in that case and
          there's no empty-card chrome left behind. `showLabel` keeps
          the row self-explanatory ("Diagnoses: <tags>") when present. */}
      <div className={styles.marginTop16}>
        <DiagnosisTagList recordId={record.id} showLabel />
      </div>

      {/* Attachments split into two cards so the user can find generated
          documents and raw device data separately:
            - Documents: generated PDFs + user-uploaded files (anything
                         that's not a `test_result` attachment_type)
            - Device Data: raw test_result files captured by the
                         device watcher (XML, HL7, …)
          Both tables share the same row rendering, preview behaviour,
          and shared expanded-row state (keyed by attachment id which
          is unique across both groups). Print Report + Regenerate
          buttons live on the Device Data card since both actions
          consume raw test-result inputs. */}
      <Card
        title={t('medical:fields.documents', 'Documents')}
        className={styles.marginTop16}
      >
        {renderAttachmentsTable(
          documentAttachments,
          t('medical:detail.noDocuments', 'No documents yet'),
        )}
      </Card>

      <Card
        title={t('medical:fields.deviceData', 'Device Data')}
        className={styles.marginTop16}
        extra={
          <Space>
            <Button
              type="link"
              icon={<HistoryOutlined />}
              onClick={() => setRecentFilesDrawerOpen(true)}
            >
              {t('medical:actions.browseRecentFiles', 'Browse Recent Files')}
            </Button>
            {hasDeviceDataAttachments && (
              <>
                <Button
                  icon={<PrinterOutlined />}
                  onClick={() => setPrintReportModalOpen(true)}
                >
                  {t('medical:actions.printReport', 'Print Report')}
                </Button>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={handleRegeneratePdf}
                  loading={regeneratingId === -1}
                >
                  {t('medical:actions.regeneratePdf')}
                </Button>
              </>
            )}
          </Space>
        }
      >
        {renderAttachmentsTable(
          deviceDataAttachments,
          t('medical:detail.noDeviceData', 'No device data attached'),
        )}
      </Card>

      <RecordLabValues
        recordId={record.id}
        attachmentsKey={attachments.map((a: MedicalAttachment) => a.id).join(',')}
        className={styles.marginTop16}
      />

      <Card title={t('medical:detail.versionHistory')} className={styles.marginTop16}>
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

      {/* Recent Files Drawer */}
      <Drawer
        title={t('medical:deviceImport.recentFilesTitle')}
        placement="right"
        width={800}
        onClose={() => setRecentFilesDrawerOpen(false)}
        open={recentFilesDrawerOpen}
      >
        <RecentDeviceFiles
          days={14}
          onAddToRecord={handleAddRecentFile}
          onRefreshNeeded={(fn) => setRefreshRecentFiles(() => fn)}
        />
      </Drawer>

      {movingAttachment && (
        <MoveLabResultModal
          open
          attachmentId={movingAttachment.id}
          fileName={movingAttachment.originalName}
          currentPatientId={record?.patientId}
          onClose={() => setMovingAttachment(null)}
          onMoved={() => refetch()}
        />
      )}

      {/* Print Report Modal */}
      <PrintReportModal
        open={printReportModalOpen}
        onClose={() => setPrintReportModalOpen(false)}
        medicalRecordId={recordId}
        attachments={attachments}
        patientInfo={patientInfo}
        onGenerate={async (selectedAttachmentIds, patientOverrides) => {
          try {
            console.log('Generating configured report:', { selectedAttachmentIds, patientOverrides });
            const newAttachment = await MedicalService.generateConfiguredReport(
              recordId,
              selectedAttachmentIds,
              patientOverrides
            );
            notification.success({
              message: t('medical:printReport.generated'),
              description: t('medical:printReport.generatedDesc'),
              placement: 'bottomRight',
              duration: 5,
            });
            await refetch();
            // Open the generated PDF
            if (newAttachment?.id) {
              MedicalService.openAttachmentExternally(newAttachment.id);
            }
          } catch (error: any) {
            console.error('Failed to generate report:', error);
            throw error;
          }
        }}
      />
    </Content>
  );
};

export default MedicalRecordDetailPage;
