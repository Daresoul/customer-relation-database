import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Descriptions, Drawer, Space, Switch, Typography, theme } from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  CopyOutlined,
  FolderOpenOutlined,
  MinusCircleFilled,
  ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { invoke } from '@/services/invoke';
import { useDeviceConnectionStatus, useDeviceIntegrations, useFileWatcherStatus } from '../../hooks/useDeviceIntegrations';
import { DeviceDetails, DeviceType, getDeviceTypeDisplayName } from '../../types/deviceIntegration';
import { describeFolderStatus, describeSerialStatus, folderLevel, formatDownSince, formatLastResult, formatToday, HealthLevel, serialDownSince, serialLevel } from './deviceHealth';
import { errorText } from '@/utils/notifyError';
import { formatDayMonth } from '@/utils/dateFormatter';
import styles from './DeviceOverview.module.css';

const { Text, Title } = Typography;

/** How often the drawer refreshes the byte counter and last message while open. */
const REFRESH_MS = 2000;
const RESULTS_REFRESH_MS = 30_000;

const LOG_LABELS = [
  'Connected',
  'Connecting',
  'Disconnected',
  'Error',
  'Watching',
  'Stopped',
  'parse_failed',
  'empty_result',
  'cut_off',
  'save_failed',
  'folder_lost',
];

export const HealthIcon: React.FC<{ level: HealthLevel }> = ({ level }) => {
  const { token } = theme.useToken();
  if (level === 'working') return <CheckCircleFilled style={{ color: token.colorSuccess }} />;
  if (level === 'down') return <CloseCircleFilled style={{ color: token.colorError }} />;
  return <MinusCircleFilled style={{ color: token.colorTextQuaternary }} />;
};

/** "10:42" today, "21.10. 10:42" on another day. */
function clock(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = dayjs(iso);
  if (!at.isValid()) return null;
  return at.isSame(dayjs(), 'day') ? at.format('HH:mm') : formatDayMonth(iso, true);
}

export interface DeviceDetailsDrawerProps {
  open: boolean;
  integrationId?: number | null;
  onClose: () => void;
}

