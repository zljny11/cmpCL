import { Button, Checkbox, Dropdown, Space, Tag } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DataPageVisibleTags, RequirementExpandPanel } from '../requirements/list/components/RequirementExpandPanel';
import './AdminRequirementDataPage.less';

const DEFAULT_VISIBLE_TAGS: DataPageVisibleTags = {
  studyManufacturer: false,
  studyProtocolName: false,
  studyManufacturerModelName: false,
  seriesUid: false,
  seriesBodyPart: false,
  seriesDiagnosis: false,
  seriesClinicalTags: false,
  seriesAnnotationStatus: false,
};

export function AdminRequirementDataPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [visibleTags, setVisibleTags] = useState<DataPageVisibleTags>(DEFAULT_VISIBLE_TAGS);
  const selectedTagLabels = useMemo(
    () =>
      [
        visibleTags.studyManufacturer ? '厂家' : null,
        visibleTags.studyProtocolName ? '协议' : null,
        visibleTags.studyManufacturerModelName ? '设备型号' : null,
        visibleTags.seriesUid ? '序列UID' : null,
        visibleTags.seriesBodyPart ? '身体部位' : null,
        visibleTags.seriesDiagnosis ? '疾病诊断' : null,
        visibleTags.seriesClinicalTags ? '临床金标准' : null,
        visibleTags.seriesAnnotationStatus ? '标注状态' : null,
      ].filter(Boolean) as string[],
    [visibleTags],
  );

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }} className="admin-requirement-data-page">
      <Space>
        <Button onClick={() => navigate(`/admin/requirements/${id}`)}>返回详情</Button>
        <Dropdown
          trigger={['click']}
          dropdownRender={() => (
            <div style={{ padding: 12, background: '#fff', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)' }}>
              <Space direction="vertical" size={10}>
                <div>
                  <div style={{ marginBottom: 6, fontSize: 12, color: '#667784' }}>检查</div>
                  <Checkbox
                    checked={visibleTags.studyManufacturer}
                    onChange={(event) => setVisibleTags((current) => ({ ...current, studyManufacturer: event.target.checked }))}
                  >
                    厂家
                  </Checkbox>
                  <Checkbox
                    checked={visibleTags.studyProtocolName}
                    onChange={(event) => setVisibleTags((current) => ({ ...current, studyProtocolName: event.target.checked }))}
                  >
                    协议
                  </Checkbox>
                  <Checkbox
                    checked={visibleTags.studyManufacturerModelName}
                    onChange={(event) =>
                      setVisibleTags((current) => ({ ...current, studyManufacturerModelName: event.target.checked }))
                    }
                  >
                    设备型号
                  </Checkbox>
                </div>
                <div>
                  <div style={{ marginBottom: 6, fontSize: 12, color: '#667784' }}>序列</div>
                  <Checkbox
                    checked={visibleTags.seriesUid}
                    onChange={(event) => setVisibleTags((current) => ({ ...current, seriesUid: event.target.checked }))}
                  >
                    序列UID
                  </Checkbox>
                  <Checkbox
                    checked={visibleTags.seriesBodyPart}
                    onChange={(event) => setVisibleTags((current) => ({ ...current, seriesBodyPart: event.target.checked }))}
                  >
                    身体部位
                  </Checkbox>
                  <Checkbox
                    checked={visibleTags.seriesDiagnosis}
                    onChange={(event) => setVisibleTags((current) => ({ ...current, seriesDiagnosis: event.target.checked }))}
                  >
                    疾病诊断
                  </Checkbox>
                  <Checkbox
                    checked={visibleTags.seriesClinicalTags}
                    onChange={(event) => setVisibleTags((current) => ({ ...current, seriesClinicalTags: event.target.checked }))}
                  >
                    临床金标准
                  </Checkbox>
                  <Checkbox
                    checked={visibleTags.seriesAnnotationStatus}
                    onChange={(event) =>
                      setVisibleTags((current) => ({ ...current, seriesAnnotationStatus: event.target.checked }))
                    }
                  >
                    标注状态
                  </Checkbox>
                </div>
              </Space>
            </div>
          )}
        >
          <Button>已选tag</Button>
        </Dropdown>
        <Space size={[6, 6]} wrap>
          {selectedTagLabels.map((label) => (
            <Tag key={label} color="blue">
              {label}
            </Tag>
          ))}
        </Space>
      </Space>
      <RequirementExpandPanel requirementId={id} expanded readOnly visibleTags={visibleTags} />
    </Space>
  );
}
