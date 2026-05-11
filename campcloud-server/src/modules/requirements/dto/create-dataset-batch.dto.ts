import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DatasetUploadType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDatasetBatchDto {
  @ApiProperty({ enum: DatasetUploadType })
  @IsEnum(DatasetUploadType)
  uploadType!: DatasetUploadType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}
