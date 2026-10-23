import React, { useEffect, useRef, useState } from 'react';
import { Typography, Button, App } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
// pdf.js v3 imports — use legacy build for wider WebView compatibility
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf';
import type { DocumentInitParameters, PDFDocumentLoadingTask, RenderParameters, RenderTask } from 'pdfjs-dist/types/src/display/api';
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.js?url';
import { messageOf } from '@/utils/errors';
import { MedicalService } from '@/services/medicalService';
import { isTauri as detectTauri } from '@/utils/isTauri';
import styles from './PdfInlineViewer.module.css';

const { Text } = Typography;

interface PdfInlineViewerProps {
  blob: Blob;
  fileName: string;
  attachmentId?: number; // Optional attachment ID for native printing
}

// Best-effort inline PDF viewer using pdfjs-dist if available.
// Falls back to a helpful message if the lib is not installed.
const PdfInlineViewer: React.FC<PdfInlineViewerProps> = ({ blob, fileName, attachmentId }) => {
  const { t } = useTranslation(['medical', 'common']);
  // Async work reads the current t without re-running when the language changes.
  const tRef = useRef(t);
  tRef.current = t;
  const { notification } = App.useApp();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);

  useEffect(() => {
    let active = true;
    let rendered = false;
    const start = Date.now();
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      try {
        // Read PDF bytes from provided Blob
        const ab = await blob.arrayBuffer();
        const uint8 = new Uint8Array(ab);

        // Configure pdf.js v3 worker
        GlobalWorkerOptions.workerSrc = workerSrc;
        let pdf;
        const isTauri = detectTauri();
        const preferNoWorker = isTauri; // In Tauri WebView, workers/eval often fail — render on main thread.
        try {
          if (preferNoWorker) {
            const loadingTaskNoWorker = getDocument({
              data: uint8,
              disableWorker: true,
              isEvalSupported: false,
            } as DocumentInitParameters);
            loadingTaskRef.current = loadingTaskNoWorker;
            pdf = await loadingTaskNoWorker.promise;
          } else {
            const loadingTask = getDocument({ data: uint8 });
            loadingTaskRef.current = loadingTask;
            pdf = await loadingTask.promise;
          }
        } catch (workerErr) {
          console.warn('[PDF Viewer] Initial load failed, retrying without worker:', workerErr);
          // Retry without a worker (main-thread rendering) for environments that block Workers
          const loadingTaskNoWorker = getDocument({ data: uint8, disableWorker: true, isEvalSupported: false } as DocumentInitParameters);
          loadingTaskRef.current = loadingTaskNoWorker;
          pdf = await loadingTaskNoWorker.promise;
        }
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: 1.0 });
        const canvas = canvasRef.current;
        if (!canvas || !active) return;
        const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
        if (!context) throw new Error('Canvas context not available');
        // Handle HiDPI: keep DPR=1 in Tauri for speed, higher elsewhere for sharpness
        const dpr = isTauri ? 1 : Math.min(window.devicePixelRatio || 1.5, 2);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.width = Math.floor((viewport.width as number) * dpr);
        canvas.height = Math.floor((viewport.height as number) * dpr);
        const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
        const renderContext: RenderParameters = { canvasContext: context, viewport, transform };
        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;
        // Start the watchdog only once rendering begins
        watchdog = setTimeout(() => {
          if (active && !rendered) {
            console.warn('[PDF Viewer] Render timeout after', Date.now() - start, 'ms, falling back to embed');
            try { renderTaskRef.current?.cancel?.(); } catch { /* already finished */ }
            const t = tRef.current;
            setError(t('medical:pdfPreview.inlineTimedOut'));
          }
        }, 10000);
        await renderTask.promise;
        rendered = true;
        if (watchdog) clearTimeout(watchdog);
      } catch (e) {
        if (watchdog) clearTimeout(watchdog);
        if ((e as { name?: unknown })?.name === 'RenderingCancelledException' || /cancel/i.test(messageOf(e) || '')) {
          console.warn('[PDF Viewer] Rendering was cancelled.');
          return; // don't show an error for expected cancellations
        }
        console.error('PDF inline viewer error:', e);
        const t = tRef.current;
        setError(t('medical:pdfPreview.inlineFailed', { error: messageOf(e) || '' }).trim());
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      if (watchdog) clearTimeout(watchdog);
      try { renderTaskRef.current?.cancel?.(); } catch { /* already finished */ }
      try { loadingTaskRef.current?.destroy?.(); } catch { /* already destroyed */ }
    };
  }, [blob, fileName]);

  // Create and manage a fallback object URL if we hit the error path
  useEffect(() => {
    if (!error) {
      setFallbackUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setFallbackUrl(url);
    // Revoking here also covers the error clearing: the cleanup of the error run goes first.
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [error, blob]);

  // Print function - open native print dialog if attachmentId is available
  const handlePrint = async () => {
    if (attachmentId) {
      try {
        await MedicalService.printAttachment(attachmentId);
        // No success notification needed - the print dialog will open
      } catch (e) {
        console.error('[PdfInlineViewer] Print failed:', e);
        notification.error({
          message: t('medical:pdfPreview.printFailed'),
          description: messageOf(e) || t('medical:pdfPreview.printDialogFailed'),
          placement: 'bottomRight',
          duration: 5,
        });
      }
    } else {
      // Fallback to browser print if no attachmentId (shouldn't happen in practice)
      window.print();
    }
  };

  if (error) {
    return (
      <div>
        <Text type="secondary" className={styles.errorText}>{error}</Text>
        {/* Use object/iframe with blob URL if the runtime can display PDFs */}
        {fallbackUrl ? (
          <>
            <object data={fallbackUrl} type="application/pdf" width="100%" height={480}>
              <iframe src={fallbackUrl} title={fileName} className={styles.iframe} />
            </object>
            <div className={styles.fallbackLink}>
              <a href={fallbackUrl} download={fileName}>{t('medical:pdfPreview.downloadPdf')}</a>
            </div>
          </>
        ) : (
          <Text type="secondary">{t('medical:pdfPreview.unableToDisplay')}</Text>
        )}
      </div>
    );
  }
  if (loading) {
    return <Text type="secondary">{t('medical:detail.loadingPreview')}</Text>;
  }
  return (
    <div>
      <div style={{ marginBottom: '8px', textAlign: 'right' }}>
        <Button
          size="small"
          icon={<PrinterOutlined />}
          onClick={handlePrint}
        >
          {t('common:print')}
        </Button>
      </div>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
};

export default PdfInlineViewer;
