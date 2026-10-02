import { z } from 'zod';

export const HealthSchema = z
  .object({
    status: z.literal('ok').meta({ description: 'API process is up and serving requests' }),
    uptimeSeconds: z.int().min(0).meta({ description: 'Seconds since the API process started' }),
  })
  .meta({ id: 'Health' });

export type Health = z.infer<typeof HealthSchema>;
