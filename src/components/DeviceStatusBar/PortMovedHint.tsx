import React, { useEffect, useState } from 'react';
import { App, Button, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { invoke } from '@/services/invoke';
import { useUpdateDeviceIntegration } from '../../hooks/useDeviceIntegrations';
import { formatUsbDeviceDisplayName, isHidDevice, type PortInfo } from '../../types/deviceIntegration';

const { Text } = Typography;

/**
 * The machine's port is gone. A replugged USB-serial cable usually comes back
 * under another COM number, so offer the ports this computer has now.
 */
export const PortMovedHint: React.FC<{ integrationId: number; missingPort: string; takenPorts: string[] }> = ({
  integrationId,
  missingPort,
  takenPorts,
}) => {
  const { t } = useTranslation('devices');
  const { message } = App.useApp();
  const update = useUpdateDeviceIntegration();
  const [ports, setPorts] = useState<PortInfo[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<PortInfo[]>('get_available_ports')
      .then((list) => {
        if (!cancelled) {
          // Another machine's port is not offered: taking it would break that machine.
          setPorts((list ?? []).filter((p) => !isHidDevice(p.port_type) && p.port_name !== missingPort && !takenPorts.includes(p.port_name)));
        }
      })
      .catch(() => {
        if (!cancelled) setPorts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [missingPort, takenPorts]);

  if (ports === null) return null;

  const use = async (port: string) => {
    setSaving(port);
    try {
      await update.mutateAsync({ id: integrationId, data: { serialPortName: port } });
      message.success(t('drawer.portSwitched', { port }));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      {ports.length === 0 ? (
        <Text type="secondary">{t('drawer.noPortsNow')}</Text>
      ) : (
        <>
          <Text strong>{t('drawer.portsNow')}</Text>
          {ports.map((p) => (
            <div key={p.port_name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <Text>{formatUsbDeviceDisplayName(p)}</Text>
              <Button size="small" loading={saving === p.port_name} onClick={() => use(p.port_name)}>
                {t('drawer.usePort', { port: p.port_name })}
              </Button>
            </div>
          ))}
        </>
      )}
    </div>
  );
};
