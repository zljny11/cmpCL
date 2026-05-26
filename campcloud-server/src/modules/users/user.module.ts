import { Module } from '@nestjs/common';
import { AdminLogsModule } from '../admin-logs/admin-logs.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [AdminLogsModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UsersModule {}
