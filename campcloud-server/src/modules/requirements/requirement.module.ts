import { Module } from '@nestjs/common';
import { AdminLogsModule } from '../admin-logs/admin-logs.module';
import { MailModule } from '../mail/mail.module';
import { PacsCompatController } from './pacs-compat.controller';
import { NotificationsController, RequirementsController } from './requirement.controller';
import { RequirementsService } from './requirement.service';

@Module({
  imports: [MailModule, AdminLogsModule],
  controllers: [RequirementsController, NotificationsController, PacsCompatController],
  providers: [RequirementsService],
})
export class RequirementsModule {}
