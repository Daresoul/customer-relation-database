import { createContext, useContext } from 'react';

export interface GlobalSearch {
  /** Opens the patient search, optionally with text already typed (a scanned chip). */
  openSearch: (query?: string) => void;
}

export const GlobalSearchContext = createContext<GlobalSearch>({ openSearch: () => undefined });

export function useGlobalSearch(): GlobalSearch {
  return useContext(GlobalSearchContext);
}
