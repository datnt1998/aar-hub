import { $api } from '../../api/client';

/** Same options in the route loader (`queryClient.query`) and the screen (`useSuspenseQuery`), so keys always match. */
export const healthQuery = () => $api.queryOptions('get', '/api/health');
