import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, Res, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AdminOperationLogCategory, UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { extractRequestIp } from '../../common/utils/request';
import { AuthUser } from '../../types/auth-user';
import { AdminLogsService } from '../admin-logs/admin-logs.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { CreateDatasetBatchDto } from './dto/create-dataset-batch.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateRequirementDto } from './dto/create-requirement.dto';
import { ListDatasetBatchesDto } from './dto/list-dataset-batches.dto';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { ListRequirementsDto } from './dto/list-requirements.dto';
import { UpdateRequirementStatusDto } from './dto/update-requirement-status.dto';
import { RequirementsService } from './requirement.service';

@ApiTags('requirements')
@ApiBearerAuth()
@Controller('requirements')
export class RequirementsController {
  constructor(
    private readonly requirementsService: RequirementsService,
    private readonly adminLogsService: AdminLogsService,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRequirementDto) {
    return this.requirementsService.create(BigInt(user.id), dto);
  }

  @Get()
  async list(@CurrentUser() user: AuthUser, @Req() request: Request, @Query() query: ListRequirementsDto) {
    const result = await this.requirementsService.list(BigInt(user.id), user.role, query);
    if (user.role === UserRole.admin) {
      await this.adminLogsService.createLog({
        actor: user,
        category: AdminOperationLogCategory.requirement,
        action: '查看需求列表',
        targetType: 'requirement',
        targetName: query.keyword?.trim() || '全部需求',
        detail: {
          keyword: query.keyword?.trim() || null,
          hospitalName: query.hospitalName?.trim() || null,
          type: query.type || null,
          status: query.status || null,
          page: result.page,
          pageSize: result.pageSize,
        },
        ipAddress: extractRequestIp(request),
      });
    }
    return result;
  }

  @Get(':id')
  async detail(@CurrentUser() user: AuthUser, @Req() request: Request, @Param('id', ParseIntPipe) id: number) {
    const result = await this.requirementsService.detail(BigInt(user.id), BigInt(id), user.role);
    if (user.role === UserRole.admin) {
      await this.adminLogsService.createLog({
        actor: user,
        category: AdminOperationLogCategory.requirement,
        action: '查看需求详情',
        targetType: 'requirement',
        targetId: result.id,
        targetName: result.title,
        ipAddress: extractRequestIp(request),
      });
    }
    return result;
  }

  @Get(':id/messages')
  listMessages(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.requirementsService.listMessages(BigInt(user.id), BigInt(id), user.role);
  }

