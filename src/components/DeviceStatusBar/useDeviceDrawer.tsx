import React, { useState } from 'react';
import { DeviceDetailsDrawer } from './DeviceDetailsDrawer';

/** Makes device chips open the drawer: spread `chipProps(id)` on a chip, render `drawer` once. */
export function useDeviceDrawer() {
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const chipProps = (id: number) => ({
    role: 'button' as const,
    tabIndex: 0,
    style: { cursor: 'pointer' },
    onClick: () => setDrawerId(id),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setDrawerId(id);
      }
    },
  });
  const drawer = <DeviceDetailsDrawer open={drawerId !== null} integrationId={drawerId} onClose={() => setDrawerId(null)} />;
  return { chipProps, drawer };
}
