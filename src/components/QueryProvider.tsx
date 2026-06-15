'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  persistQueryClient,
  type PersistedClient,
} from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

const STORAGE_KEY = 'hytta-query-cache';
const ONE_WEEK_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * Client-side query cache with localStorage persistence. Used to keep the
 * booking-in-progress draft so users who navigate away or refresh the page
 * do not lose what they were filling out.
 *
 * The provider tree stays constant — `QueryClientProvider` is rendered both
 * on the server and the client. Persistence is registered in a `useEffect`
 * after hydration to keep the React tree stable (no re-mount of children,
 * no loss of in-flight state).
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: ONE_WEEK_MS,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  React.useEffect(() => {
    const persister = createSyncStoragePersister({
      storage: window.localStorage,
      key: STORAGE_KEY,
      // Tolerate a truncated/corrupt cache entry — e.g. a write interrupted by
      // a storage-quota error or a second tab — instead of throwing
      // "Unexpected end of JSON input" during restore. Drop the bad entry and
      // start with a fresh cache.
      deserialize: (cached): PersistedClient => {
        try {
          return JSON.parse(cached) as PersistedClient;
        } catch {
          try {
            window.localStorage.removeItem(STORAGE_KEY);
          } catch {
            // ignore — storage unavailable / private mode
          }
          return undefined as unknown as PersistedClient;
        }
      },
    });
    const result = persistQueryClient({
      queryClient: client,
      persister,
      maxAge: ONE_WEEK_MS,
    });
    return Array.isArray(result)
      ? (result[0] as () => void)
      : (result as unknown as () => void);
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
