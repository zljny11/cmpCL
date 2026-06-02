import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { rm } from 'node:fs/promises';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../types/auth-user';
import { RequirementsService } from './requirement.service';

@ApiTags('pacs-compat')
@ApiBearerAuth()
@Controller()
export class PacsCompatController {
  constructor(private readonly requirementsService: RequirementsService) {}

  @Post('getSeries')
  getSeries(
    @CurrentUser() user: AuthUser,
    @Body() body: { seriesIds?: string[]; seriesUIDs?: string[] },
  ) {
    return this.requirementsService.pacsGetSeries(
      BigInt(user.id),
      user.role,
      body.seriesIds ?? [],
      body.seriesUIDs ?? [],
    );
  }

  @Post('getImgIdArr')
  async getImgIdArr(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Body() body: { seriesIds?: string[]; seriesUIDs?: string[] },
  ) {
    const fileGroups = await this.requirementsService.pacsGetImageIdGroups(
      BigInt(user.id),
      user.role,
      body.seriesIds ?? [],
      body.seriesUIDs ?? [],
    );

    const origin = `${req.protocol}://${req.get('host')}`;
    return fileGroups.map((group) =>
      group.map(
        (file) =>
          `wadouri:${origin}/api/v1/pacs/files/${file.seriesId}/${encodeURIComponent(file.fileName)}`,
      ),
    );
  }

  @Post('getDICOMTagInfo')
  getDICOMTagInfo(@CurrentUser() user: AuthUser, @Body() body: { seriesIds?: string[]; seriesUIDs?: string[] }) {
    return this.requirementsService.pacsGetTagInfo(
      BigInt(user.id),
      user.role,
      body.seriesIds ?? [],
      body.seriesUIDs ?? [],
    );
  }

  @Post('downloadSeries')
  async downloadSeries(
    @CurrentUser() user: AuthUser,
    @Body() body: { seriesIds?: string[]; seriesUIDs?: string[] },
    @Res() res: Response,
  ) {
    const zipFile = await this.requirementsService.pacsDownloadSeries(
      BigInt(user.id),
      user.role,
      body.seriesIds ?? [],
      body.seriesUIDs ?? [],
    );

    const cleanup = () => {
      void rm(zipFile.cleanupDir, { recursive: true, force: true });
    };
    res.on('finish', cleanup);
    res.on('close', cleanup);

    res.download(zipFile.path, zipFile.fileName);
  }

  @Get('pacs/files/:seriesId/:fileName')
  async pacsFile(@Param('seriesId') seriesId: string, @Param('fileName') fileName: string, @Res() res: Response) {
    const filePath = await this.requirementsService.pacsPublicFile(seriesId, decodeURIComponent(fileName));
    res.setHeader('Content-Type', 'application/dicom');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    res.sendFile(filePath);
  }
}
