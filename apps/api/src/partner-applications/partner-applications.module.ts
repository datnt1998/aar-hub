import { Module } from '@nestjs/common';
import { PartnerApplicationsController } from './partner-applications.controller.js';
import { PartnerApplicationsRepository } from './partner-applications.repository.js';
import { PartnerApplicationsService } from './partner-applications.service.js';

@Module({
  controllers: [PartnerApplicationsController],
  providers: [PartnerApplicationsService, PartnerApplicationsRepository],
})
export class PartnerApplicationsModule {}
