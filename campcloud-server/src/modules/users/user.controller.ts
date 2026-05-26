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
  async listUsers(@CurrentUser() user: AuthUser, @Req() request: Request, @Query() query: ListUsersDto) {
    const result = await this.userService.listUsers(query);
    await this.adminLogsService.createLog({
      actor: user,
      category: AdminOperationLogCategory.user,
      action: '查看用户列表',
      targetType: 'user',
      targetName: query.keyword?.trim() || '全部用户',
      detail: {
        keyword: query.keyword?.trim() || null,
        page: result.page,
        pageSize: result.pageSize,
      },
      ipAddress: extractRequestIp(request),
    });
    return result;
  }

  @Post()
  async createUser(@CurrentUser() user: AuthUser, @Req() request: Request, @Body() dto: CreateAdminUserDto) {
    const created = await this.userService.createUser(dto);
    await this.adminLogsService.createLog({
      actor: user,
      category: AdminOperationLogCategory.user,
      action: '创建用户',
      targetType: 'user',
      targetId: created.id,
      targetName: created.username,
      detail: {
        hospitalName: created.hospitalName,
        role: created.role,
        status: created.status,
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
      action: '更新用户',
      targetType: 'user',
      targetId: updated.id,
      targetName: updated.username,
      detail: {
        hospitalName: updated.hospitalName,
        role: updated.role,
        status: updated.status,
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
      targetType: 'user',
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
