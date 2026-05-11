import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../types/auth-user';
import { CreateRequirementDto } from './dto/create-requirement.dto';
import { ListRequirementsDto } from './dto/list-requirements.dto';
import { RequirementsService } from './requirement.service';

@ApiTags('requirements')
@ApiBearerAuth()
@Controller('requirements')
export class RequirementsController {
  constructor(private readonly requirementsService: RequirementsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRequirementDto) {
    return this.requirementsService.create(BigInt(user.id), dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListRequirementsDto) {
    return this.requirementsService.list(BigInt(user.id), query);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.requirementsService.detail(BigInt(user.id), BigInt(id), user.role);
  }

  @Get(':id/data-tree')
  dataTree(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.requirementsService.dataTree(BigInt(user.id), BigInt(id), user.role);
  }
}
