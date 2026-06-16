import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequirementStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRequirementStatusDto {
  @ApiProperty({ enum: RequirementStatus })
  @IsEnum(RequirementStatus)
  status!: RequirementStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
