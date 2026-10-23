import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { PatientSearchPalette } from './PatientSearchPalette';

interface GlobalSearch {
  /** Opens the patient search, optionally with text already typed (a scanned chip). */
  openSearch: (query?: string) => void;
}

const GlobalSearchContext = createContext<GlobalSearch>({ openSearch: () => undefined });

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

export function useGlobalSearch(): GlobalSearch {
  return useContext(GlobalSearchContext);
}
