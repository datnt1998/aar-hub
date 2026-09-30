import { Injectable } from '@nestjs/common';
import type { HealthDto } from './health.dto.js';

@Injectable()
export class HealthService {
  check(): HealthDto {
    return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) };
  }
}
