import { AdminOperationLogCategory, AdminOperationLogResult } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListAdminOperationLogsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number = 10;

  @IsEnum(AdminOperationLogCategory)
  @IsOptional()
  category?: AdminOperationLogCategory;

  @IsEnum(AdminOperationLogResult)
  @IsOptional()
  result?: AdminOperationLogResult;

  @IsString()
  @IsOptional()
  keyword?: string;
}
