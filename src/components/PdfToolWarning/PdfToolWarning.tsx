import React, { useEffect, useState } from 'react';
import { Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import { invoke } from '@/services/invoke';

type PdfToolHealth =
  | { state: 'ok' }
  | { state: 'toolMissing' }
  | { state: 'javaMissing' }
  | { state: 'stale'; app: string; tool: string }
  | { state: 'unknown'; detail: string };

/** The start-up check runs Java (~0.5 s); ask again until it has an answer. */
const RETRY_MS = 2000;
const MAX_TRIES = 15;

/** Says at start, not during a save, that PDFs cannot be made and what to do. */
export const PdfToolWarning: React.FC = () => {
  const { t } = useTranslation('shell');
  const [health, setHealth] = useState<PdfToolHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = () => {
      tries += 1;
      invoke<PdfToolHealth | null>('get_pdf_tool_health')
        .then((h) => {
          if (cancelled) return;
          if (h) setHealth(h);
          else if (tries < MAX_TRIES) timer = setTimeout(ask, RETRY_MS);
        })
        .catch(() => {});
    };
    ask();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!health || health.state === 'ok' || health.state === 'unknown') return null;
  const description =
    health.state === 'stale' ? t('shell:pdfTool.stale', { app: health.app, tool: health.tool }) : t(`shell:pdfTool.${health.state}`);
  return <Alert type="error" banner showIcon message={t('shell:pdfTool.title')} description={description} />;
};