  @Post(':id/messages')
  createMessage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateMessageDto,
  ) {
    return this.requirementsService.createMessage(BigInt(user.id), BigInt(id), user.role, dto);
  }

  @Get(':id/deliveries')
  listDeliveries(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.requirementsService.listDeliveries(BigInt(user.id), BigInt(id), user.role);
  }

  @Post(':id/deliveries')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  createDelivery(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateDeliveryDto,
    @UploadedFile() file?: { originalname: string; buffer: Buffer; mimetype: string },
  ) {
    return this.requirementsService.createDelivery(BigInt(user.id), BigInt(id), user.role, dto, file);
  }

  @Get(':id/deliveries/:deliveryId/file')
  async downloadDeliveryFile(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('deliveryId', ParseIntPipe) deliveryId: number,
    @Res() res: Response,
  ) {
    const file = await this.requirementsService.downloadDeliveryFile(
      BigInt(user.id),
      BigInt(id),
      BigInt(deliveryId),
      user.role,
    );
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
    res.sendFile(file.path);
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRequirementStatusDto,
  ) {
    const result = await this.requirementsService.updateStatus(BigInt(user.id), BigInt(id), user.role, dto);
    if (user.role === UserRole.admin) {
      await this.adminLogsService.createLog({
        actor: user,
        category: AdminOperationLogCategory.requirement,
        action: '更新需求状态',
        targetType: 'requirement',
        targetId: result.id,
        detail: {
          status: result.status,
          reason: dto.reason?.trim() || null,
        },
        ipAddress: extractRequestIp(request),
      });
    }
    return result;
  }

  @Get(':id/data-tree')
  async dataTree(@CurrentUser() user: AuthUser, @Req() request: Request, @Param('id', ParseIntPipe) id: number) {
    const result = await this.requirementsService.dataTree(BigInt(user.id), BigInt(id), user.role);
    if (user.role === UserRole.admin) {
      await this.adminLogsService.createLog({
        actor: user,
        category: AdminOperationLogCategory.data,
        action: '查看完整数据',
        targetType: 'requirement',
        targetId: result.requirementId,
        detail: {
          patientCount: result.patients.length,
        },
        ipAddress: extractRequestIp(request),
      });
    }
    return result;
  }

  @Get(':id/studies/:studyId/preview')
  async previewStudy(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Param('id', ParseIntPipe) id: number,
    @Param('studyId', ParseIntPipe) studyId: number,
  ) {
    const result = await this.requirementsService.previewStudy(BigInt(user.id), BigInt(id), BigInt(studyId), user.role);
    if (user.role === UserRole.admin) {
      await this.adminLogsService.createLog({
        actor: user,
        category: AdminOperationLogCategory.data,
        action: '预览检查数据',
        targetType: 'study',
        targetId: result.target.id,
        targetName: result.target.studyDescription || result.target.studyUid,
        detail: {
          requirementId: id.toString(),
          seriesCount: result.series.length,
        },
        ipAddress: extractRequestIp(request),
      });
    }
    return result;
  }

  @Delete(':id/studies/:studyId')
  async deleteStudy(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Param('id', ParseIntPipe) id: number,
    @Param('studyId', ParseIntPipe) studyId: number,
  ) {
    const result = await this.requirementsService.deleteStudy(BigInt(user.id), BigInt(id), BigInt(studyId), user.role);
    if (user.role === UserRole.admin) {
      await this.adminLogsService.createLog({
        actor: user,
        category: AdminOperationLogCategory.data,
        action: '删除检查数据',
        targetType: 'study',
        targetId: studyId.toString(),
        detail: {
          requirementId: id.toString(),
        },
        ipAddress: extractRequestIp(request),
      });
    }
    return result;
  }

  @Get(':id/series/:seriesId/preview')
  async previewSeries(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Param('id', ParseIntPipe) id: number,
    @Param('seriesId', ParseIntPipe) seriesId: number,
  ) {
    const result = await this.requirementsService.previewSeries(BigInt(user.id), BigInt(id), BigInt(seriesId), user.role);
    if (user.role === UserRole.admin) {
      await this.adminLogsService.createLog({
        actor: user,
        category: AdminOperationLogCategory.data,
        action: '预览序列数据',
        targetType: 'series',
        targetId: result.target.id,
        targetName: result.target.seriesDescription || result.target.seriesUid,
        detail: {
          requirementId: id.toString(),
        },
        ipAddress: extractRequestIp(request),
      });
    }
    return result;
  }

  @Delete(':id/series/:seriesId')
  async deleteSeries(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Param('id', ParseIntPipe) id: number,
    @Param('seriesId', ParseIntPipe) seriesId: number,
  ) {
    const result = await this.requirementsService.deleteSeries(BigInt(user.id), BigInt(id), BigInt(seriesId), user.role);
    if (user.role === UserRole.admin) {
      await this.adminLogsService.createLog({
        actor: user,
        category: AdminOperationLogCategory.data,
        action: '删除序列数据',
        targetType: 'series',
        targetId: seriesId.toString(),
        detail: {
          requirementId: id.toString(),
        },
        ipAddress: extractRequestIp(request),
      });
    }
    return result;
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

  @Get(':id/dataset-batches/:batchId/failed-files')
  listDatasetBatchFailedFiles(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('batchId', ParseIntPipe) batchId: number,
  ) {
    return this.requirementsService.listDatasetBatchFailedFiles(
      BigInt(user.id),
      BigInt(id),
      BigInt(batchId),
      user.role,
    );
  }
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly requirementsService: RequirementsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListNotificationsDto) {
    return this.requirementsService.listNotifications(BigInt(user.id), query);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.requirementsService.markNotificationRead(BigInt(user.id), BigInt(id));
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.requirementsService.markAllNotificationsRead(BigInt(user.id));
  }
}
