import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { App } from 'antd';

const base = {
  filePath: '/x',
  deviceName: 'Machine',
  connectionMethod: 'serial_port',
  receivedAt: new Date().toISOString(),
  attachmentCount: 0,
  lastAccessedAt: new Date().toISOString(),
  status: 'ok',
};

vi.mock('../../services/fileHistoryService', () => ({
  fileHistoryService: {
    getRecentDeviceFiles: vi.fn().mockResolvedValue([
      { ...base, id: 1, fileId: 'a', originalName: 'h.json', deviceType: 'healvet_hv_fia_3000' },
      { ...base, id: 2, fileId: 'b', originalName: 'c.json', deviceType: 'mnchip_pointcare_chemistry' },
      { ...base, id: 3, fileId: 'c', originalName: 'p.json', deviceType: 'mnchip_pcr_analyzer' },
    ]),
    openDeviceFile: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => cleanup());

// device-import #16: the list keyed on device types the backend never stores.
describe('RecentDeviceFiles device names', () => {
  it('names each machine type the backend stores', async () => {
    const { default: RecentDeviceFiles } = await import('../RecentDeviceFiles');
    render(
      <App>
        <RecentDeviceFiles onAddToRecord={vi.fn()} />
      </App>,
    );

    expect(await screen.findByText('Healvet HV-FIA 3000')).toBeInTheDocument();
    expect(screen.getByText('MNCHIP PointCare Chemistry')).toBeInTheDocument();
    expect(screen.getByText('MNCHIP PCR Analyzer')).toBeInTheDocument();
  });
});
