import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
  }),
}));
vi.mock('@/services/invoke', () => ({ invoke: vi.fn() }));

import { useDocumentStatusNotice, type SavedRecordDocuments } from '../useDocumentStatusNotice';

function Notice({ saved }: { saved: SavedRecordDocuments }) {
  const report = useDocumentStatusNotice();
  useEffect(() => {
    report(saved, 'saved');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- report once on mount, like a page after a save
  return null;
}

function renderNotice(saved: SavedRecordDocuments) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App>
        <Notice saved={saved} />
      </App>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

// device-health #12: values the lab report has no row for were only logged.
describe('document status after a save', () => {
  it('names the lab values that are not on the PDF', async () => {
    renderNotice({
      id: 7,
      pdfs: [{ kind: 'device_report', ok: true, error: null, attachmentId: 801, missingValues: ['ABC', 'XYZ'] }],
    });
    expect(
      await screen.findByText('medical:documents.valuesNotOnPdf {"count":2,"codes":"ABC, XYZ"}'),
    ).toBeInTheDocument();
  });

  it('is a plain success when every value is on the PDF', async () => {
    renderNotice({ id: 7, pdfs: [{ kind: 'device_report', ok: true, error: null }] });
    expect(await screen.findByText('saved')).toBeInTheDocument();
    expect(screen.queryByText(/valuesNotOnPdf/)).not.toBeInTheDocument();
  });
});
