import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { App, Button, Typography, Spin } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
// We prefer blob URLs generated from reading the PNG file to avoid scheme issues
import { MedicalService } from '@/services/medicalService';

const { Text } = Typography;

interface Props {
  attachmentId: number;
  initialPageUrl?: string; // optional pre-rendered page 1 URL
}

// Tauri-only multi-page PDF preview using PDFium-rendered PNGs.
// Renders page 1 immediately, loads subsequent pages on demand with infinite scroll.
const PdfMultiPagePreview: React.FC<Props> = ({ attachmentId, initialPageUrl }) => {
  const { message } = App.useApp();
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
          const path = await MedicalService.renderPdfAttachmentThumbnail(attachmentId, 1, 900);
          if (!active) return;
          const url = await toImageUrl(path);
          setPages([{ page: 1, url }]);
        }
      } catch (e: any) {
        if (!active) return;
        console.warn('[PdfMultiPagePreview] Failed to init page count / first page:', e);
        setError(e?.message || 'Failed to load PDF preview');
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
        const path = forceRegenerate
          ? await MedicalService.renderPdfAttachmentThumbnailForce(attachmentId, p, 900)
          : await MedicalService.renderPdfAttachmentThumbnail(attachmentId, p, 900);
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
      message.error(e?.message || 'Failed to load more pages');
    } finally {
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [pageCount, pages, attachmentId, toImageUrl, message]);

  // Regenerate all loaded pages
  const regenerateAll = useCallback(async () => {
    setRegenerating(true);
    try {
      const results = await Promise.all(pages.map(async (p) => {
        const path = await MedicalService.renderPdfAttachmentThumbnailForce(attachmentId, p.page, 900);
        const url = await toImageUrl(path);
        return { page: p.page, url };
      }));

      setPages(results);
      message.success('Previews regenerated successfully');
    } catch (e: any) {
      console.error('[PdfMultiPagePreview] Regenerate failed:', e);
      message.error(e?.message || 'Failed to regenerate previews');
    } finally {
      setRegenerating(false);
    }
  }, [pages, attachmentId, toImageUrl, message]);

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

  if (!pages.length && !error) {
    return (
      <div style={{ textAlign: 'center', padding: 20 }}>
        <Spin />
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>Loading preview...</Text>
      </div>
    );
  }

  if (error && !pages.length) {
    return <Text type="danger">{error}</Text>;
  }

  return (
    <div>
      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text>
          {pageCount && `${pages.length} of ${pageCount} pages loaded`}
        </Text>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={regenerateAll}
          loading={regenerating}
        >
          Regenerate
        </Button>
      </div>

      <div
        ref={scrollContainerRef}
        style={{
          maxHeight: 600,
          overflow: 'auto',
          border: '1px solid #303030',
          padding: 8,
          borderRadius: 4,
          background: '#141414'
        }}
      >
        {pages.map(p => (
          <div key={p.page} style={{ marginBottom: 8 }}>
            <img
              src={p.url}
              alt={`Page ${p.page}`}
              style={{
                maxWidth: '100%',
                display: 'block',
                borderRadius: 4,
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
              }}
            />
          </div>
        ))}

        {loadingMore && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <Spin size="small" />
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>Loading more pages...</Text>
          </div>
        )}

        {canLoadMore && !loadingMore && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <Text type="secondary">Scroll down to load more pages</Text>
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfMultiPagePreview;