import { createFileRoute } from '@tanstack/react-router';
import { HealthPage, HealthPageError } from '../features/health/health-page';
import { healthQuery } from '../features/health/queries';

export const Route = createFileRoute('/')({
  // Cached data is returned as is (`staleTime: 'static'`); the screen's query refreshes it in the background.
  loader: async ({ context }) => {
    await context.queryClient.query({ ...healthQuery(), staleTime: 'static' });
  },
  component: HealthPage,
  errorComponent: HealthPageError,
});
