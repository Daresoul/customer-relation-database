import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';

/**
 * While `dirty`, leaving asks first:
 * - any in-app navigation (header, sidebar, links, Back) is held until the
 *   user picks Discard; needs the data router (`createBrowserRouter`);
 * - `confirmLeave(leave)` does the same for actions that are not navigation
 *   (closing a form); a navigation it starts after Discard is not asked again;
 * - a reload or window close gets the browser's own prompt.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const { modal } = App.useApp();
  const { t } = useTranslation('medical');
  const confirmedRef = useRef(false);

  useEffect(() => {
    if (dirty) confirmedRef.current = false;
  }, [dirty]);

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        dirty && !confirmedRef.current && currentLocation.pathname !== nextLocation.pathname,
      [dirty],
    ),
  );

  const ask = useCallback(
    (onDiscard: () => void, onKeep?: () => void) => {
      modal.confirm({
        title: t('medical:unsaved.title'),
        content: t('medical:unsaved.body'),
        okText: t('medical:unsaved.discard'),
        okButtonProps: { danger: true },
        cancelText: t('medical:unsaved.keepEditing'),
        onOk: onDiscard,
        onCancel: onKeep,
      });
    },
    [modal, t],
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    ask(
      () => {
        confirmedRef.current = true;
        blocker.proceed();
      },
      () => blocker.reset(),
    );
  }, [blocker, ask]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return useCallback(
    (leave: () => void) => {
      if (!dirty) {
        leave();
        return;
      }
      ask(() => {
        confirmedRef.current = true;
        leave();
      });
    },
    [dirty, ask],
  );
}
