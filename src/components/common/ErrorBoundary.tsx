import React from 'react';
import { Button, Result } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { invoke as tauriInvoke } from '@tauri-apps/api/tauri';
import i18n from '../../i18n';

// Raw Tauri invoke on purpose: the wrapped one also reports to log_event on
// failure, which would loop if log_event itself is what fails.
function reportCrash(error: Error, errorInfo: React.ErrorInfo): void {
  tauriInvoke('log_event', {
    input: {
      level: 'error',
      subsystem: 'react.error_boundary',
      message: error.message ?? 'unknown error',
      extras: {
        name: error.name ?? null,
        stack: error.stack ?? null,
        componentStack: errorInfo.componentStack ?? null,
      },
    },
  }).catch(() => {});
}

interface BoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
  /** A change clears the crash (the route path, so leaving the page recovers). */
  resetKey?: string;
}

class Boundary extends React.Component<BoundaryProps, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: true } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    reportCrash(error, errorInfo);
  }

  componentDidUpdate(prev: BoundaryProps): void {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render(): React.ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

const reload = () => window.location.reload();

function PageCrash() {
  const navigate = useNavigate();
  return (
    <Result
      status="error"
      title={i18n.t('common:crash.title')}
      subTitle={i18n.t('common:crash.description')}
      extra={[
        <Button key="home" type="primary" onClick={() => navigate('/')}>
          {i18n.t('common:crash.goToDashboard')}
        </Button>,
        <Button key="reload" onClick={reload}>
          {i18n.t('common:crash.reload')}
        </Button>,
      ]}
    />
  );
}

/** Wraps the routed pages: a crash replaces only the page, and leaving the page clears it. */
export function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <Boundary fallback={<PageCrash />} resetKey={location.pathname}>
      {children}
    </Boundary>
  );
}

/** Last resort around the whole app, outside the router and providers. */
export function RootErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Boundary
      fallback={
        <div style={{ padding: 24 }}>
          <h2>{i18n.t('common:crash.title')}</h2>
          <p>{i18n.t('common:crash.description')}</p>
          <button type="button" onClick={reload}>
            {i18n.t('common:crash.reload')}
          </button>
        </div>
      }
    >
      {children}
    </Boundary>
  );
}
