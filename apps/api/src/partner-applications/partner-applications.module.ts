import { Module } from '@nestjs/common';
import { MalwareScanModule } from '../malware-scan/malware-scan.module.js';
import { PartnerApplicationsController } from './partner-applications.controller.js';
import { PartnerApplicationsRepository } from './partner-applications.repository.js';
import { PartnerApplicationsService } from './partner-applications.service.js';

@Module({
  imports: [MalwareScanModule],
  controllers: [PartnerApplicationsController],
  providers: [PartnerApplicationsService, PartnerApplicationsRepository],
})
export class PartnerApplicationsModule {}
