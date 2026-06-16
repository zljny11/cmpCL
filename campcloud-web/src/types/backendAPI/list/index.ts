interface Patient {
  patientId: string;
  patientName: string;
  patientSex: string;
  birthday: string;
  patientAge?: string;
}

interface User {
  username: string;
  userId: number;
}

export interface Series extends Patient, User {
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
}

export interface Study extends Patient, User {
  studyDesc: string;
  studyId: string;
  imageCount: number;
  seriesCount: number;
  scanModes: string;
  hospitalNames: string;
  manufacturers: string;
  bodyParts: string;
  manufacturersModelNames: string;
  protocolNames: string;
  studyDescriptions: string;
  notes: string;
  uploadTime: string;
  scanTime: string;
}

export interface SeriesMetaData {
  patientId: string;
  seriesUID: string;
  seriesId: string;
  seriesDesc: string;
  uploadTime: string;
  hospitalName: string;
  note: string;
  bodyPart: string;
  imageCount: number;
}

export interface StudyInfo {
  patientId: string;
  studyId: string;
  modality: string;
  studydate: string;
  studyDesc: string;
  protocolName: string;
  manufacturer: string;
  studyInstanceUID: string;
  manufacturerModelName: string;
  seriesNum: number;
  seriesData: SeriesMetaData[];
}
