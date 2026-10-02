import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Returns } from '../common/http/decorators.js';
import { type Health, HealthSchema } from './health.schemas.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @Returns(HttpStatus.OK, HealthSchema)
  check(): Health {
    return this.health.check();
  }
}
