import { Module } from '@nestjs/common';
import { RequirementsController } from './requirement.controller';
import { RequirementsService } from './requirement.service';

@Module({
  controllers: [RequirementsController],
  providers: [RequirementsService],
})
export class RequirementsModule {}
