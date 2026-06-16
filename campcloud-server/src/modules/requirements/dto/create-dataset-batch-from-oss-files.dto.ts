import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

function transformStringArrayField(value: unknown): unknown {
  if (value == null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : value;
  } catch {
    return value;
  }
}

export class CreateDatasetBatchFromOssFilesDto {
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

  @ApiProperty({ description: '影像模态' })
  @IsString()
  @MaxLength(32)
  modality!: string;

  @ApiProperty({ description: '检查部位' })
  @IsString()
  @MaxLength(64)
  bodyPart!: string;

  @ApiPropertyOptional({ description: '疾病诊断，JSON 数组' })
  @IsOptional()
  @Transform(({ value }) => transformStringArrayField(value))
  @IsArray()
  @IsString({ each: true })
  diagnosis?: string[];

  @ApiPropertyOptional({ description: '临床标签，JSON 数组' })
  @IsOptional()
  @Transform(({ value }) => transformStringArrayField(value))
  @IsArray()
  @IsString({ each: true })
  clinicalTags?: string[];

  @ApiPropertyOptional({ description: '标注状态' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  annotationStatus?: string;

  @ApiPropertyOptional({ description: '重传时复用的原批次 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  retryBatchId?: number;

  @ApiProperty({ type: [String], description: '已上传完成的 OSS 文件 ID 列表' })
  @IsArray()
  @IsString({ each: true })
  fileIds!: string[];
}
