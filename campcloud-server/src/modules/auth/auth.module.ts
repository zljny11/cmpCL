import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtUtil } from '../../common/utils/jwt';
import { AdminLogsModule } from '../admin-logs/admin-logs.module';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [UsersModule, AdminLogsModule, MailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtUtil,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
