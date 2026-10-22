import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { App } from 'antd';

const base = {
  filePath: '/x',
  deviceType: 'exigo_eos_vet',
  deviceName: 'Exigo',
  connectionMethod: 'file_watch',
  receivedAt: new Date().toISOString(),
  attachmentCount: 0,
  lastAccessedAt: new Date().toISOString(),
};

vi.mock('../../services/fileHistoryService', () => ({
  fileHistoryService: {
    getRecentDeviceFiles: vi.fn().mockResolvedValue([
      { ...base, id: 1, fileId: 'ok-1', originalName: 'BM_1219.xml', status: 'ok' },
      { ...base, id: 2, fileId: 'bad-1', originalName: 'broken.xml', status: 'failed', error: 'Exigo XML yielded no data' },
    ]),
    openDeviceFile: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => cleanup());

describe('RecentDeviceFiles', () => {
  it('marks a file that could not be read and offers no Add for it', async () => {
    const { default: RecentDeviceFiles } = await import('../RecentDeviceFiles');
    render(
      <App>
        <RecentDeviceFiles onAddToRecord={vi.fn()} />
      </App>,
    );

    expect(await screen.findByText('broken.xml')).toBeInTheDocument();
    expect(screen.getByText('recentFiles.couldNotRead')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Add/ })).toHaveLength(1);
  });
});
