import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../types/auth-user';
import { CreateDatasetBatchDto } from './dto/create-dataset-batch.dto';
import { CreateRequirementDto } from './dto/create-requirement.dto';
import { ListDatasetBatchesDto } from './dto/list-dataset-batches.dto';
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

  @Post(':id/dataset-batches')
  @UseInterceptors(FilesInterceptor('files', 2000, { storage: memoryStorage() }))
  createDatasetBatch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateDatasetBatchDto,
    @UploadedFiles() files: Array<{ originalname: string; buffer: Buffer }> = [],
  ) {
    return this.requirementsService.createDatasetBatch(BigInt(user.id), BigInt(id), user.role, dto, files);
  }

  @Get(':id/dataset-batches')
  listDatasetBatches(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListDatasetBatchesDto,
  ) {
    return this.requirementsService.listDatasetBatches(BigInt(user.id), BigInt(id), user.role, query);
  }
}
