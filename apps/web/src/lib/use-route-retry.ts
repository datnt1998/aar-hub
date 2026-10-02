import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

/**
 * For a route `errorComponent`: clears failed queries so they fetch again, and returns a retry that re-runs the
 * route loaders. Pattern from the TanStack Router "external data loading" guide.
 */
export function useRouteRetry(): () => Promise<void> {
  const router = useRouter();
  const queryErrorResetBoundary = useQueryErrorResetBoundary();

  useEffect(() => {
    queryErrorResetBoundary.reset();
  }, [queryErrorResetBoundary]);

  return () => router.invalidate();
}
