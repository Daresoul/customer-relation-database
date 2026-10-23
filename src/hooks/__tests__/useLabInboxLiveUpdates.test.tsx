import { describe, it, expect, vi } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const handlers = vi.hoisted(() => new Map<string, () => void>());

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, handler: () => void) => {
    handlers.set(name, handler);
    return () => handlers.delete(name);
  }),
}));

import { useLabInboxLiveUpdates } from '../useLabInbox';

function Probe() {
  useLabInboxLiveUpdates();
  return null;
}

describe('useLabInboxLiveUpdates', () => {
  it.each(['device-data-received', 'device-event'])('refreshes the lab inbox and its badge on %s', async (name) => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(handlers.has(name)).toBe(true));

    act(() => handlers.get(name)?.());

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['lab-inbox'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['lab-inbox-count'] });
  });
});
