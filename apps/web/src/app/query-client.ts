import { QueryClient } from '@tanstack/react-query';
import { isProblem } from '../api/problem';

/**
 * Reads retry network and 5xx failures twice; a 4xx is an answer, not a glitch, so it shows at once.
 * `staleTime` keeps the data a route loader just fetched from being fetched again when the screen mounts;
 * mutations refresh what they change with `invalidateQueries`.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => !(isProblem(error) && error.status < 500) && failureCount < 2,
      },
    },
  });
}
