import React from 'react';

export function GlobalSearchProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useGlobalSearch() {
  return { openSearch: (_query?: string) => undefined };
}
