import { useMutation } from '@tanstack/react-query';
import { Button, Card, Form, Input, Select, Space, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { requirementsApi } from '../../../services/api/requirements';

const requirementTypeOptions = [
  { label: 'CT超高分辨率', value: 'CT_SUPER_RESOLUTION' },
  { label: 'CT降噪', value: 'CT_DENOISE' },
  { label: 'MR超分辨率', value: 'MR_SUPER_RESOLUTION' },
  { label: 'MR降噪', value: 'MR_DENOISE' },
  { label: 'PET降噪', value: 'PET_DENOISE' },
  { label: 'PET超分辨率', value: 'PET_SUPER_RESOLUTION' },
  { label: 'SPECT断层显像降噪', value: 'SPECT_TOMOGRAPHIC_DENOISE' },
  { label: 'SPECT平面显像降噪', value: 'SPECT_PLANAR_DENOISE' },
  { label: '其他 / 自定义', value: 'OTHER' },
];

export function RequirementCreatePage() {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: requirementsApi.create,
    onSuccess: (data) => {
      message.success('需求单已创建');
      navigate(`/requirements/${data.id}`);
    },
  });

  return (
    <Card bordered={false}>
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <div>
          <Typography.Title level={3}>新建科研需求</Typography.Title>
          <Typography.Paragraph type="secondary">
            第二周期先收口需求单主链路。当前页面聚焦把需求讲清楚，不扩展上传、留言和交付之外的复杂字段。
          </Typography.Paragraph>
        </div>

        <Card title="需求表单" size="small">
          <Form
            form={form}
            layout="vertical"
            onFinish={(values) =>
              mutation.mutate({
                ...values,
                typeCustom: values.type === 'OTHER' ? values.typeCustom : null,
              })
            }
          >
            <Form.Item label="需求类型" name="type" rules={[{ required: true, message: '请选择需求类型' }]}>
              <Select options={requirementTypeOptions} placeholder="请选择最贴近当前图像质量问题的需求类型" />
            </Form.Item>
            <Form.Item noStyle shouldUpdate>
              {({ getFieldValue }) =>
                getFieldValue('type') === 'OTHER' ? (
                  <Form.Item
                    label="自定义类型"
                    name="typeCustom"
                    rules={[
                      { required: true, message: '请输入自定义类型' },
                      { max: 30, message: '自定义类型最多 30 个字' },
                    ]}
                  >
                    <Input placeholder="请输入自定义需求类型，最多 30 个字" maxLength={30} showCount />
                  </Form.Item>
                ) : null
              }
            </Form.Item>
            <Form.Item label="需求标题" name="title" rules={[{ required: true, message: '请输入需求标题' }]}>
              <Input placeholder="请用一句话概括场景、模态和目标，例如：胸部 CT 超高分辨率重建模型优化" />
            </Form.Item>
            <Form.Item
              label="需求描述"
              name="description"
              rules={[{ required: true, message: '请输入需求描述' }]}
            >
              <Input.TextArea
                rows={6}
                placeholder="请写清当前数据来源、现有问题、期望合作方式，以及为什么需要这个方向的模型能力。"
              />
            </Form.Item>
            <Form.Item label="期望目标" name="expectedGoal">
              <Input.TextArea
                rows={4}
                placeholder="请重点描述你希望看到的最终结果，例如提升图像质量、支持后续科研分析或医生阅片。"
              />
            </Form.Item>
            <Form.Item label="补充备注" name="remark">
              <Input.TextArea rows={3} placeholder="可补充时间节点、标注情况、合规要求、交付偏好或历史项目背景。" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={mutation.isPending}>
              创建需求单
            </Button>
          </Form>
        </Card>
      </Space>
    </Card>
  );
}
