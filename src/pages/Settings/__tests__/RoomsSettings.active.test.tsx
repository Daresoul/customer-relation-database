import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../utils/themeStyles', () => ({ useThemeColors: () => ({}) }));

const updateRoom = vi.fn(async () => ({}));
const rooms = [
  { id: 4, name: 'Surgery', description: null, capacity: 1, color: '#ff0000', isActive: false },
];
vi.mock('../../../hooks/useRooms', () => ({
  useRooms: () => ({ data: rooms, isLoading: false, refetch: vi.fn() }),
  useCreateRoom: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateRoom: () => ({ mutateAsync: updateRoom, isPending: false }),
  useDeleteRoom: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import RoomsSettings from '../components/RoomsSettings';

// settings.md #7b / appointments.md #17: editing an inactive room switched it
// back on, because the form had no Active field and the save defaulted to true.
describe('Room edit', () => {
  afterEach(() => {
    cleanup();
    updateRoom.mockClear();
  });

  it('keeps an inactive room inactive', async () => {
    render(<App><RoomsSettings isUpdating={false} /></App>);

    fireEvent.click(screen.getByText('common:edit'));
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }));

    await waitFor(() => expect(updateRoom).toHaveBeenCalled());
    expect(updateRoom.mock.calls[0][0]).toMatchObject({ id: 4, data: { isActive: false } });
  });

  it('can switch an inactive room back on', async () => {
    render(<App><RoomsSettings isUpdating={false} /></App>);

    fireEvent.click(screen.getByText('common:edit'));
    fireEvent.click(await screen.findByRole('switch', { name: 'common:active' }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(updateRoom).toHaveBeenCalled());
    expect(updateRoom.mock.calls[0][0]).toMatchObject({ id: 4, data: { isActive: true } });
  });
});
