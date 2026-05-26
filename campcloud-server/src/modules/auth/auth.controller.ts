import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { AdminOperationLogCategory, UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { extractRequestIp } from '../../common/utils/request';
import { AuthUser } from '../../types/auth-user';
import { AdminLogsService } from '../admin-logs/admin-logs.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly adminLogsService: AdminLogsService,
  ) {}

  @Post('login')
  @Public()
  async login(@Req() request: Request, @Body() dto: LoginDto) {
    const result = await this.authService.login(dto);
    if (result.user.role === UserRole.admin) {
      await this.adminLogsService.createLog({
        actor: result.user,
        category: AdminOperationLogCategory.auth,
        action: '管理员登录',
        targetType: 'auth',
        targetName: result.user.username,
        ipAddress: extractRequestIp(request),
      });
    }
    return result;
  }

  @Get('me')
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(BigInt(user.id));
  }

  @Post('logout')
  @ApiBearerAuth()
  async logout(@CurrentUser() user: AuthUser, @Req() request: Request) {
    if (user.role === UserRole.admin) {
      await this.adminLogsService.createLog({
        actor: user,
        category: AdminOperationLogCategory.auth,
        action: '管理员登出',
        targetType: 'auth',
        targetName: user.username,
        ipAddress: extractRequestIp(request),
      });
    }
    return { success: true };
  }
}
