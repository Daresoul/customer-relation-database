/**
 * A document that could not be made says why in plain words. When retrying
 * can't help (the PDF tool or Java is missing on this PC), there is no Retry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, screen, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import type { ReactNode } from 'react';
import { useDocumentStatusNotice } from '../useDocumentStatusNotice';

vi.mock('@/services/invoke', () => ({ invoke: vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, o?: object) => (o ? `${key} ${JSON.stringify(o)}` : key) }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <App>{children}</App>
    </QueryClientProvider>
  );
}

function showFailure(error: string) {
  const { result } = renderHook(() => useDocumentStatusNotice(), { wrapper });
  act(() => result.current({ id: 7, pdfs: [{ kind: 'invoice', ok: false, error }] }, 'saved'));
}

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(cleanup);

describe('why a document could not be made', () => {
  it('names a missing PDF tool and offers no Retry', async () => {
    showFailure('pdf-generator-0.7.3.jar not found at resolved path: "C:\\\\…". A missing version-matched JAR usually means an update did not replace it — reinstall to fix.');
    expect(await screen.findByText(/medical:documents\.reasons\.toolMissing/)).toBeInTheDocument();
    expect(screen.queryByText(/jar not found/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'medical:actions.retry' })).not.toBeInTheDocument();
  });

  it('names missing Java and offers no Retry', async () => {
    showFailure('Failed to execute Java: program not found');
    expect(await screen.findByText(/medical:documents\.reasons\.javaMissing/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'medical:actions.retry' })).not.toBeInTheDocument();
  });

  it('says a slow PDF took too long, and offers Retry', async () => {
    showFailure('Java PDF generator timed out after 60s and was stopped. STDERR: ');
    expect(await screen.findByText(/medical:documents\.reasons\.timedOut/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'medical:actions.retry' })).toBeInTheDocument();
  });

  // Final review: a result that can't be read keeps the old lab report; staff
  // must remove or re-add that result, so trying again can't help.
  it('names a lab result that could not be read, and offers no Retry', async () => {
    showFailure('Could not read the lab result: chem.hl7, BM-1.xml; the lab report was left as it was');
    expect(await screen.findByText(/medical:documents\.reasons\.labUnreadable \{"files":"chem\.hl7, BM-1\.xml"\}/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'medical:actions.retry' })).not.toBeInTheDocument();
  });

  it('keeps the first line of an error it does not know, with Retry', async () => {
    showFailure('Disk full\nstack…');
    expect(await screen.findByText(/Disk full/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'medical:actions.retry' })).toBeInTheDocument();
  });
});
