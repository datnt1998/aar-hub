import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/app';
import { createQueryClient } from '../app/query-client';
import { createAppRouter } from '../app/router';

/**
 * Renders the real app at `path`: real routes, loaders and error screens, with the API answered by the MSW
 * handlers of the test. Queries do not retry, so an error shows at once.
 */
export function renderRoute(path: string) {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } });
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
  const user = userEvent.setup();
  render(<App queryClient={queryClient} router={router} />);
  return { user, router, queryClient };
}
