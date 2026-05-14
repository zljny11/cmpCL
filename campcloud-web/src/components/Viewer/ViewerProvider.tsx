// @ts-nocheck
import React, { createContext, useState, useMemo, memo } from 'react';

export type SeriesInfo = {
  seriesId: string;
  seriesUID: string;
  patientName: string;
  patientSex: string;
  patientAge: string;
  birthday: string;
  seriesNumber: number;
  seriesDesc: string;
  scanMode: string;
  scanTime: string;
  manufacturer: string;
  institutionName: string;
  manufacturersModelName: string;
  protocolName: string;
  studyDescription: string;
  bodyPart: string;
  hospitalName: string;
  uploadTime: string;
  note: string;
  userId: number;
  patientId: string;
  imageCount: number;
  username: string;
  volumeId: string;
  ImageIds: string[];
};

const ImageDatasContext = createContext<SeriesInfo[]>(null);
const VolumesContext = createContext(null);
const RowColumnContext = createContext(null);
const LoadingContext = createContext(null);
const ActiveViewportIdContext = createContext(null);
const CinePlayingContext = createContext(null);
const DICOMTagInfosContext = createContext(null);
const LoadErrorsContext = createContext(null);

const ViewerProvider = ({ children, ImageDatas, Volumes, setLoading, DICOMTagInfos, cinePlaying, setCinePlaying, loadErrors }) => {
  const [rowColumn, setRowColumn] = useState<number[]>([1, 1]);
  const [activeViewportId, setActiveViewportId] = useState<string>('viewport1_1');
  const [tagDisplay, setTagDisplay] = useState(true);
  // console.log("--------------ViewerProvider RENDER---------------");

  const RowColumnContextValue = useMemo(() => ({
    rowColumn, setRowColumn
  }), [rowColumn, setRowColumn])

  const ActiveViewportIdContextValue = useMemo(() => ({
    activeViewportId, setActiveViewportId
  }), [activeViewportId, setActiveViewportId])

  const CinePlayingContextValue = useMemo(() => ({
    cinePlaying, setCinePlaying
  }), [cinePlaying, setCinePlaying])

  const DICOMTagInfosContextValue = useMemo(() => ({
    //DICOMTagInfos, tagDisplay, setTagDisplay
    DICOMTagInfos: DICOMTagInfos || [], tagDisplay, setTagDisplay
  }), [DICOMTagInfos, tagDisplay, setTagDisplay])

  const LoadErrorsContextValue = useMemo(() => ({
    loadErrors
  }), [loadErrors])

  return (
    <ImageDatasContext.Provider value={ImageDatas}>
      <VolumesContext.Provider value={Volumes}>
        <LoadingContext.Provider value={setLoading}>
          <DICOMTagInfosContext.Provider value={DICOMTagInfosContextValue}>
            <CinePlayingContext.Provider value={CinePlayingContextValue}>
              <RowColumnContext.Provider value={RowColumnContextValue}>
                <ActiveViewportIdContext.Provider value={ActiveViewportIdContextValue}>
                  <LoadErrorsContext.Provider value={LoadErrorsContextValue}>
                    {children}
                  </LoadErrorsContext.Provider>
                </ActiveViewportIdContext.Provider>
              </RowColumnContext.Provider>
            </CinePlayingContext.Provider>
          </DICOMTagInfosContext.Provider>
        </LoadingContext.Provider>
      </VolumesContext.Provider>
    </ImageDatasContext.Provider>
  )
}

export default ViewerProvider;
export {
  ImageDatasContext,
  VolumesContext,
  RowColumnContext,
  LoadingContext,
  ActiveViewportIdContext,
  CinePlayingContext,
  DICOMTagInfosContext,
  LoadErrorsContext
}