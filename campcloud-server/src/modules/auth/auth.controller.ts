import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { AdminOperationLogCategory } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { extractRequestIp } from '../../common/utils/request';
import { AuthUser } from '../../types/auth-user';
import { AdminLogsService } from '../admin-logs/admin-logs.service';
import { AuthService } from './auth.service';
import { LoginWithEmailCodeDto } from './dto/login-with-email-code.dto';
import { LoginDto } from './dto/login.dto';
import { RequestPasswordResetCodeDto } from './dto/request-password-reset-code.dto';

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
    await this.adminLogsService.createLog({
      actor: result.user,
      category: AdminOperationLogCategory.auth,
      action: '登录',
      targetType: 'auth',
      targetId: result.user.id,
      targetName: result.user.username,
      ipAddress: extractRequestIp(request),
    });
    return result;
  }

  @Post('password-reset/request-code')
  @Public()
  requestPasswordResetCode(@Body() dto: RequestPasswordResetCodeDto) {
    return this.authService.requestPasswordResetCode(dto);
  }

  @Post('password-reset/login')
  @Public()
  async loginWithEmailCode(@Req() request: Request, @Body() dto: LoginWithEmailCodeDto) {
    const result = await this.authService.loginWithEmailCode(dto);
    if (dto.newPassword?.trim()) {
      await this.adminLogsService.createLog({
        actor: result.user,
        category: AdminOperationLogCategory.auth,
        action: '修改密码',
        targetType: 'auth',
        targetId: result.user.id,
        targetName: result.user.username,
        detail: {
          method: 'email_code',
        },
        ipAddress: extractRequestIp(request),
      });
    }
    await this.adminLogsService.createLog({
      actor: result.user,
      category: AdminOperationLogCategory.auth,
      action: '登录',
      targetType: 'auth',
      targetId: result.user.id,
      targetName: result.user.username,
      detail: {
        method: 'email_code',
      },
      ipAddress: extractRequestIp(request),
    });
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
    await this.adminLogsService.createLog({
      actor: user,
      category: AdminOperationLogCategory.auth,
      action: '登出',
      targetType: 'auth',
      targetId: user.id,
      targetName: user.username,
      ipAddress: extractRequestIp(request),
    });
    return { success: true };
  }
}
