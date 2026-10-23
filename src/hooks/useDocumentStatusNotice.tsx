import { App, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { invoke } from '@/services/invoke';
import type { PdfStatus } from '@/types/generated/PdfStatus';

/** What create/update return: the record plus how each document fared. */
export interface SavedRecordDocuments {
  id: number;
  pdfs?: PdfStatus[];
}

function shortError(error: string | null): string {
  const firstLine = (error ?? '').split('\n')[0].trim();
  return firstLine.length > 160 ? `${firstLine.slice(0, 157)}…` : firstLine;
}

/**
 * After a save: a plain success when every document was made, otherwise a
 * warning per failed document with a Retry that remakes only that one.
 */
export function useDocumentStatusNotice() {
  const { notification } = App.useApp();
  const { t } = useTranslation('medical');
  const queryClient = useQueryClient();

  const kindLabel = (kind: string) => t(`medical:documents.kinds.${kind}`);

  const retry = async (recordId: number, kind: string) => {
    const key = `record-${recordId}-document-${kind}`;
    notification.destroy(key);
    let status: PdfStatus;
    try {
      if (kind === 'device_report') {
        await invoke('regenerate_pdf_from_medical_record', { medicalRecordId: recordId });
        status = { kind, ok: true, error: null };
      } else {
        status = await invoke<PdfStatus>('regenerate_record_document', { recordId, kind });
      }
    } catch (e) {
      status = { kind, ok: false, error: String(e) };
    }
    await queryClient.invalidateQueries({ queryKey: ['medical-record', recordId] });
    if (status.ok) {
      notification.success({
        message: t('medical:documents.retrySucceeded', { document: kindLabel(kind) }),
        placement: 'bottomRight',
        duration: 3,
      });
    } else {
      warn(recordId, status);
    }
  };

  const warn = (recordId: number, status: PdfStatus) => {
    notification.warning({
      key: `record-${recordId}-document-${status.kind}`,
      message: t('medical:documents.someFailed'),
      description: `${kindLabel(status.kind)}: ${shortError(status.error)}`,
      placement: 'bottomRight',
      duration: 0,
      actions: (
        <Button size="small" type="primary" onClick={() => retry(recordId, status.kind)}>
          {t('medical:actions.retry')}
        </Button>
      ),
    });
  };

  // The lab report was made, but the machine sent values it has no row for.
  const warnMissingValues = (recordId: number, status: PdfStatus) => {
    const codes = status.missingValues ?? [];
    notification.warning({
      key: `record-${recordId}-document-${status.kind}-missing`,
      message: t('medical:documents.valuesNotOnPdf', { count: codes.length, codes: codes.join(', ') }),
      description: t('medical:documents.valuesNotOnPdfHint'),
      placement: 'bottomRight',
      duration: 0,
    });
  };

  return (saved: SavedRecordDocuments, successMessage: string) => {
    const pdfs = saved.pdfs ?? [];
    const failed = pdfs.filter((p) => !p.ok);
    pdfs
      .filter((p) => p.ok && (p.missingValues?.length ?? 0) > 0)
      .forEach((status) => warnMissingValues(saved.id, status));
    if (failed.length === 0) {
      notification.success({ message: successMessage, placement: 'bottomRight', duration: 3 });
      return;
    }
    failed.forEach((status) => warn(saved.id, status));
  };
}
