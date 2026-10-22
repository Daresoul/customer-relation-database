import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { App, Button, Typography, Spin } from 'antd';
import { ReloadOutlined, PrinterOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { MedicalService } from '@/services/medicalService';
import styles from './PdfMultiPagePreview.module.css';

const { Text } = Typography;

// Base width for PDF preview - multiplied by device pixel ratio for crisp rendering on HiDPI displays
const BASE_PREVIEW_WIDTH = 900;
const getPreviewWidth = () => Math.round(BASE_PREVIEW_WIDTH * (window.devicePixelRatio || 1));

interface Props {
  attachmentId: number;
  initialPageUrl?: string; // optional pre-rendered page 1 URL
}

// Tauri-only multi-page PDF preview using PDFium-rendered PNGs.
// Renders page 1 immediately, loads subsequent pages on demand with infinite scroll.
const PdfMultiPagePreview: React.FC<Props> = ({ attachmentId, initialPageUrl }) => {
  const { t } = useTranslation(['medical', 'common']);
  const { notification } = App.useApp();
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pages, setPages] = useState<Array<{ page: number; url: string }>>(
    initialPageUrl ? [{ page: 1, url: initialPageUrl }] : []
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const toImageUrl = useCallback(async (path: string): Promise<string> => {
    const { readBinaryFile } = await import('@tauri-apps/api/fs');
    const bytes = await readBinaryFile(path);
    const blob = new Blob([new Uint8Array(bytes as any)], { type: 'image/png' });
    const url: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error);
      fr.onload = () => resolve(fr.result as string);
      fr.readAsDataURL(blob);
    });
    return url;
  }, []);

  // Initial load
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const count = await MedicalService.getPdfAttachmentPageCount(attachmentId);
        if (!active) return;
        setPageCount(count);
        // If we don't have page 1 yet, render it
        if (!initialPageUrl) {
          const path = await MedicalService.renderPdfAttachmentThumbnail(attachmentId, 1, getPreviewWidth());
          if (!active) return;
          const url = await toImageUrl(path);
          setPages([{ page: 1, url }]);
        }
      } catch (e: any) {
        if (!active) return;
        console.warn('[PdfMultiPagePreview] Failed to init page count / first page:', e);
        setError(e?.message || t('medical:pdfPreview.loadFailed'));
      }
    })();
    return () => {
      active = false;
    };
  }, [attachmentId, initialPageUrl, toImageUrl]);

  const canLoadMore = useMemo(() => {
    if (!pageCount) return false;
    const maxLoaded = pages.reduce((m, p) => Math.max(m, p.page), 0);
    return maxLoaded < pageCount;
  }, [pages, pageCount]);

  const loadMore = useCallback(async (count = 3, forceRegenerate = false) => {
    if (!pageCount || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const loadedPages = new Set(pages.map(p => p.page));
      let maxLoaded = pages.reduce((m, p) => Math.max(m, p.page), 0);
      const toFetch: number[] = [];
      for (let i = 0; i < count && maxLoaded < pageCount; i++) {
        maxLoaded += 1;
        if (!loadedPages.has(maxLoaded) || forceRegenerate) toFetch.push(maxLoaded);
      }

      const results = await Promise.all(toFetch.map(async (p) => {
        const previewWidth = getPreviewWidth();
        const path = forceRegenerate
          ? await MedicalService.renderPdfAttachmentThumbnailForce(attachmentId, p, previewWidth)
          : await MedicalService.renderPdfAttachmentThumbnail(attachmentId, p, previewWidth);
        const url = await toImageUrl(path);
        return { page: p, url };
      }));

      setPages(prev => {
        const pageMap = new Map(prev.map(p => [p.page, p]));
        results.forEach(r => pageMap.set(r.page, r));
        const merged = Array.from(pageMap.values());
        merged.sort((a, b) => a.page - b.page);
        return merged;
      });
    } catch (e: any) {
      console.warn('[PdfMultiPagePreview] Load more failed:', e);
      notification.error({ message: t('common:error'), description: e?.message || t('medical:pdfPreview.loadMoreFailed'), placement: "bottomRight", duration: 5 });
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [pageCount, pages, attachmentId, toImageUrl, notification]);

  // Regenerate all loaded pages
  const regenerateAll = useCallback(async () => {
    setRegenerating(true);
    try {
      const previewWidth = getPreviewWidth();
      const results = await Promise.all(pages.map(async (p) => {
        const path = await MedicalService.renderPdfAttachmentThumbnailForce(attachmentId, p.page, previewWidth);
        const url = await toImageUrl(path);
        return { page: p.page, url };
      }));

      setPages(results);
      notification.success({
        message: t('medical:pdfPreview.regenerated'),
        description: t('medical:pdfPreview.regenerated'),
        placement: 'bottomRight',
        duration: 3,
      });
    } catch (e: any) {
      console.error('[PdfMultiPagePreview] Regenerate failed:', e);
      notification.error({ message: t('common:error'), description: e?.message || t('medical:pdfPreview.regenerateFailed'), placement: "bottomRight", duration: 5 });
    } finally {
      setRegenerating(false);
    }
  }, [pages, attachmentId, toImageUrl, notification]);

  // Handle scroll for infinite loading
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || !canLoadMore || loadingRef.current) return;

    const container = scrollContainerRef.current;
    const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

    // Load more when within 200px of bottom
    if (scrollBottom < 200) {
      loadMore(5);
    }
  }, [canLoadMore, loadMore]);

  // Attach scroll listener
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Print function - open native print dialog via Tauri command
  const handlePrint = useCallback(async () => {
    try {
      await MedicalService.printAttachment(attachmentId);
      // No success notification needed - the print dialog will open
    } catch (e: any) {
      console.error('[PdfMultiPagePreview] Print failed:', e);
      notification.error({
        message: t('medical:pdfPreview.printFailed'),
        description: e?.message || t('medical:pdfPreview.printDialogFailed'),
        placement: 'bottomRight',
        duration: 5,
      });
    }
  }, [attachmentId, notification]);

  if (!pages.length && !error) {
    return (
      <div className={styles.loadingContainer}>
        <Spin />
        <Text type="secondary" className={styles.loadingText}>{t('medical:detail.loadingPreview')}</Text>
      </div>
    );
  }

  if (error && !pages.length) {
    return <Text type="danger">{error}</Text>;
  }

  return (
    <div>
      <div className={styles.headerRow}>
        <Text>
          {pageCount && t('medical:pdfPreview.pagesLoaded', { loaded: pages.length, total: pageCount })}
        </Text>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            size="small"
            icon={<PrinterOutlined />}
            onClick={handlePrint}
            disabled={!pages.length}
          >
            {t('common:print')}
          </Button>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={regenerateAll}
            loading={regenerating}
          >
            {t('medical:pdfPreview.regenerate')}
          </Button>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className={styles.scrollContainer}
      >
        {pages.map(p => (
          <div key={p.page} className={styles.pageContainer}>
            <img
              src={p.url}
              alt={t('medical:pdfPreview.pageAlt', { page: p.page })}
              className={styles.pageImage}
            />
          </div>
        ))}

        {loadingMore && (
          <div className={styles.loadingContainer}>
            <Spin size="small" />
            <Text type="secondary" className={styles.loadingText}>{t('medical:pdfPreview.loadingMore')}</Text>
          </div>
        )}

        {canLoadMore && !loadingMore && (
          <div className={styles.loadingContainer}>
            <Text type="secondary">{t('medical:pdfPreview.scrollForMore')}</Text>
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfMultiPagePreview;