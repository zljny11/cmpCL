import { Module } from '@nestjs/common';
import { PacsCompatController } from './pacs-compat.controller';
import { RequirementsController } from './requirement.controller';
import { RequirementsService } from './requirement.service';

@Module({
  controllers: [RequirementsController, PacsCompatController],
  providers: [RequirementsService],
})
export class RequirementsModule {}
