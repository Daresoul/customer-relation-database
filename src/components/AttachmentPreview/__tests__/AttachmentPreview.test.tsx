import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  getAttachmentPreviewKind,
  TextAttachmentPreview,
  HtmlAttachmentNotice,
} from '..';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  delete (window as unknown as { __pwned?: boolean }).__pwned;
});

const XSS = '<img src=x onerror="window.__pwned=true"><script>window.__pwned=true</script>';

describe('getAttachmentPreviewKind', () => {
  it.each([
    ['text/html', 'notes.html', 'html'],
    ['', 'notes.htm', 'html'],
    [undefined, 'report.xhtml', 'html'],
    ['application/xhtml+xml', 'report', 'html'],
    ['TEXT/HTML', 'x', 'html'],
    ['text/plain', 'a.txt', 'text'],
    ['', 'a.csv', 'text'],
    ['application/json', 'a', 'json'],
    ['', 'device.json', 'json'],
    ['application/xml', 'a', 'xml'],
    ['image/svg+xml', 'a.svg', 'image'],
    ['image/png', 'a.png', 'image'],
    ['application/pdf', 'a', 'pdf'],
    ['application/octet-stream', 'setup.exe', 'none'],
  ])('%s / %s -> %s', (mime, name, expected) => {
    expect(getAttachmentPreviewKind(mime, name)).toBe(expected);
  });
});

describe('TextAttachmentPreview', () => {
  it('shows HTML inside JSON values as text, never as markup', async () => {
    const json = JSON.stringify({ patientName: XSS, weight: 12.5, ok: true, note: null });
    const { container } = render(
      <TextAttachmentPreview blob={new Blob([json])} kind="json" />,
    );

    expect(await screen.findByText(/patientName/)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=');
    expect(container.textContent).toContain('12.5');
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it('shows invalid JSON as plain text', async () => {
    const { container } = render(
      <TextAttachmentPreview blob={new Blob([`{ broken ${XSS}`])} kind="json" />,
    );

    expect(await screen.findByText(/broken/)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('shows text files as escaped plain text in a pre block, not an iframe', async () => {
    const { container } = render(
      <TextAttachmentPreview blob={new Blob([`line one\n${XSS}`])} kind="text" />,
    );

    expect(await screen.findByText(/line one/)).toBeInTheDocument();
    expect(container.querySelector('pre')).not.toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<script>');
  });

  it('shows XML tags as text', async () => {
    const { container } = render(
      <TextAttachmentPreview
        blob={new Blob([`<result><name>${XSS}</name></result>`])}
        kind="xml"
      />,
    );

    expect(await screen.findAllByText(/result/)).not.toHaveLength(0);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });
});

describe('HtmlAttachmentNotice', () => {
  it('offers to open the file externally instead of rendering it', () => {
    const onOpen = vi.fn();
    const { container } = render(<HtmlAttachmentNotice onOpenExternally={onOpen} />);

    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByText('medical:detail.htmlNotPreviewed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /medical:detail.openExternally/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
