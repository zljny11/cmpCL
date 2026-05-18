import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateDatasetBatchDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  sourceName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @ApiPropertyOptional({ description: '重传时复用的原批次ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  retryBatchId?: number;
}
