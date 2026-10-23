import { useEffect } from 'react';
import { useMatches } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/** Sets the window title from the route's `handle.titleKey`: "Arkivet — <page>". */
export function DocumentTitle() {
  const { t } = useTranslation('shell');
  const matches = useMatches();
  const titleKey = [...matches]
    .reverse()
    .map((m) => (m.handle as { titleKey?: string } | undefined)?.titleKey)
    .find(Boolean);

  useEffect(() => {
    document.title = titleKey
      ? t('shell:pageTitle.format', { page: t(titleKey) })
      : t('shell:header.appName');
  }, [titleKey, t]);

  return null;
}
