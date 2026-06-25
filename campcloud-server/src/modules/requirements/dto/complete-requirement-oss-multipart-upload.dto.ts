import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class CompleteRequirementOssMultipartUploadPartDto {
  @ApiProperty({ description: 'Multipart part number, starting from 1' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  partNumber!: number;

  @ApiProperty({ description: 'Part ETag returned by OSS' })
  @IsString()
  @MaxLength(128)
  etag!: string;
}

export class CompleteRequirementOssMultipartUploadDto {
  @ApiProperty({ description: 'OSS multipart uploadId' })
  @IsString()
  @MaxLength(255)
  uploadId!: string;

  @ApiProperty({
    type: [CompleteRequirementOssMultipartUploadPartDto],
    description: 'Uploaded multipart parts',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompleteRequirementOssMultipartUploadPartDto)
  parts!: CompleteRequirementOssMultipartUploadPartDto[];

  @ApiPropertyOptional({ description: 'Client-confirmed file size in bytes' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fileSize?: number;
}
