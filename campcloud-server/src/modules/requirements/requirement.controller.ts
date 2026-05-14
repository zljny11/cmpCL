import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
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

  @Get(':id/studies/:studyId/preview')
  previewStudy(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('studyId', ParseIntPipe) studyId: number,
  ) {
    return this.requirementsService.previewStudy(BigInt(user.id), BigInt(id), BigInt(studyId), user.role);
  }

  @Delete(':id/studies/:studyId')
  deleteStudy(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('studyId', ParseIntPipe) studyId: number,
  ) {
    return this.requirementsService.deleteStudy(BigInt(user.id), BigInt(id), BigInt(studyId), user.role);
  }

  @Get(':id/series/:seriesId/preview')
  previewSeries(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('seriesId', ParseIntPipe) seriesId: number,
  ) {
    return this.requirementsService.previewSeries(BigInt(user.id), BigInt(id), BigInt(seriesId), user.role);
  }

  @Delete(':id/series/:seriesId')
  deleteSeries(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('seriesId', ParseIntPipe) seriesId: number,
  ) {
    return this.requirementsService.deleteSeries(BigInt(user.id), BigInt(id), BigInt(seriesId), user.role);
  }

  @Get(':id/series/:seriesId/files/:fileName')
  async downloadSeriesFile(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('seriesId', ParseIntPipe) seriesId: number,
    @Param('fileName') fileName: string,
    @Res() res: Response,
  ) {
    const file = await this.requirementsService.downloadSeriesFile(
      BigInt(user.id),
      BigInt(id),
      BigInt(seriesId),
      decodeURIComponent(fileName),
      user.role,
    );
    res.setHeader('Content-Type', 'application/dicom');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`);
    res.sendFile(file.path);
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
