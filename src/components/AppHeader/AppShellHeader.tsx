import React, { useEffect } from 'react';
import { Button, theme } from 'antd';
import { SearchOutlined, SettingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useGlobalSearch } from './useGlobalSearch';
import { BackupHealthLight } from './BackupHealthLight';
import { useRememberOpenedPatient } from './useRememberOpenedPatient';
import styles from './AppHeader.module.css';

export interface AppShellHeaderProps {
  /** Lab inbox badge (waiting results); the lab-inbox feature plugs in here. */
  labInboxSlot?: React.ReactNode;
  /** Compact device status, if a page wants it in the header. */
  deviceStatusSlot?: React.ReactNode;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
}

/** Top bar on every page: home, patient search (Ctrl/Cmd+K or /), status lights, Settings. */
export function AppShellHeader({ labInboxSlot, deviceStatusSlot }: AppShellHeaderProps) {
  const { t } = useTranslation('shell');
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { openSearch } = useGlobalSearch();
  useRememberOpenedPatient();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const commandK = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k';
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target);
      if (commandK || slash) {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openSearch]);

  return (
    <header
      className={styles.header}
      style={{ background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}` }}
    >
      <Link to="/" className={styles.appName} title={t('shell:header.home')}>
        {t('shell:header.appName')}
      </Link>
      <Button className={styles.searchTrigger} icon={<SearchOutlined />} onClick={() => openSearch()}>
        {t('shell:header.searchButton')}
        <span className={styles.shortcut}>{t('shell:header.searchShortcut')}</span>
      </Button>
      <div className={styles.status}>
        {labInboxSlot}
        {deviceStatusSlot}
        <BackupHealthLight />
        <Button icon={<SettingOutlined />} onClick={() => navigate('/settings')}>
          {t('shell:header.settings')}
        </Button>
      </div>
    </header>
  );
}
