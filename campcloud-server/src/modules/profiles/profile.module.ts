import { Module } from '@nestjs/common';
import { AdminLogsModule } from '../admin-logs/admin-logs.module';
import { ProfilesController } from './profile.controller';
import { ProfilesService } from './profile.service';

@Module({
  imports: [AdminLogsModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
})
export class ProfilesModule {}
