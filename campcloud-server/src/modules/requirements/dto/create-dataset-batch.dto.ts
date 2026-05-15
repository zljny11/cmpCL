import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

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
}
