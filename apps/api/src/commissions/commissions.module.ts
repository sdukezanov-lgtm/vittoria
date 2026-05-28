import { Module } from '@nestjs/common';
import { CommissionsService } from './commissions.service';
import { CommissionsMapper } from './commissions.mapper';
import { AdminCommissionsController } from './admin-commissions.controller';
import { PartnerCommissionsController } from './partner-commissions.controller';

@Module({
  controllers: [AdminCommissionsController, PartnerCommissionsController],
  providers: [CommissionsService, CommissionsMapper],
  exports: [CommissionsService],
})
export class CommissionsModule {}
