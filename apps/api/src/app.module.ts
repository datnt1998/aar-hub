import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ProblemFilter } from './common/http/problem.filter.js';
import { ResponseSerializerInterceptor } from './common/http/response-serializer.js';
import { ClockModule } from './common/time/clock.js';
import { envSchema } from './config/env.js';
import { DbModule } from './db/db.module.js';
import { HealthModule } from './health/health.module.js';
import { PartnerApplicationsModule } from './partner-applications/partner-applications.module.js';
import { PartnersModule } from './partners/partners.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, skipProcessEnv: true, validationSchema: envSchema }),
    ClockModule,
    DbModule,
    HealthModule,
    PartnerApplicationsModule,
    PartnersModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ProblemFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseSerializerInterceptor },
  ],
})
export class AppModule {}
