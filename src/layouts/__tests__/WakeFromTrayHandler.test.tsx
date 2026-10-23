/**
 * A lab file wakes the window from the tray. The import opens when the
 * result itself arrives; opening it at the wake showed an empty import with
 * the real result parked behind it as "waiting".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const events = vi.hoisted(() => ({ handlers: new Map<string, (e: { payload: unknown }) => void>() }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: (name: string, handler: (e: { payload: unknown }) => void) => {
    events.handlers.set(name, handler);
    return Promise.resolve(() => {});
  },
}));
const openModal = vi.fn();
vi.mock('../../contexts/useDeviceImport', () => ({ useDeviceImport: () => ({ openModal }) }));
vi.mock('../../contexts', () => ({ useViewContext: () => ({ setCurrentView: vi.fn() }) }));

import { WakeFromTrayHandler } from '../WakeFromTrayHandler';

describe('WakeFromTrayHandler', () => {
  beforeEach(() => {
    events.handlers.clear();
    openModal.mockReset();
  });

  it('a wake by a lab file does not open an empty import', async () => {
    render(
      <MemoryRouter>
        <WakeFromTrayHandler />
      </MemoryRouter>,
    );
    await Promise.resolve();

    events.handlers.get('wake-from-tray')!({ payload: { cause: 'file', fileName: 'exigo.xml' } });

    expect(openModal).not.toHaveBeenCalled();
  });
});
