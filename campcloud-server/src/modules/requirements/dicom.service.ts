import { Injectable, Logger } from '@nestjs/common';
import * as dicomParser from 'dicom-parser';

export interface DicomMetadata {
  modality?: string;
  bodyPart?: string;
  seriesDescription?: string;
  sliceThickness?: string;
  manufacturer?: string;
  manufacturerModelName?: string;
  institutionName?: string;
  patientName?: string;
  studyDate?: string;
}

@Injectable()
export class DicomService {
  private readonly logger = new Logger(DicomService.name);

  parseFile(buffer: Buffer): DicomMetadata {
    try {
      const dataset = dicomParser.parseDicom(buffer);
      return this.extractMetadata(dataset);
    } catch (error) {
      this.logger.warn(`Failed to parse DICOM file: ${error}`);
      return {};
    }
  }

  private extractMetadata(dataset: any): DicomMetadata {
    const metadata: DicomMetadata = {};

    try {
      metadata.modality = this.getString(dataset, '0x00080060');
    } catch (e) {
      // 忽略单个字段的解析错误
    }

    try {
      metadata.bodyPart = this.getString(dataset, '0x00180015');
    } catch (e) {
      //
    }

    try {
      metadata.seriesDescription = this.getString(dataset, '0x0008103e');
    } catch (e) {
      //
    }

    try {
      metadata.sliceThickness = this.getString(dataset, '0x00180050');
    } catch (e) {
      //
    }

    try {
      metadata.manufacturer = this.getString(dataset, '0x00080070');
    } catch (e) {
      //
    }

    try {
      metadata.manufacturerModelName = this.getString(dataset, '0x00081090');
    } catch (e) {
      //
    }

    try {
      metadata.institutionName = this.getString(dataset, '0x00080080');
    } catch (e) {
      //
    }

    try {
      metadata.patientName = this.getString(dataset, '0x00100010');
    } catch (e) {
      //
    }

    try {
      metadata.studyDate = this.getString(dataset, '0x00080020');
    } catch (e) {
      //
    }

    return metadata;
  }

  private getString(dataset: any, tag: string): string | undefined {
    try {
      const value = dataset.string(tag);
      return value?.trim() || undefined;
    } catch {
      return undefined;
    }
  }
}
