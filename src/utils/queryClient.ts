import { QueryCache, QueryClient } from '@tanstack/react-query';
import type { ErrorReport } from './globalErrorReporting';

const MAX_MESSAGE = 1000;

/**
 * The app's query client: one retry, so a failed load shows its error in
 * about a second, and every failed query reported with its key.
 */
export function createQueryClient(report: (r: ErrorReport) => void): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        try {
          const message = error instanceof Error ? error.message : String(error);
          report({
            level: 'error',
            subsystem: 'webview.query_failed',
            message: (message || 'unknown error').slice(0, MAX_MESSAGE),
            extras: { queryKey: JSON.stringify(query.queryKey) },
          });
        } catch {
          // reporting must never replace the query's own error
        }
      },
    }),
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
      },
    },
  });
}
