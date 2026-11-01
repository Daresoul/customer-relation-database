/**
 * Tests for the pre-update backup gate in `updateService.installAndRestart`.
 *
 * A failed pre-update backup must stop and ask before installing; Cancel
 * keeps the current version. No backup folder means nothing to back up,
 * so the update goes ahead without asking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  installUpdate: vi.fn(),
  relaunch: vi.fn(),
}));

vi.mock('@/services/invoke', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/updater', () => ({
  checkUpdate: vi.fn(),
  installUpdate: mocks.installUpdate,
  onUpdaterEvent: vi.fn(),
}));
vi.mock('@tauri-apps/api/process', () => ({ relaunch: mocks.relaunch }));

import { updateService, createBackupFailedConfirm } from '../updateService';

function backend({ directory, backupError, configError = null }: { directory: string | null; backupError?: unknown; configError?: string | null }) {
  mocks.invoke.mockImplementation((command: string) => {
    if (command === 'get_backup_config') {
      return Promise.resolve({ directory, lastBackupAt: null, lastError: configError });
    }
    if (command === 'run_backup_now') {
      return backupError === undefined ? Promise.resolve({}) : Promise.reject(backupError);
    }
    return Promise.reject(new Error(`unexpected command ${command}`));
  });
}

describe('updateService.installAndRestart', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.installUpdate.mockReset().mockResolvedValue(undefined);
    mocks.relaunch.mockReset().mockResolvedValue(undefined);
  });

  it('runs the backup as a pre-update backup, then installs without asking', async () => {
    backend({ directory: 'D:\\Backups' });
    const confirm = vi.fn();

    const installed = await updateService.installAndRestart(confirm);

    expect(mocks.invoke).toHaveBeenCalledWith('run_backup_now', { preUpdate: true });
    expect(confirm).not.toHaveBeenCalled();
    expect(mocks.installUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.relaunch).toHaveBeenCalledTimes(1);
    expect(installed).toBe(true);
  });

  it('asks before updating when the backup fails, and Cancel stops the update', async () => {
    backend({ directory: 'D:\\Backups', backupError: 'Backup directory does not exist: D:\\Backups' });
    const confirm = vi.fn().mockResolvedValue(false);

    const installed = await updateService.installAndRestart(confirm);

    expect(confirm).toHaveBeenCalledWith('Backup directory does not exist: D:\\Backups');
    expect(mocks.installUpdate).not.toHaveBeenCalled();
    expect(mocks.relaunch).not.toHaveBeenCalled();
    expect(installed).toBe(false);
  });

  it('installs when the user chooses to update anyway after a failed backup', async () => {
    backend({ directory: 'D:\\Backups', backupError: new Error('disk full') });
    const confirm = vi.fn().mockResolvedValue(true);

    const installed = await updateService.installAndRestart(confirm);

    expect(confirm).toHaveBeenCalledWith('disk full');
    expect(mocks.installUpdate).toHaveBeenCalledTimes(1);
    expect(installed).toBe(true);
  });

  it('skips the backup and does not ask when no backup folder is set', async () => {
    backend({ directory: null });
    const confirm = vi.fn();

    await updateService.installAndRestart(confirm);

    expect(mocks.invoke).not.toHaveBeenCalledWith('run_backup_now', expect.anything());
    expect(confirm).not.toHaveBeenCalled();
    expect(mocks.installUpdate).toHaveBeenCalledTimes(1);
  });

  // Final review (low): a damaged settings file reads as "no folder", so the
  // update went ahead without a backup and without asking.
  it('asks when the backup settings could not be read', async () => {
    backend({ directory: null, configError: 'Backup settings could not be read: expected value at line 1' });
    const confirm = vi.fn().mockResolvedValue(false);

    const installed = await updateService.installAndRestart(confirm);

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('could not be read'));
    expect(installed).toBe(false);
    expect(mocks.installUpdate).not.toHaveBeenCalled();
  });
});

describe('createBackupFailedConfirm', () => {
  type Config = {
    title: string;
    content: string;
    okText: string;
    cancelText: string;
    autoFocusButton: string;
    onOk: () => void;
    onCancel: () => void;
  };

  function fakeModal() {
    const calls: Config[] = [];
    return { calls, modal: { confirm: (config: Config) => { calls.push(config); } } };
  }
  const t = (key: string, opts?: Record<string, unknown>) =>
    opts ? `${key}|${JSON.stringify(opts)}` : key;

  it('shows a translated question with Cancel focused by default', () => {
    const { calls, modal } = fakeModal();
    void createBackupFailedConfirm(modal as never, t as never)('disk full');

    expect(calls).toHaveLength(1);
    expect(calls[0].title).toBe('updates.backupFailed.title');
    expect(calls[0].content).toContain('updates.backupFailed.content');
    expect(calls[0].content).toContain('disk full');
    expect(calls[0].okText).toBe('updates.backupFailed.updateAnyway');
    expect(calls[0].cancelText).toBe('updates.backupFailed.cancel');
    expect(calls[0].autoFocusButton).toBe('cancel');
  });

  it('resolves true on Update anyway and false on Cancel', async () => {
    const { calls, modal } = fakeModal();
    const confirm = createBackupFailedConfirm(modal as never, t as never);

    const okAnswer = confirm('x');
    calls[0].onOk();
    await expect(okAnswer).resolves.toBe(true);

    const cancelAnswer = confirm('x');
    calls[1].onCancel();
    await expect(cancelAnswer).resolves.toBe(false);
  });
});
