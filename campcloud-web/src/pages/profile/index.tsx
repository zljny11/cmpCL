import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Form, Input, Row, Space, Typography, message } from 'antd';
import { useEffect } from 'react';
import { profileApi } from '../../services/api/profile';
import { useAuth } from '../../app/providers/auth-provider';

export function ProfilePage() {
  const [form] = Form.useForm();
  const { user, refreshMe } = useAuth();
  const watchedValues = Form.useWatch([], form);
  const { data, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.getProfile,
  });

  const mutation = useMutation({
    mutationFn: profileApi.updateProfile,
    onSuccess: async () => {
      message.success('资料已更新');
      await refreshMe();
    },
  });

  useEffect(() => {
    if (data) {
      form.setFieldsValue(data);
    }
  }, [data, form]);

  const profileCompleted = Boolean(
    watchedValues?.realName &&
      watchedValues?.email &&
      watchedValues?.phone &&
      user?.hospitalName &&
      watchedValues?.department &&
      watchedValues?.title,
  );

  return (
    <Card loading={isLoading} bordered={false}>
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <div>
          <Typography.Title level={3}>用户资料</Typography.Title>
          <Typography.Paragraph type="secondary">
            第二周期内，资料完整度按姓名、邮箱、电话、医院、科室、职称六项判断。资料完整后再进入需求沟通和交付，会更顺畅。
          </Typography.Paragraph>
        </div>

        {!profileCompleted ? (
          <Alert
            type="warning"
            showIcon
            message="资料尚未完整"
            description="请补齐姓名、邮箱、电话、医院、科室和职称，避免后续需求创建、状态确认和交付沟通出现信息缺口。"
          />
        ) : (
          <Alert type="success" showIcon message="资料已完整，可继续进行需求创建与沟通。" />
        )}

        <Card title="基础信息" size="small">
          <Form form={form} layout="vertical" onFinish={(values) => mutation.mutate(values)}>
            <Row gutter={[16, 0]}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="联系人姓名"
                  name="realName"
                  rules={[{ required: true, message: '请输入联系人姓名' }]}
                >
                  <Input placeholder="请输入需求沟通的直接联系人姓名" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="医院名称">
                  <Input value={user?.hospitalName} disabled />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label="邮箱"
                  name="email"
                  rules={[
                    { required: true, message: '请输入邮箱' },
                    { type: 'email', message: '请输入正确的邮箱格式' },
                  ]}
                >
                  <Input placeholder="请输入用于接收需求沟通和交付通知的邮箱" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label="电话"
                  name="phone"
                  rules={[
                    { required: true, message: '请输入电话' },
                    { pattern: /^[0-9\-+() ]{6,32}$/, message: '请输入有效的电话' },
                  ]}
                >
                  <Input placeholder="请输入工作手机号或办公电话" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label="科室"
                  name="department"
                  rules={[{ required: true, message: '请输入科室' }]}
                >
                  <Input placeholder="请输入所在科室，例如放射科、核医学科" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label="职称"
                  name="title"
                  rules={[{ required: true, message: '请输入职称' }]}
                >
                  <Input placeholder="请输入职称，例如主治医师、副主任医师" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="备注" name="remark">
              <Input.TextArea rows={4} placeholder="可补充合作背景、联系方式偏好或历史项目背景" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={mutation.isPending}>
              保存资料
            </Button>
          </Form>
        </Card>
      </Space>
    </Card>
  );
}
