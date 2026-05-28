import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { RequirementsController } from '../src/modules/requirements/requirement.controller';
import { RequirementsService } from '../src/modules/requirements/requirement.service';
import { AdminLogsService } from '../src/modules/admin-logs/admin-logs.service';

describe('Upload Session Controller (P1)', () => {
  let controller: RequirementsController;
  let mockService: jest.Mocked<RequirementsService>;
  let mockAdminLogsService: { createLog: jest.Mock };

  const user = {
    id: '2',
    username: 'user',
    role: UserRole.user,
    hospitalName: '医院',
  };

  beforeEach(() => {
    mockService = {
      createUploadSession: jest.fn(),
      getUploadSession: jest.fn(),
      uploadUploadSessionContent: jest.fn(),
      createDatasetBatchFromSessions: jest.fn(),
      createDatasetBatch: jest.fn(),
    } as any;

    mockAdminLogsService = {
      createLog: jest.fn().mockResolvedValue(undefined),
    };

    controller = new RequirementsController(
      mockService,
      mockAdminLogsService as unknown as AdminLogsService,
    );
  });

  it('creates an upload session', async () => {
    mockService.createUploadSession.mockResolvedValueOnce({
      sessionId: '11',
      fileName: 'study1.dcm',
      relativePath: 'folder/study1.dcm',
      fileSize: 1024,
      uploadedSize: 0,
      status: 'pending',
    });

    const result = await controller.createUploadSession(user as any, 18, {
      fileName: 'study1.dcm',
      relativePath: 'folder/study1.dcm',
      fileSize: 1024,
      lastModified: 1716870000000,
    });

    expect(result.sessionId).toBe('11');
    expect(mockService.createUploadSession).toHaveBeenCalledWith(
      BigInt(2),
      BigInt(18),
      UserRole.user,
      expect.objectContaining({
        fileName: 'study1.dcm',
        relativePath: 'folder/study1.dcm',
      }),
    );
  });

  it('passes resume offset to upload content handler', async () => {
    mockService.uploadUploadSessionContent.mockResolvedValueOnce({
      sessionId: '11',
      uploadedSize: 1024,
      fileSize: 1024,
      status: 'uploaded',
    });

    const request = {
      header: (name: string) => (name.toLowerCase() === 'x-start-byte' ? '256' : undefined),
    } as Request;

    await controller.uploadSessionContent(user as any, 18, 11, request);

    expect(mockService.uploadUploadSessionContent).toHaveBeenCalledWith(
      BigInt(2),
      BigInt(18),
      BigInt(11),
      UserRole.user,
      256,
      request,
    );
  });

  it('rejects invalid resume offset header', async () => {
    const request = {
      header: () => 'bad-offset',
    } as unknown as Request;

    await expect(controller.uploadSessionContent(user as any, 18, 11, request)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockService.uploadUploadSessionContent).not.toHaveBeenCalled();
  });

  it('commits a dataset batch from uploaded sessions', async () => {
    mockService.createDatasetBatchFromSessions.mockResolvedValueOnce({
      datasetBatchId: '88',
      requirementTitle: '需求A',
      batchNo: 3,
      status: 'uploaded',
      fileCount: 2,
      uploadedAt: new Date(),
    });

    const request = {
      headers: {},
    } as Request;

    const result = await controller.createDatasetBatchFromSessions(user as any, request, 18, {
      modality: 'CT',
      bodyPart: 'CHEST',
      sessionIds: ['11', '12'],
    });

    expect(result.datasetBatchId).toBe('88');
    expect(mockService.createDatasetBatchFromSessions).toHaveBeenCalledWith(
      BigInt(2),
      BigInt(18),
      UserRole.user,
      expect.objectContaining({
        modality: 'CT',
        bodyPart: 'CHEST',
        sessionIds: ['11', '12'],
      }),
    );
    expect(mockAdminLogsService.createLog).toHaveBeenCalled();
  });

  it('rejects large legacy multipart uploads', async () => {
    const request = {
      headers: {},
    } as Request;

    const files = Array.from({ length: 101 }, (_, index) => ({
      originalname: `file-${index}.dcm`,
      buffer: Buffer.alloc(1024, 1),
    }));

    await expect(
      controller.createDatasetBatch(
        user as any,
        request,
        18,
        { modality: 'CT', bodyPart: 'CHEST' } as any,
        files,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mockService.createDatasetBatch).not.toHaveBeenCalled();
  });
});
