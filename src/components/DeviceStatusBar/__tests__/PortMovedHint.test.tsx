import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { App } from 'antd';
import { PortMovedHint } from '../PortMovedHint';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: Record<string, unknown>) => (o?.port ? `${key} ${o.port}` : key),
  }),
}));
const invokeMock = vi.fn();
vi.mock('@/services/invoke', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
vi.mock('../../../hooks/useDeviceIntegrations', () => ({
  useUpdateDeviceIntegration: () => ({ mutateAsync: vi.fn() }),
}));

afterEach(cleanup);

const usb = (name: string) => ({ vid: 0x1a86, pid: 0x7523, serial_number: null, manufacturer: null, product: null, path: null, device_name: name });

// Final review: the backend sends a built-in port's type as plain text
// ("BuiltInPort"); `'HIDDevice' in "BuiltInPort"` threw, and the hint then
// offered no ports at all on PCs with a COM1.
describe('PortMovedHint', () => {
  it('offers the ports present now, by their USB name, on a PC with a built-in COM port', async () => {
    invokeMock.mockResolvedValue([
      { port_name: 'COM1', port_type: 'BuiltInPort' },
      { port_name: 'COM6', port_type: { SerialUSBPort: usb('USB-SERIAL CH340') } },
      { port_name: 'COM9', port_type: { HIDDevice: usb('Barcode scanner') } },
    ]);
    render(
      <App>
        <PortMovedHint integrationId={1} missingPort="COM5" takenPorts={[]} />
      </App>,
    );

    expect(await screen.findByText('COM6 - USB-SERIAL CH340')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'drawer.usePort COM1' })).toBeInTheDocument();
    expect(screen.queryByText(/COM9/)).not.toBeInTheDocument();
  });
});
