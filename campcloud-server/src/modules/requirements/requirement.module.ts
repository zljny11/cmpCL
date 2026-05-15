import { Module } from '@nestjs/common';
import { PacsCompatController } from './pacs-compat.controller';
import { NotificationsController, RequirementsController } from './requirement.controller';
import { RequirementsService } from './requirement.service';

@Module({
  controllers: [RequirementsController, NotificationsController, PacsCompatController],
  providers: [RequirementsService],
})
export class RequirementsModule {}