/** One lab machine: what's going on, what to do, live traffic, last message, and support tools. */
export const DeviceDetailsDrawer: React.FC<DeviceDetailsDrawerProps> = ({ open, integrationId, onClose }) => {
  const { t } = useTranslation('devices');
  const { message } = App.useApp();
  const { data: integrations } = useDeviceIntegrations();
  const { getStatus: getSerialStatus } = useDeviceConnectionStatus();
  const { getStatus: getFolderStatus } = useFileWatcherStatus();

  const [selectedId, setSelectedId] = useState<number | null>(integrationId ?? null);
  const [details, setDetails] = useState<DeviceDetails | null>(null);
  const [showHex, setShowHex] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (open) setSelectedId(integrationId ?? null);
  }, [open, integrationId]);

  useEffect(() => {
    if (!open || selectedId == null) return undefined;
    let cancelled = false;
    const load = () =>
      invoke<DeviceDetails>('get_device_details', { integrationId: selectedId })
        .then((d) => {
          if (!cancelled) setDetails(d);
        })
        .catch(() => {});
    setDetails(null);
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, selectedId]);

  const [resultsToday, setResultsToday] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const load = () =>
      invoke<Record<string, number>>('get_results_today')
        .then((r) => {
          if (!cancelled) setResultsToday(r ?? {});
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, RESULTS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open]);

  const devices = (integrations ?? []).filter(
    (i) => i.enabled && (i.connectionType === 'serial_port' || i.connectionType === 'file_watch'),
  );
  const device = (integrations ?? []).find((i) => i.id === selectedId);

  const run = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setBusy(key);
      try {
        await action();
      } catch (e) {
        message.error(t('drawer.actionFailed', { error: errorText(e, t) }));
      } finally {
        setBusy(null);
      }
    },
    [message, t],
  );

  const reconnect = () =>
    run('reconnect', async () => {
      await invoke('reconnect_device_listeners');
      message.success(t('drawer.reconnectStarted'));
    });
  const copyDiagnostics = () =>
    run('copy', async () => {
      const text = await invoke<string>('get_device_diagnostics', { integrationId: selectedId });
      await navigator.clipboard.writeText(text);
      message.success(t('drawer.copied'));
    });
  const openLogFolder = () => run('logs', () => invoke('open_device_log_folder'));

  const isSerial = device?.connectionType === 'serial_port';
  const serialStatus = device && isSerial ? getSerialStatus(device.id) : undefined;
  const folderStatus = device && !isSerial ? getFolderStatus(device.id) : undefined;
  const health = isSerial ? describeSerialStatus(serialStatus, t) : describeFolderStatus(folderStatus, t);
  const level = isSerial ? serialLevel(serialStatus, serialDownSince(serialStatus)) : folderLevel(folderStatus);
  const lastResult = formatLastResult(serialStatus?.last_result_at ?? folderStatus?.last_result_at, new Date(), t);
  const lastData = clock(serialStatus?.last_byte_at);
  const raw = details?.lastRaw;
  const recent = [...(details?.log ?? [])].reverse().slice(0, 8);
  const downLine = formatDownSince(details?.downSince, serialStatus?.retry_count ?? 0, serialStatus?.next_retry, t);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={560}
      title={t('drawer.title')}
      destroyOnClose
      footer={
        device && (
          <Space wrap>
            <Button icon={<ReloadOutlined />} loading={busy === 'reconnect'} onClick={reconnect}>
              {t('drawer.reconnect')}
            </Button>
            <Button icon={<CopyOutlined />} loading={busy === 'copy'} onClick={copyDiagnostics}>
              {t('drawer.copyDiagnostics')}
            </Button>
            <Button icon={<FolderOpenOutlined />} loading={busy === 'logs'} onClick={openLogFolder}>
              {t('drawer.openLogFolder')}
            </Button>
          </Space>
        )
      }
    >
      {devices.length > 1 && (
        <div className={styles.list}>
          {devices.map((d) => {
            const serial = d.connectionType === 'serial_port' ? getSerialStatus(d.id) : undefined;
            const folder = d.connectionType === 'file_watch' ? getFolderStatus(d.id) : undefined;
            const rowLevel = serial || d.connectionType === 'serial_port' ? serialLevel(serial, serialDownSince(serial)) : folderLevel(folder);
            const last = formatLastResult(serial?.last_result_at ?? folder?.last_result_at, new Date(), t) ?? t('drawer.noResultYet');
            return (
              <button
                key={d.id}
                type="button"
                className={styles.row}
                aria-pressed={d.id === selectedId}
                onClick={() => setSelectedId(d.id)}
              >
                <span className={styles.icon}><HealthIcon level={rowLevel} /></span>
                <span className={styles.name}>{d.name}</span>
                <span className={styles.state}>{t(`chip.state.${rowLevel}`)}</span>
                <span className={styles.facts}>
                  {last} · <span>{t('drawer.resultsToday', { count: resultsToday[d.id] ?? 0 })}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {!device ? (
        <Text type="secondary">{t('drawer.noDevice')}</Text>
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Title level={5} style={{ margin: 0 }}>
              {device.name}
            </Title>
            <div>
              <Text type="secondary">{getDeviceTypeDisplayName(device.deviceType as DeviceType)}</Text>
            </div>
            <Text type="secondary">
              {isSerial
                ? t('tooltips.port', { port: device.serialPortName })
                : t('tooltips.directory', { directory: device.watchDirectory })}
            </Text>
          </div>

          <div>
            <Space align="start">
              <HealthIcon level={level} />
              <div>
                <div>
                  <Text strong>{health.text}</Text>
                </div>
                {health.action && <Text>{health.action}</Text>}
                {downLine && (
                  <div>
                    <Text type="secondary">{downLine}</Text>
                  </div>
                )}
                {health.details && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t('health.details')}: {health.details}
                    </Text>
                  </div>
                )}
              </div>
            </Space>
          </div>

          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('drawer.lastResultLabel')}>{lastResult ?? t('drawer.noResultYet')}</Descriptions.Item>
            {isSerial && (
              <Descriptions.Item label={t('drawer.lastDataLabel')}>
                {lastData ? t('drawer.lastData', { time: lastData }) : t('drawer.noDataYet')}
              </Descriptions.Item>
            )}
            <Descriptions.Item label={t('drawer.todayLabel')}>
              {formatToday(details?.outagesToday ?? 0, details?.downMinutesToday ?? 0, t)}
            </Descriptions.Item>
            {isSerial && (
              <Descriptions.Item label={t('drawer.liveLabel')}>
                {t('drawer.bytesLastMinute', { count: details?.bytesLastMinute ?? 0 })}
              </Descriptions.Item>
            )}
          </Descriptions>

          {recent.length > 0 && (
            <div>
              <Text strong>{t('drawer.recentTitle')}</Text>
              {recent.map((e) => (
                <div key={`${e.at}-${e.label}`}>
                  <Text type={e.isError ? 'danger' : 'secondary'}>
                    {clock(e.at)} ·{' '}
                    {LOG_LABELS.includes(e.label) ? t(`drawer.log.${e.label}`) : e.label}
                    {e.errorKind ? ` (${t(`health.kinds.${e.errorKind}.title`, { port: device.serialPortName, directory: device.watchDirectory })})` : ''}
                  </Text>
                </div>
              ))}
            </div>
          )}

          <div>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Text strong>
                {raw ? t('drawer.lastRaw', { time: clock(raw.at), count: raw.byteCount }) : t('drawer.lastRawTitle')}
              </Text>
              <Space>
                <Text type="secondary">{t('drawer.showHex')}</Text>
                <Switch size="small" aria-label={t('drawer.showHex')} checked={showHex} onChange={setShowHex} disabled={!raw} />
              </Space>
            </Space>
            {raw ? (
              <>
                <pre
                  data-testid="device-raw-message"
                  style={{ maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12, margin: '8px 0 0' }}
                >
                  {showHex ? raw.hex : raw.text}
                </pre>
                {raw.truncated && <Text type="secondary">{t('drawer.rawTruncated')}</Text>}
              </>
            ) : (
              <div>
                <Text type="secondary">{t('drawer.noRawYet')}</Text>
              </div>
            )}
          </div>
        </Space>
      )}
    </Drawer>
  );
};

export default DeviceDetailsDrawer;
