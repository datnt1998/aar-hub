import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module.js';
import { HealthModule } from './health/health.module.js';
import { PartnerApplicationsModule } from './partner-applications/partner-applications.module.js';

@Module({
  imports: [DbModule, HealthModule, PartnerApplicationsModule],
})
export class AppModule {}
