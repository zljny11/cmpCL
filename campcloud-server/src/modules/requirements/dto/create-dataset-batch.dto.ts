import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateDatasetBatchDto {
  @ApiProperty()
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
  @IsArray()
  @IsString({ each: true })
  diagnosis?: string[];

  @ApiPropertyOptional({ description: '临床金标准，JSON 数组' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clinicalTags?: string[];

  @ApiPropertyOptional({ description: '标注状态' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  annotationStatus?: string;

  @ApiPropertyOptional({ description: '重传时复用的原批次ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  retryBatchId?: number;
}
