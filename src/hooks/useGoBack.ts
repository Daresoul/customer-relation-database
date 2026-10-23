import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Back to the page the user came from, or `fallback` when this page was the
 * first one opened. The browser router keeps its position in
 * `history.state.idx`; elsewhere (memory router) the first entry has the key
 * "default".
 */
export function useGoBack(fallback = '/'): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    const canGoBack = typeof idx === 'number' ? idx > 0 : location.key !== 'default';
    if (canGoBack) navigate(-1);
    else navigate(fallback);
  }, [navigate, location.key, fallback]);
}
