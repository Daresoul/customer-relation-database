import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';

const logEvent = vi.fn();
vi.mock('@tauri-apps/api/tauri', () => ({ invoke: (...a: unknown[]) => logEvent(...a) }));

import i18n from '../../../i18n';
import { RouteErrorBoundary, RootErrorBoundary } from '../ErrorBoundary';

function Boom(): React.ReactElement {
  throw new Error('render exploded');
}

describe('error boundaries', () => {
  beforeEach(async () => {
    logEvent.mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await i18n.changeLanguage('mk');
  });
  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    logEvent.mockClear();
    await i18n.changeLanguage('en');
  });

  it('a page that crashes shows a translated message with Reload and Go to dashboard, and logs it', () => {
    render(
      <MemoryRouter initialEntries={['/patients/1']}>
        <RouteErrorBoundary>
          <Routes>
            <Route path="/" element={<div>dashboard page</div>} />
            <Route path="/patients/:id" element={<Boom />} />
          </Routes>
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText(i18n.t('common:crash.title'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('common:crash.reload'))).toBeInTheDocument();
    expect(i18n.t('common:crash.title')).not.toBe('Something went wrong');
    expect(logEvent).toHaveBeenCalledWith('log_event', expect.anything());

    fireEvent.click(screen.getByText(i18n.t('common:crash.goToDashboard')));
    expect(screen.getByText('dashboard page')).toBeInTheDocument();
  });

  it('moving to another page clears the crash', () => {
    render(
      <MemoryRouter initialEntries={['/patients/1']}>
        <Link to="/households/2">to household</Link>
        <RouteErrorBoundary>
          <Routes>
            <Route path="/households/:id" element={<div>household page</div>} />
            <Route path="/patients/:id" element={<Boom />} />
          </Routes>
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('to household'));
    expect(screen.getByText('household page')).toBeInTheDocument();
  });

  it('the last-resort boundary is translated and offers Reload', () => {
    render(
      <RootErrorBoundary>
        <Boom />
      </RootErrorBoundary>,
    );

    expect(screen.getByText(i18n.t('common:crash.title'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('common:crash.reload') })).toBeInTheDocument();
  });
});
