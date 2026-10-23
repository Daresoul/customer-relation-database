import React, { useState } from 'react';
import { Button, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { useDeviceConnectionStatus, useDeviceIntegrations, useFileWatcherStatus } from '../../hooks/useDeviceIntegrations';
import { folderLevel, rollupHealth, serialDownSince, serialLevel } from './deviceHealth';
import { DeviceDetailsDrawer, HealthIcon } from './DeviceDetailsDrawer';

/** Header chip on every page: the worst lab machine state; a click opens the details drawer. */
export const DeviceHealthChip: React.FC = () => {
  const { t } = useTranslation('devices');
  const { data: integrations } = useDeviceIntegrations();
  const { getStatus: getSerialStatus } = useDeviceConnectionStatus();
  const { getStatus: getFolderStatus } = useFileWatcherStatus();
  const [openId, setOpenId] = useState<number | null>(null);

  const devices = (integrations ?? [])
    .filter((i) => i.enabled && (i.connectionType === 'serial_port' || i.connectionType === 'file_watch'))
    .map((i) => ({
      id: i.id,
      level:
        i.connectionType === 'serial_port'
          ? serialLevel(getSerialStatus(i.id), serialDownSince(getSerialStatus(i.id)))
          : folderLevel(getFolderStatus(i.id)),
    }));
  const { level, count } = rollupHealth(devices.map((d) => d.level));
  if (level === 'none') return null;
  const focusId = devices.find((d) => d.level === level)?.id ?? devices[0].id;

  return (
    <>
      <Tooltip title={t(`chip.tooltip.${level}`, { count })}>
        <Button data-level={level} icon={<HealthIcon level={level} />} onClick={() => setOpenId(focusId)}>
          {t('chip.label')}: {t(`chip.state.${level}`)}
          {count > 0 && ` · ${count}`}
        </Button>
      </Tooltip>
      <DeviceDetailsDrawer open={openId !== null} integrationId={openId} onClose={() => setOpenId(null)} />
    </>
  );
};

export default DeviceHealthChip;
