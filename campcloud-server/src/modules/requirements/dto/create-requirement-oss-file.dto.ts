import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';

export enum RequirementOssFileKindDto {
  dicom = 'dicom',
  model = 'model',
}

export class CreateRequirementOssFileDto {
  @ApiProperty({ enum: RequirementOssFileKindDto, description: '文件类型' })
  @IsEnum(RequirementOssFileKindDto)
  kind!: RequirementOssFileKindDto;

  @ApiProperty({ description: '原始文件名' })
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ description: '文件大小（字节）' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fileSize!: number;

  @ApiPropertyOptional({ description: '文件 MIME 类型' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  mimeType?: string;

  @ApiPropertyOptional({ description: '模型名称，kind=model 时必填' })
  @ValidateIf((value) => value.kind === RequirementOssFileKindDto.model)
  @IsString()
  @MaxLength(128)
  modelName?: string;

  @ApiPropertyOptional({ description: '模型版本，kind=model 时必填' })
  @ValidateIf((value) => value.kind === RequirementOssFileKindDto.model)
  @IsString()
  @MaxLength(64)
  modelVersion?: string;
}
