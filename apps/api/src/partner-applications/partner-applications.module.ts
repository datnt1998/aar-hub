import { Module } from '@nestjs/common';
import { PartnerApplicationsController } from './partner-applications.controller.js';
import { PartnerApplicationsService } from './partner-applications.service.js';

@Module({
  controllers: [PartnerApplicationsController],
  providers: [PartnerApplicationsService],
})
export class PartnerApplicationsModule {}
