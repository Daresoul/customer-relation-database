import React, { useCallback, useMemo, useState } from 'react';
import { PatientSearchPalette } from './PatientSearchPalette';
import { GlobalSearchContext } from './useGlobalSearch';

export function GlobalSearchProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<{ key: number; query: string } | null>(null);

  const openSearch = useCallback((query?: string) => {
    setSession((s) => ({ key: (s?.key ?? 0) + 1, query: query ?? '' }));
  }, []);
  const close = useCallback(() => setSession(null), []);
  const value = useMemo(() => ({ openSearch }), [openSearch]);

  return (
    <GlobalSearchContext.Provider value={value}>
      {children}
      {session && <PatientSearchPalette key={session.key} initialQuery={session.query} onClose={close} />}
    </GlobalSearchContext.Provider>
  );
}
