import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class SignRequirementOssMultipartPartDto {
  @ApiProperty({ description: 'OSS multipart uploadId' })
  @IsString()
  @MaxLength(255)
  uploadId!: string;

  @ApiProperty({ description: 'Multipart part number, starting from 1' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  partNumber!: number;
}
