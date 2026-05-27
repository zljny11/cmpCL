import { Controller, Get, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { ListAdminOperationLogsDto } from './dto/list-admin-operation-logs.dto';
import { AdminLogsService } from './admin-logs.service';

@Roles(UserRole.admin)
@Controller('admin/logs')
export class AdminLogsController {
  constructor(private readonly adminLogsService: AdminLogsService) {}

  @Get()
  list(@Query() query: ListAdminOperationLogsDto) {
    return this.adminLogsService.listLogs(query);
  }

  @Post('clear')
  clear() {
    return this.adminLogsService.clearLogs();
  }
}
