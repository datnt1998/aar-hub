import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type RegisteredRouter, RouterProvider } from '@tanstack/react-router';

/** Providers shared by main.tsx and component tests. */
export function App({ queryClient, router }: { queryClient: QueryClient; router: RegisteredRouter }) {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
