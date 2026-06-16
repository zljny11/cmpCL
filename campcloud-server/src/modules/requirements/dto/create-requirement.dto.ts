import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRequirementDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  type!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  typeCustom?: string | null;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  expectedGoal!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}
