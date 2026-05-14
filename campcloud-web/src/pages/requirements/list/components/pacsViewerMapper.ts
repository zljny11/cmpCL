import {
  RequirementPatientNode,
  RequirementSeriesNode,
  RequirementStudyNode,
} from '../../../../types/requirements';

type ViewerRecord = {
  patientId: string;
  patientName: string;
  patientSex: string;
  birthday: string;
  patientAge?: string;
  username: string;
  userId: number;
  seriesId: string;
  seriesUID: string;
  seriesNumber: number;
  seriesDesc: string;
  scanMode: string;
  scanTime: string;
  imageCount: number;
  uploadTime: string;
  protocolName: string;
  manufacturer: string;
  institutionName: string;
  manufacturersModelName: string;
  studyDescription: string;
  bodyPart: string;
  hospitalName: string;
  note: string;
};

function mapSeriesRecord(
  patient: RequirementPatientNode,
  study: RequirementStudyNode,
  series: RequirementSeriesNode,
): ViewerRecord {
  return {
    patientId: patient.patientId || patient.patientUid,
    patientName: patient.patientName || patient.patientUid,
    patientSex: patient.sex || '',
    birthday: patient.birthday || '',
    patientAge: '',
    username: '',
    userId: 0,
    seriesId: series.id,
    seriesUID: series.seriesUid,
    seriesNumber: 0,
    seriesDesc: series.seriesDescription || series.seriesUid,
    scanMode: study.modality || '',
    scanTime: study.studyDate || '',
    imageCount: series.imageCount,
    uploadTime: series.uploadedAt || '',
    protocolName: '',
    manufacturer: '',
    institutionName: series.hospitalName || '',
    manufacturersModelName: '',
    studyDescription: study.studyDescription || '',
    bodyPart: '',
    hospitalName: series.hospitalName || '',
    note: series.remark || '',
  };
}

export function mapStudyToViewerRecords(patient: RequirementPatientNode, study: RequirementStudyNode) {
  return study.series.map((series) => mapSeriesRecord(patient, study, series));
}

export function mapSeriesToViewerRecords(
  patient: RequirementPatientNode,
  study: RequirementStudyNode,
  series: RequirementSeriesNode,
) {
  return [mapSeriesRecord(patient, study, series)];
}
