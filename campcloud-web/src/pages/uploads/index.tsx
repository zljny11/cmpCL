import { CloudUploadOutlined, FileSearchOutlined, FolderOpenOutlined, InboxOutlined } from '@ant-design/icons';
import { Button, Card, Col, Empty, Row, Space, Typography, message } from 'antd';
import { Link, useParams, useSearchParams } from 'react-router-dom';

export function UploadCenterPage() {
  const { id: routeRequirementId } = useParams();
  const [searchParams] = useSearchParams();
  const requirementId = routeRequirementId || searchParams.get('requirementId');
  const handleDeveloping = () => message.info('正在开发');

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <Card
        bordered={false}
        style={{
          background: 'linear-gradient(135deg, #f4fbff 0%, #ffffff 55%, #eef6fb 100%)',
          border: '1px solid #d9e8f2',
        }}
      >
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Title level={3} style={{ margin: 0 }}>
                数据上传中心
              </Typography.Title>
              <Typography.Text type="secondary">
                面向医院科研合作场景，统一管理影像数据批次、来源说明与归档状态，便于按需求单持续推进数据交接与后续处理。
              </Typography.Text>
              {requirementId ? (
                <Space wrap>
                  <Link to={`/requirements/${requirementId}`}>
                    <Button icon={<FileSearchOutlined />}>返回需求详情</Button>
                  </Link>
                </Space>
              ) : null}
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card>
            <Space direction="vertical" size={12}>
              <InboxOutlined style={{ fontSize: 28, color: '#4f87a8' }} />
              <Typography.Title level={5} style={{ margin: 0 }}>
                影像上传入口
              </Typography.Title>
              <Typography.Text type="secondary">
                支持围绕具体科研需求发起影像上传，集中承接 DICOM 数据、说明信息与批次归档。
              </Typography.Text>
              <Button type="link" style={{ padding: 0 }} onClick={handleDeveloping}>
                进入上传流程
              </Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card>
            <Space direction="vertical" size={12}>
              <FolderOpenOutlined style={{ fontSize: 28, color: '#4f87a8' }} />
              <Typography.Title level={5} style={{ margin: 0 }}>
                数据批次管理
              </Typography.Title>
              <Typography.Text type="secondary">
                按批次管理科室来源、检查范围、文件规模与处理状态，方便项目双方统一追踪。
              </Typography.Text>
              <Button type="link" style={{ padding: 0 }} onClick={handleDeveloping}>
                查看批次详情
              </Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card>
            <Space direction="vertical" size={12}>
              <CloudUploadOutlined style={{ fontSize: 28, color: '#4f87a8' }} />
              <Typography.Title level={5} style={{ margin: 0 }}>
                数据结构预览
              </Typography.Title>
              <Typography.Text type="secondary">
                结合患者、检查、序列三级结构进行预览，帮助快速确认上传数据的范围、层级与完整性。
              </Typography.Text>
              <Button type="link" style={{ padding: 0 }} onClick={handleDeveloping}>
                查看结构预览
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card title={requirementId ? `需求单 ${requirementId} 的影像批次` : '近期影像批次'}>
        <Empty description="暂无影像批次数据" />
      </Card>
    </Space>
  );
}
