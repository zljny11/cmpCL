import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ConfirmRequirementOssFileDto {
  @ApiPropertyOptional({ description: 'OSS 返回的 ETag' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  etag?: string;

  @ApiPropertyOptional({ description: '客户端确认的文件大小（字节）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fileSize?: number;
}
