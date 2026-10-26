/** F3: staff learned that PDFs can't be made only when one failed during a save. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, o?: Record<string, unknown>) => (o ? `${key} ${JSON.stringify(o)}` : key) }),
}));
const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import { PdfToolWarning } from '../PdfToolWarning';

afterEach(() => {
  cleanup();
  invokeMock.mockReset();
});

describe('PdfToolWarning', () => {
  it.each([
    [{ state: 'javaMissing' }, 'shell:pdfTool.javaMissing'],
    [{ state: 'toolMissing' }, 'shell:pdfTool.toolMissing'],
    [{ state: 'stale', app: '0.8.0', tool: '0.7.0' }, 'shell:pdfTool.stale {"app":"0.8.0","tool":"0.7.0"}'],
  ])('warns at start when PDFs cannot be made (%o)', async (health, text) => {
    invokeMock.mockResolvedValue(health);
    render(<PdfToolWarning />);
    expect(await screen.findByText('shell:pdfTool.title')).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('says nothing when PDFs work or the cause is unclear', async () => {
    invokeMock.mockResolvedValueOnce({ state: 'ok' });
    render(<PdfToolWarning />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(screen.queryByText('shell:pdfTool.title')).not.toBeInTheDocument();
    cleanup();
    invokeMock.mockResolvedValueOnce({ state: 'unknown', detail: 'x' });
    render(<PdfToolWarning />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('shell:pdfTool.title')).not.toBeInTheDocument();
  });
});
