import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  tauriInvoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/tauri', () => ({
  invoke: mocks.tauriInvoke,
}));

import { MedicalService } from '../medicalService';

describe('MedicalService.uploadAttachment', () => {
  beforeEach(() => {
    mocks.tauriInvoke.mockReset();
    mocks.tauriInvoke.mockResolvedValue({ id: 1 });
  });

  it('sends the file bytes once', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'xray.png', { type: 'image/png' });
    // jsdom's File has no arrayBuffer().
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([1, 2, 3]).buffer });

    await MedicalService.uploadAttachment(7, file);

    expect(mocks.tauriInvoke).toHaveBeenCalledTimes(1);
    const [command, args] = mocks.tauriInvoke.mock.calls[0];
    expect(command).toBe('upload_medical_attachment');
    expect(args.fileData).toEqual([1, 2, 3]);
    const byteArrays = Object.values(args).filter((v) => Array.isArray(v));
    expect(byteArrays).toHaveLength(1);
    expect(args.medicalRecordId).toBe(7);
    expect(args.fileName).toBe('xray.png');
    expect(args.mimeType).toBe('image/png');
  });
});
