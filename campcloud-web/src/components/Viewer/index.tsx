// @ts-nocheck
import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useAppSelector } from "../../redux/hooks";
import ViewerProvider from "./ViewerProvider";
import { RenderingEngine, getRenderingEngine } from "@cornerstonejs/core";
import { initDemo } from "./function/helpers";
import { getImageDatas, renderingEngineId, ToolGroupSetToolActive } from "./function";
import { Layout, ConfigProvider, theme } from "antd";
import RaDynLoading from "../RaDynLoading";
import ViewerHeader from "./ViewerHeader";
import ViewerSider from "./ViewerSider";
import ViewerContent from "./ViewerContent";
import axiosInstances from "../../axiosInstance";
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import "./index.less";
import { SeriesMetaData } from "../../types";

const { Header, Sider, Content } = Layout;

declare global {
  interface Window {
    __viewerDebugPush?: (payload: unknown) => void;
  }
}

const Viewer: React.FC = () => {
  const location = useLocation();
  const { records } = location.state || { records: [] };

  const { apiId } = useAppSelector(state => state.ApiIdReducer)
  const [ImageDatas, setImageDatas] = useState<SeriesMetaData[]>([]);
  const [Volumes, setVolumes] = useState<any>([]);
  const [loading, setLoading] = useState<boolean>(true)
  const [DICOMTagInfos, setDICOMTagInfos] = useState<any>([]);
  const [cinePlaying, setCinePlaying] = useState<boolean>(false);
  const [loadErrors, setLoadErrors] = useState<any>({});
  const [debugInfo, setDebugInfo] = useState<any>({
    records: [],
    imageDatas: [],
    dicomTagInfos: [],
    loadErrors: {},
    initError: null,
    steps: [],
  });
  // console.log("----------VIEWER RENDER-------------------");

  useEffect(() => {
    window.__viewerDebugPush = (payload: unknown) => {
      setDebugInfo((prev) => ({
        ...prev,
        steps: [
          ...prev.steps,
          {
            step: 'viewport-debug',
            at: new Date().toISOString(),
            payload,
          },
        ],
      }));
    };

    return () => {
      delete window.__viewerDebugPush;
    };
  }, []);

  useEffect(() => {
    const initAndFetchData = async () => {
      try {
        setDebugInfo((prev) => ({
          ...prev,
          records,
          steps: [...prev.steps, { step: 'init-start', at: new Date().toISOString() }],
        }));
        const [, imageDatas] = await Promise.all([
          initDemo(),// 初始化Cornerstone
          getImageDatas(records, apiId)
        ]);

        setDebugInfo((prev) => ({
          ...prev,
          imageDatas,
          steps: [
            ...prev.steps,
            {
              step: 'imageDatas-loaded',
              at: new Date().toISOString(),
              seriesCount: imageDatas.length,
              imageCounts: imageDatas.map((item) => item.ImageIds?.length ?? 0),
            },
          ],
        }));

        if (imageDatas[0]?.ImageIds?.[0]) {
          try {
            await dicomImageLoader.wadouri.loadImage(imageDatas[0].ImageIds[0]);
            setDebugInfo((prev) => ({
              ...prev,
              steps: [
                ...prev.steps,
                {
                  step: 'first-image-prefetch-ok',
                  at: new Date().toISOString(),
                  imageId: imageDatas[0].ImageIds[0],
                },
              ],
            }));
          } catch (error) {
            setDebugInfo((prev) => ({
              ...prev,
              steps: [
                ...prev.steps,
                {
                  step: 'first-image-prefetch-error',
                  at: new Date().toISOString(),
                  imageId: imageDatas[0].ImageIds[0],
                  error: error?.message ?? String(error),
                },
              ],
            }));
          }
        }

        if (!getRenderingEngine(renderingEngineId))
          new RenderingEngine(renderingEngineId);

        ToolGroupSetToolActive();

        let DICOMTagsInfo = [];
        try {
          const res = await axiosInstances[apiId].post('/getDICOMTagInfo',
            { seriesUIDs: imageDatas.map(item => item.seriesUID), seriesIds: imageDatas.map(item => item.seriesId) });
          DICOMTagsInfo = res.data;
          setDebugInfo((prev) => ({
            ...prev,
            dicomTagInfos: res.data,
            steps: [...prev.steps, { step: 'dicom-tags-loaded', at: new Date().toISOString(), count: res.data?.length ?? 0 }],
          }));
        } catch (error) {
          console.error("Viewer getDICOMTagInfo异常: " + error.response.data);
          setDebugInfo((prev) => ({
            ...prev,
            steps: [
              ...prev.steps,
              {
                step: 'dicom-tags-error',
                at: new Date().toISOString(),
                error: error?.response?.data ?? error?.message ?? String(error),
              },
            ],
          }));
        }

        setImageDatas(imageDatas);
        setDICOMTagInfos(DICOMTagsInfo);
        setVolumes([]);
      } catch (error) {
        console.log("Viewer init异常: " + error);
        setDebugInfo((prev) => ({
          ...prev,
          initError: error?.message ?? String(error),
          steps: [
            ...prev.steps,
            {
              step: 'init-error',
              at: new Date().toISOString(),
              error: error?.message ?? String(error),
            },
          ],
        }));
      } finally {
        setLoading(false);
      }
    }

    initAndFetchData();
  }, []);

  const handleKeyDown = useCallback((event) => {
    if (event.key === ' ') {
      event.preventDefault(); // 阻止空格键的默认行为（如果有的话）  
      setCinePlaying(!cinePlaying)
    }
  }, [cinePlaying]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  });

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorBgSpotlight: "#0069a7", },
      }}
    >

      <ViewerProvider
        ImageDatas={ImageDatas}
        Volumes={Volumes}
        setLoading={setLoading}
        DICOMTagInfos={DICOMTagInfos}
        cinePlaying={cinePlaying}
        setCinePlaying={setCinePlaying}
        loadErrors={loadErrors}
      >
        <RaDynLoading loading={loading} />

        <Layout className="Viewer">
          <Header className="ViewerHeader">
            <ViewerHeader />
          </Header>

          <Layout>
            <Sider
              className="ViewerSider"
              collapsible
              width={260}
              collapsedWidth={0}
              zeroWidthTriggerStyle={{ top: -50, left: 0 }}

            >
              <ViewerSider />
            </Sider>

            <Layout>
              <Content className="ViewerContent">
                <ViewerContent />
              </Content>
            </Layout>

          </Layout>

        </Layout>

        <div
          style={{
            position: 'fixed',
            right: 12,
            bottom: 12,
            width: 420,
            maxHeight: '42vh',
            overflow: 'auto',
            background: 'rgba(0,0,0,0.88)',
            color: '#9ef0ff',
            border: '1px solid #0069a7',
            borderRadius: 8,
            padding: 12,
            zIndex: 9999,
            fontSize: 12,
            lineHeight: 1.4,
            whiteSpace: 'pre-wrap',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Viewer Debug</div>
          <pre style={{ margin: 0 }}>
            {JSON.stringify(
              {
                loading,
                records,
                imageDatas: ImageDatas.map((item) => ({
                  seriesId: item.seriesId,
                  seriesUID: item.seriesUID,
                  seriesDesc: item.seriesDesc,
                  imageIdCount: item.ImageIds?.length ?? 0,
                  firstImageId: item.ImageIds?.[0] ?? null,
                })),
                dicomTagInfos: DICOMTagInfos,
                loadErrors,
                debugInfo,
              },
              null,
              2,
            )}
          </pre>
        </div>

      </ViewerProvider>
    </ConfigProvider>
  );
};

export default Viewer;
