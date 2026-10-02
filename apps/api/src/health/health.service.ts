import { Injectable } from '@nestjs/common';
import type { Health } from './health.schemas.js';

@Injectable()
export class HealthService {
  check(): Health {
    return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) };
  }
}
