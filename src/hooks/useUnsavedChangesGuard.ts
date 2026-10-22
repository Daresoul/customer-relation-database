import { useCallback, useEffect } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';

/**
 * While `dirty`, leaving asks first: `confirmLeave(leave)` runs `leave` at
 * once when nothing is unsaved, otherwise after the user picks Discard. A
 * reload or window close gets the browser's own prompt.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const { modal } = App.useApp();
  const { t } = useTranslation('medical');

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
      modal.confirm({
        title: t('medical:unsaved.title'),
        content: t('medical:unsaved.body'),
        okText: t('medical:unsaved.discard'),
        okButtonProps: { danger: true },
        cancelText: t('medical:unsaved.keepEditing'),
        onOk: leave,
      });
    },
    [dirty, modal, t],
  );
}
