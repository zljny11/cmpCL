import { Module } from '@nestjs/common';
import { ProfilesController } from './profile.controller';
import { ProfilesService } from './profile.service';

@Module({
  controllers: [ProfilesController],
  providers: [ProfilesService],
})
export class ProfilesModule {}
