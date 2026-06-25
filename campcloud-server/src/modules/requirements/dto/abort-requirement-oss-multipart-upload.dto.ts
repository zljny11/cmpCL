import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class AbortRequirementOssMultipartUploadDto {
  @ApiProperty({ description: 'OSS multipart uploadId' })
  @IsString()
  @MaxLength(255)
  uploadId!: string;
}
