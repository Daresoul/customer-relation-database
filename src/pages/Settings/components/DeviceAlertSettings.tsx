import React, { useEffect, useState } from 'react';
import { App, Button, Card, Checkbox, InputNumber, Space, Switch, TimePicker, Typography } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { invoke } from '@/services/invoke';
import { useDeviceIntegrations } from '../../../hooks/useDeviceIntegrations';
import type { DeviceAlertSettings as Settings, DeviceQuietAlert } from '../../../types/deviceIntegration';
import styles from '../Settings.module.css';
import { errorText } from '@/utils/notifyError';

const { Text } = Typography;

const DEFAULT_QUIET_HOURS = 4;
const DAY_KEYS = ['alerts.days.1', 'alerts.days.2', 'alerts.days.3', 'alerts.days.4', 'alerts.days.5', 'alerts.days.6', 'alerts.days.7'];

function toTime(text: string): Dayjs {
  const [h, m] = text.split(':').map(Number);
  return dayjs().hour(h || 0).minute(m || 0).second(0).millisecond(0);
}

/** Settings → Devices: when to get an OS notification about a lab machine. */
export const DeviceAlertSettings: React.FC = () => {
  const { t } = useTranslation('devices');
  const { message } = App.useApp();
  const { data: integrations } = useDeviceIntegrations();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke<Settings>('get_device_alert_settings')
      .then(setSettings)
      .catch((e) => message.error(t('alerts.loadFailed', { error: errorText(e, t) })));
  }, [message, t]);

  if (!settings) {
    return <Card loading className={styles.settingsCard} />;
  }

  const update = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });
  const quietFor = (id: number) => settings.quietAlerts.find((q) => q.integrationId === id);
  const setQuiet = (id: number, hours: number | null) => {
    const others = settings.quietAlerts.filter((q) => q.integrationId !== id);
    const next: DeviceQuietAlert[] = hours === null ? others : [...others, { integrationId: id, afterHours: hours }];
    update({ quietAlerts: next.sort((a, b) => a.integrationId - b.integrationId) });
  };
  const devices = (integrations ?? []).filter(
    (i) => i.enabled && (i.connectionType === 'serial_port' || i.connectionType === 'file_watch'),
  );

  const save = async () => {
    setSaving(true);
    try {
      const saved = await invoke<Settings>('update_device_alert_settings', { settings });
      setSettings(saved);
      message.success(t('alerts.saved'));
    } catch (e) {
      message.error(t('alerts.saveFailed', { error: errorText(e, t) }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      className={styles.settingsCard}
      title={
        <span className={styles.cardTitle}>
          <BellOutlined /> {t('alerts.title')}
        </span>
      }
      extra={
        <Button type="primary" loading={saving} onClick={save}>
          {t('alerts.save')}
        </Button>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Text type="secondary">{t('alerts.intro')}</Text>

        <Space wrap>
          <Switch
            aria-label={t('alerts.notifyEnabled')}
            checked={settings.notifyEnabled}
            onChange={(notifyEnabled) => update({ notifyEnabled })}
          />
          <Text>{t('alerts.notifyEnabled')}</Text>
          <InputNumber
            aria-label={t('alerts.downAfterMinutes')}
            min={1}
            max={1440}
            value={settings.downAfterMinutes}
            onChange={(v) => update({ downAfterMinutes: Number(v) || 1 })}
          />
          <Text>{t('alerts.downAfterMinutes')}</Text>
        </Space>

        <div>
          <div>
            <Text strong>{t('alerts.clinicHours')}</Text>
          </div>
          <Space wrap>
            <TimePicker
              aria-label={t('alerts.opens')}
              format="HH:mm"
              minuteStep={15}
              allowClear={false}
              value={toTime(settings.clinicOpen)}
              onChange={(v) => v && update({ clinicOpen: v.format('HH:mm') })}
            />
            <Text>–</Text>
            <TimePicker
              aria-label={t('alerts.closes')}
              format="HH:mm"
              minuteStep={15}
              allowClear={false}
              value={toTime(settings.clinicClose)}
              onChange={(v) => v && update({ clinicClose: v.format('HH:mm') })}
            />
          </Space>
          <div style={{ marginTop: 8 }}>
            <Checkbox.Group
              value={settings.clinicDays}
              onChange={(days) => update({ clinicDays: (days as number[]).slice().sort((a, b) => a - b) })}
              options={DAY_KEYS.map((key, i) => ({ label: t(key), value: i + 1 }))}
            />
          </div>
        </div>

        {devices.length > 0 && (
          <div>
            <div>
              <Text strong>{t('alerts.quietTitle')}</Text>
            </div>
            <Text type="secondary">{t('alerts.quietIntro')}</Text>
            {devices.map((d) => {
              const quiet = quietFor(d.id);
              return (
                <div key={d.id} style={{ marginTop: 8 }}>
                  <Space wrap>
                    <Switch
                      aria-label={t('alerts.quietFor', { name: d.name })}
                      checked={!!quiet}
                      onChange={(on) => setQuiet(d.id, on ? DEFAULT_QUIET_HOURS : null)}
                    />
                    <Text>{d.name}</Text>
                    {quiet && (
                      <>
                        <InputNumber
                          aria-label={t('alerts.quietHours', { name: d.name })}
                          min={1}
                          max={72}
                          value={quiet.afterHours}
                          onChange={(v) => setQuiet(d.id, Number(v) || 1)}
                        />
                        <Text>{t('alerts.hoursWithoutResults')}</Text>
                      </>
                    )}
                  </Space>
                </div>
              );
            })}
          </div>
        )}
      </Space>
    </Card>
  );
};

export default DeviceAlertSettings;
