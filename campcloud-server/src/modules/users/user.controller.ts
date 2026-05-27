import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { AdminOperationLogCategory, UserRole } from '@prisma/client';
import type { Request } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { extractRequestIp } from '../../common/utils/request';
import { AuthUser } from '../../types/auth-user';
import { AdminLogsService } from '../admin-logs/admin-logs.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UserService } from './user.service';

@Roles(UserRole.admin)
@Controller('admin/users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly adminLogsService: AdminLogsService,
  ) {}

  @Get()
  listUsers(@Query() query: ListUsersDto) {
    return this.userService.listUsers(query);
  }

  @Post()
  async createUser(@CurrentUser() user: AuthUser, @Req() request: Request, @Body() dto: CreateAdminUserDto) {
    const created = await this.userService.createUser(dto);
    await this.adminLogsService.createLog({
      actor: user,
      category: AdminOperationLogCategory.user,
      action: '新增用户',
      targetType: 'user_data',
      targetId: created.id,
      targetName: created.username,
      detail: {
        role: created.role,
        status: created.status,
        hospitalName: created.hospitalName,
      },
      ipAddress: extractRequestIp(request),
    });
    return created;
  }

  @Patch(':id')
  async updateUser(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminUserDto,
  ) {
    const updated = await this.userService.updateUser(BigInt(id), dto);
    await this.adminLogsService.createLog({
      actor: user,
      category: AdminOperationLogCategory.user,
      action: '修改用户',
      targetType: 'user_data',
      targetId: updated.id,
      targetName: updated.username,
      detail: {
        role: updated.role,
        status: updated.status,
        hospitalName: updated.hospitalName,
        passwordReset: Boolean(dto.password),
      },
      ipAddress: extractRequestIp(request),
    });
    return updated;
  }

  @Delete(':id')
  async deleteUser(@CurrentUser() user: AuthUser, @Req() request: Request, @Param('id', ParseIntPipe) id: number) {
    const deleted = await this.userService.deleteUser(BigInt(id), BigInt(user.id));
    await this.adminLogsService.createLog({
      actor: user,
      category: AdminOperationLogCategory.user,
      action: '删除用户',
      targetType: 'user_data',
      targetId: deleted.id,
      targetName: deleted.username,
      detail: {
        hospitalName: deleted.hospitalName,
      },
      ipAddress: extractRequestIp(request),
    });
    return { success: true };
  }
}
