import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Req, Res, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AdminOperationLogCategory, UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { diskStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { extractRequestIp } from '../../common/utils/request';
import { AuthUser } from '../../types/auth-user';
import { AdminLogsService } from '../admin-logs/admin-logs.service';
import { CreateDatasetBatchFromSessionsDto } from './dto/create-dataset-batch-from-sessions.dto';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { CreateDatasetBatchDto } from './dto/create-dataset-batch.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateRequirementDto } from './dto/create-requirement.dto';
import { CreateUploadSessionDto } from './dto/create-upload-session.dto';
import { ListDatasetBatchesDto } from './dto/list-dataset-batches.dto';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { ListRequirementDataTreeDto } from './dto/list-requirement-data-tree.dto';
import { ListRequirementsDto } from './dto/list-requirements.dto';
import { UpdateRequirementStatusDto } from './dto/update-requirement-status.dto';
import { RequirementsService } from './requirement.service';

const TEMP_UPLOAD_DIR = join(tmpdir(), 'campcloud-staged-uploads');
const DELIVERY_UPLOAD_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const LICENSE_UPLOAD_MAX_BYTES = 1024 * 1024;
const LEGACY_DATASET_BATCH_MAX_FILES = 100;
const LEGACY_DATASET_BATCH_MAX_BYTES = 256 * 1024 * 1024;
const LEGACY_DATASET_BATCH_MAX_FILE_BYTES = 64 * 1024 * 1024;

const stagedUploadStorage = diskStorage({
  destination: (_req, _file, callback) => {
    void mkdir(TEMP_UPLOAD_DIR, { recursive: true })
      .then(() => callback(null, TEMP_UPLOAD_DIR))
      .catch((error) => callback(error as Error, TEMP_UPLOAD_DIR));
  },
  filename: (_req, file, callback) => {
    callback(null, `${randomUUID()}${extname(file.originalname)}`);
  },
});

@ApiTags('requirements')
@ApiBearerAuth()
@Controller('requirements')
export class RequirementsController {
  private static readonly LEGACY_DATASET_BATCH_MAX_FILES = LEGACY_DATASET_BATCH_MAX_FILES;
  private static readonly LEGACY_DATASET_BATCH_MAX_BYTES = LEGACY_DATASET_BATCH_MAX_BYTES;

  constructor(
    private readonly requirementsService: RequirementsService,
    private readonly adminLogsService: AdminLogsService,
  ) {}

  @Post()
  async create(@CurrentUser() user: AuthUser, @Req() request: Request, @Body() dto: CreateRequirementDto) {
    const result = await this.requirementsService.create(BigInt(user.id), dto);
    if (user.role === UserRole.user) {
      await this.adminLogsService.createLog({
        actor: user,
        category: AdminOperationLogCategory.requirement,
        action: '上传需求',
        targetType: 'requirement',
        targetId: result.id,
        targetName: result.title,
        detail: {
          type: result.type,
          status: result.status,
        },
        ipAddress: extractRequestIp(request),
      });
    }
    return result;
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListRequirementsDto) {
    return this.requirementsService.list(BigInt(user.id), user.role, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.requirementsService.detail(BigInt(user.id), BigInt(id), user.role);
  }

  @Get(':id/messages')
  listMessages(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.requirementsService.listMessages(BigInt(user.id), BigInt(id), user.role);
  }

  @Post(':id/messages')
  async createMessage(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateMessageDto,
  ) {
    const result = await this.requirementsService.createMessage(BigInt(user.id), BigInt(id), user.role, dto);
    await this.adminLogsService.createLog({
      actor: user,
      category: AdminOperationLogCategory.requirement,
      action: '需求留言',
      targetType: 'requirement',
      targetId: id.toString(),
      targetName: result.requirementTitle ?? undefined,
      detail: {
        messageId: result.id,
        senderRole: user.role,
        content: dto.content.trim().slice(0, 100),
      },
      ipAddress: extractRequestIp(request),
    });
    return result;
  }

  @Get(':id/deliveries')
  listDeliveries(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.requirementsService.listDeliveries(BigInt(user.id), BigInt(id), user.role);
  }

  @Post(':id/deliveries')
  @UseInterceptors(FileInterceptor('file', {
    storage: stagedUploadStorage,
    limits: { fileSize: DELIVERY_UPLOAD_MAX_BYTES, files: 1 },
  }))
  async createDelivery(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateDeliveryDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const result = await this.requirementsService.createDelivery(BigInt(user.id), BigInt(id), user.role, dto, file);
    await this.adminLogsService.createLog({
      actor: user,
      category: AdminOperationLogCategory.data,
      action: '交付算法',
      targetType: 'requirement',
      targetId: id.toString(),
      targetName: result.requirementTitle ?? undefined,
      detail: {
        deliveryId: result.id,
        deliveryTitle: result.title,
        fileName: result.fileName,
        isFinal: result.isFinal,
      },
      ipAddress: extractRequestIp(request),
    });
    return result;
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

  @Post(':id/deliveries/:deliveryId/file')
  @UseInterceptors(FileInterceptor('license', {
    storage: stagedUploadStorage,
    limits: { fileSize: LICENSE_UPLOAD_MAX_BYTES, files: 1 },
  }))
  async downloadDeliveryFileWithLicense(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('deliveryId', ParseIntPipe) deliveryId: number,
    @UploadedFile() licenseFile: Express.Multer.File | undefined,
    @Res() res: Response,
  ) {
    const file = await this.requirementsService.downloadDeliveryFile(
      BigInt(user.id),
      BigInt(id),
      BigInt(deliveryId),
      user.role,
      licenseFile,
    );
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
    res.sendFile(file.path);
  }

  @Post(':id/deliveries/:deliveryId/license/verify')
  @UseInterceptors(FileInterceptor('license', {
    storage: stagedUploadStorage,
    limits: { fileSize: LICENSE_UPLOAD_MAX_BYTES, files: 1 },
  }))
  verifyDeliveryLicense(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('deliveryId', ParseIntPipe) deliveryId: number,
    @UploadedFile() licenseFile: Express.Multer.File | undefined,
  ) {
    return this.requirementsService.verifyDeliveryLicense(
      BigInt(user.id),
      BigInt(id),
      BigInt(deliveryId),
      user.role,
      licenseFile,
    );
  }

  @Post('license/verify')
  @UseInterceptors(FileInterceptor('license', {
    storage: stagedUploadStorage,
    limits: { fileSize: LICENSE_UPLOAD_MAX_BYTES, files: 1 },
  }))
  verifyUserLicense(
    @CurrentUser() user: AuthUser,
    @UploadedFile() licenseFile: Express.Multer.File | undefined,
  ) {
    return this.requirementsService.verifyUserLicense(BigInt(user.id), licenseFile);
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
        action: '调整需求状态',
        targetType: 'requirement',
        targetId: result.id,
        targetName: result.requirementTitle ?? undefined,
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
  dataTree(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListRequirementDataTreeDto,
  ) {
    return this.requirementsService.dataTree(BigInt(user.id), BigInt(id), user.role, query);
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

  @Post(':id/upload-sessions')
  createUploadSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateUploadSessionDto,
  ) {
    return this.requirementsService.createUploadSession(BigInt(user.id), BigInt(id), user.role, dto);
  }

  @Get(':id/upload-sessions/:sessionId')
  getUploadSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ) {
    return this.requirementsService.getUploadSession(BigInt(user.id), BigInt(id), BigInt(sessionId), user.role);
  }

  @Put(':id/upload-sessions/:sessionId/content')
  async uploadSessionContent(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Req() request: Request,
  ) {
    const startByteHeader = request.header('x-start-byte') ?? request.header('X-Start-Byte');
    const startByte = Number(startByteHeader ?? '0');
    if (!Number.isFinite(startByte) || startByte < 0) {
      throw new BadRequestException('x-start-byte 必须是非负整数');
    }

    return this.requirementsService.uploadUploadSessionContent(
      BigInt(user.id),
      BigInt(id),
      BigInt(sessionId),
      user.role,
      startByte,
      request,
    );
  }

  @Post(':id/dataset-batches')
  @ApiOperation({
    deprecated: true,
    summary: '旧版 multipart 批次上传接口，仅保留给小文件兼容使用',
    description: '大文件和常规目录上传请改用 upload-sessions + dataset-batches/commit 新链路。',
  })
  @UseInterceptors(FilesInterceptor('files', LEGACY_DATASET_BATCH_MAX_FILES, {
    storage: stagedUploadStorage,
    limits: { files: LEGACY_DATASET_BATCH_MAX_FILES, fileSize: LEGACY_DATASET_BATCH_MAX_FILE_BYTES },
  }))
  async createDatasetBatch(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateDatasetBatchDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    const totalBytes = files.reduce((sum, file) => sum + (file.size ?? 0), 0);
    if (files.length > RequirementsController.LEGACY_DATASET_BATCH_MAX_FILES) {
      await Promise.all(files.map((file) => rm(file.path, { force: true }).catch(() => undefined)));
      throw new BadRequestException(
        `旧版上传接口最多只支持 ${RequirementsController.LEGACY_DATASET_BATCH_MAX_FILES} 个文件，请改用新上传链路`,
      );
    }
    if (totalBytes > RequirementsController.LEGACY_DATASET_BATCH_MAX_BYTES) {
      await Promise.all(files.map((file) => rm(file.path, { force: true }).catch(() => undefined)));
      throw new BadRequestException('旧版上传接口仅支持小体积兼容上传，请改用新上传链路');
    }

    const result = await this.requirementsService.createDatasetBatch(BigInt(user.id), BigInt(id), user.role, dto, files);
    if (user.role === UserRole.user) {
      await this.adminLogsService.createLog({
        actor: user,
        category: AdminOperationLogCategory.data,
        action: '上传数据',
        targetType: 'requirement',
        targetId: id.toString(),
        targetName: result.requirementTitle ?? undefined,
        detail: {
          datasetBatchId: result.datasetBatchId,
          batchNo: result.batchNo,
          fileCount: result.fileCount,
          status: result.status,
          retryBatchId: dto.retryBatchId ?? null,
          modality: dto.modality?.trim() || null,
          bodyPart: dto.bodyPart?.trim() || null,
        },
        ipAddress: extractRequestIp(request),
      });
    }
    return result;
  }

  @Post(':id/dataset-batches/commit')
  async createDatasetBatchFromSessions(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateDatasetBatchFromSessionsDto,
  ) {
    const result = await this.requirementsService.createDatasetBatchFromSessions(
      BigInt(user.id),
      BigInt(id),
      user.role,
      dto,
    );
    if (user.role === UserRole.user) {
      await this.adminLogsService.createLog({
        actor: user,
        category: AdminOperationLogCategory.data,
        action: '提交数据批次',
        targetType: 'requirement',
        targetId: id.toString(),
        targetName: result.requirementTitle ?? undefined,
        detail: {
          datasetBatchId: result.datasetBatchId,
          batchNo: result.batchNo,
          fileCount: result.fileCount,
          status: result.status,
          retryBatchId: dto.retryBatchId ?? null,
          modality: dto.modality?.trim() || null,
          bodyPart: dto.bodyPart?.trim() || null,
        },
        ipAddress: extractRequestIp(request),
      });
    }
    return result;
  }

  @Get(':id/dataset-batches')
  listDatasetBatches(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListDatasetBatchesDto,
  ) {
    return this.requirementsService.listDatasetBatches(BigInt(user.id), BigInt(id), user.role, query);
  }

  @Get(':id/dataset-batches/:batchId/raw-file')
  async downloadDatasetBatchRawFile(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('batchId', ParseIntPipe) batchId: number,
    @Res() res: Response,
  ) {
    const file = await this.requirementsService.downloadDatasetBatchRawFile(
      BigInt(user.id),
      BigInt(id),
      BigInt(batchId),
      user.role,
    );
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
    res.sendFile(file.path);
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
