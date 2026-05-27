import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { AdminOperationLogCategory } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { extractRequestIp } from '../../common/utils/request';
import { AuthUser } from '../../types/auth-user';
import { AdminLogsService } from '../admin-logs/admin-logs.service';
import { ProfilesService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
export class ProfilesController {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly adminLogsService: AdminLogsService,
  ) {}

  @Get()
  getProfile(@CurrentUser() user: AuthUser) {
    return this.profilesService.getProfile(BigInt(user.id));
  }

  @Put()
  async updateProfile(@CurrentUser() user: AuthUser, @Req() request: Request, @Body() dto: UpdateProfileDto) {
    const profile = await this.profilesService.updateProfile(BigInt(user.id), dto);
    await this.adminLogsService.createLog({
      actor: user,
      category: AdminOperationLogCategory.user,
      action: '修改个人资料',
      targetType: 'user_profile',
      targetId: user.id,
      targetName: user.username,
      detail: {
        realName: profile.realName,
        email: profile.email,
        phone: profile.phone,
        wechat: profile.wechat,
        department: profile.department,
        title: profile.title,
      },
      ipAddress: extractRequestIp(request),
    });
    return profile;
  }
}
