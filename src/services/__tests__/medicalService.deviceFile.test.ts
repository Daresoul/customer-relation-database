import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  tauriInvoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: mocks.tauriInvoke,
}));

import { MedicalService } from '../medicalService';

describe('MedicalService.getDeviceFileById', () => {
  beforeEach(() => {
    mocks.tauriInvoke.mockReset();
  });

  it('keeps the device result keys exactly as the parser wrote them', async () => {
    mocks.tauriInvoke.mockResolvedValue({
      fileName: 'pointcare.json',
      fileData: [1, 2],
      mimeType: 'application/json',
      deviceType: 'mnchip_pointcare_pcr_v1',
      deviceName: 'PointCare',
      connectionMethod: 'serial_port',
      testResults: {
        ALT: '42',
        ALT_range: '10-100',
        ALT_flag: 'H',
        ALT_unit: 'U/L',
        sample_id: 'S-17',
      },
    });

    const res = await MedicalService.getDeviceFileById('abc');

    expect(mocks.tauriInvoke).toHaveBeenCalledWith('download_device_file', { fileId: 'abc' });
    expect(res.fileName).toBe('pointcare.json');
    expect(res.testResults).toEqual({
      ALT: '42',
      ALT_range: '10-100',
      ALT_flag: 'H',
      ALT_unit: 'U/L',
      sample_id: 'S-17',
    });
  });
});
