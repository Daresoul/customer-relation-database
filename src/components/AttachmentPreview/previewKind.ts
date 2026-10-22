export type AttachmentPreviewKind = 'pdf' | 'image' | 'json' | 'xml' | 'html' | 'text' | 'none';

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg'];
const HTML_EXTS = ['html', 'htm', 'xhtml'];
const TEXT_EXTS = ['txt', 'csv', 'md', 'log'];

export function getAttachmentPreviewKind(mime?: string, name?: string): AttachmentPreviewKind {
  const m = (mime || '').toLowerCase();
  const ext = String(name || '').split('.').pop()?.toLowerCase() ?? '';

  if (m === 'text/html' || m === 'application/xhtml+xml' || HTML_EXTS.includes(ext)) return 'html';
  if (m.startsWith('image/') || IMAGE_EXTS.includes(ext)) return 'image';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (m === 'application/json' || ext === 'json') return 'json';
  if (m.includes('xml') || ext === 'xml') return 'xml';
  if (m.startsWith('text/') || TEXT_EXTS.includes(ext)) return 'text';
  return 'none';
}
