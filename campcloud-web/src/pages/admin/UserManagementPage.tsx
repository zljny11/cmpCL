import { useMutation, useQuery } from '@tanstack/react-query';
import { App, Button, Card, Descriptions, Empty, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminUsersApi } from '../../services/api/admin-users';
import { queryClient } from '../../services/query-client';
import { AdminUserItem, AdminUserUpsertPayload } from '../../types/admin-users';
import { renderRequirementStatus } from '../requirements/list/helpers';

type UserFormValues = {
  username: string;
  password?: string;
  hospitalName: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  realName?: string;
  email?: string;
  phone?: string;
  wechat?: string;
  department?: string;
  title?: string;
  remark?: string;
};

export function UserManagementPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<UserFormValues>();
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editingUser, setEditingUser] = useState<AdminUserItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [requirementDetailUser, setRequirementDetailUser] = useState<AdminUserItem | null>(null);

  const usersQuery = useQuery({
    queryKey: ['admin', 'users', keyword, page, pageSize],
    queryFn: () => adminUsersApi.list({ keyword: keyword || undefined, page, pageSize }),
  });

  const refreshUsers = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (payload: AdminUserUpsertPayload) => adminUsersApi.create(payload),
    onSuccess: async () => {
      message.success('用户已创建');
      setModalOpen(false);
      form.resetFields();
      await refreshUsers();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AdminUserUpsertPayload }) => adminUsersApi.update(id, payload),
    onSuccess: async () => {
      message.success('用户已更新');
      setModalOpen(false);
      setEditingUser(null);
      form.resetFields();
      await refreshUsers();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminUsersApi.remove(id),
    onSuccess: async () => {
      message.success('用户已删除');
      await refreshUsers();
    },
  });

  const items = usersQuery.data?.list ?? [];

  const openCreateModal = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({ role: 'user', status: 'active' });
    setModalOpen(true);
  };

  const openEditModal = (user: AdminUserItem) => {
    setEditingUser(user);
    form.setFieldsValue({
      username: user.username,
      password: '',
      hospitalName: user.hospitalName,
      role: user.role,
      status: user.status,
      realName: user.profile?.realName || '',
      email: user.profile?.email || '',
      phone: user.profile?.phone || '',
      wechat: user.profile?.wechat || '',
      department: user.profile?.department || '',
      title: user.profile?.title || '',
      remark: user.profile?.remark || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (values: UserFormValues) => {
    const payload: AdminUserUpsertPayload = {
      username: values.username.trim(),
      hospitalName: values.hospitalName.trim(),
      role: values.role,
      status: values.status,
      email: values.email?.trim() || undefined,
    };

    if (values.password?.trim()) {
      payload.password = values.password.trim();
    }

    if (!editingUser && !payload.password) {
      form.setFields([{ name: 'password', errors: ['创建用户时必须填写密码'] }]);
      return;
    }

    if (editingUser) {
      await updateMutation.mutateAsync({ id: editingUser.id, payload });
      return;
    }

    await createMutation.mutateAsync(payload);
  };

  const expandedRowRender = (record: AdminUserItem) => (
    <div style={{ padding: '8px 0' }}>
      <Descriptions size="small" bordered column={3} style={{ marginBottom: 12 }}>
        <Descriptions.Item label="真实姓名">{record.profile?.realName || '-'}</Descriptions.Item>
        <Descriptions.Item label="邮箱">{record.profile?.email || '-'}</Descriptions.Item>
        <Descriptions.Item label="电话">{record.profile?.phone || '-'}</Descriptions.Item>
        <Descriptions.Item label="微信">{record.profile?.wechat || '-'}</Descriptions.Item>
        <Descriptions.Item label="科室">{record.profile?.department || '-'}</Descriptions.Item>
        <Descriptions.Item label="职称">{record.profile?.title || '-'}</Descriptions.Item>
        <Descriptions.Item label="资料备注" span={3}>
          {record.profile?.remark || '-'}
        </Descriptions.Item>
      </Descriptions>

      <Typography.Text strong>关联需求</Typography.Text>
      {record.requirements.length === 0 ? (
        <Empty description="该用户暂无需求" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={record.requirements}
          columns={[
            { title: '需求标题', dataIndex: 'title' },
            { title: '状态', render: (_, item) => renderRequirementStatus(item.status as never) },
            { title: '创建时间', render: (_, item) => dayjs(item.createdAt).format('YYYY-MM-DD HH:mm') },
            {
              title: '操作',
              render: (_, item) => (
                <Link to={`/admin/requirements/${item.id}`}>
                  <Button type="link" size="small">查看需求</Button>
                </Link>
              ),
            },
          ]}
        />
      )}
    </div>
  );

  const titleExtra = useMemo(
    () => (
      <Space>
        <Input
          placeholder="搜索账号、医院、真实姓名"
          value={keywordInput}
          onChange={(event) => setKeywordInput(event.target.value)}
          allowClear
          style={{ width: 260 }}
        />
        <Button
          type="primary"
          onClick={() => {
            setPage(1);
            setKeyword(keywordInput.trim());
          }}
        >
          查询
        </Button>
        <Button
          onClick={() => {
            setKeywordInput('');
            setKeyword('');
            setPage(1);
            setPageSize(10);
          }}
        >
          重置
        </Button>
        <Button type="primary" onClick={openCreateModal}>
          新建用户
        </Button>
      </Space>
    ),
    [keywordInput],
  );

  return (
    <>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Typography.Title level={3} style={{ marginBottom: 0 }}>
            用户管理
          </Typography.Title>
        </div>

      <Card>
        <div style={{ marginBottom: 16 }}>
          {titleExtra}
        </div>
        <Table<AdminUserItem>
          rowKey="id"
          loading={usersQuery.isLoading}
          dataSource={items}
          expandable={{ expandedRowRender }}
          pagination={{
            current: page,
            pageSize,
            total: usersQuery.data?.total ?? 0,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            },
          }}
          columns={[
            { title: '账号', dataIndex: 'username', width: 160 },
            {
              title: '医院',
              dataIndex: 'hospitalName',
              width: 180,
            },
            {
              title: '角色',
              width: 100,
              render: (_, record) => <Tag color={record.role === 'admin' ? 'purple' : 'blue'}>{record.role}</Tag>,
            },
            {
              title: '状态',
              width: 100,
              render: (_, record) => <Tag color={record.status === 'active' ? 'green' : 'red'}>{record.status}</Tag>,
            },
            {
              title: '邮箱',
              width: 220,
              render: (_, record) => record.profile?.email || '-',
            },
            {
              title: '用户资料',
              width: 140,
              render: (_, record) => (
                <Space direction="vertical" size={2}>
                  <Typography.Text>{record.profile?.realName || '-'}</Typography.Text>
                  <Typography.Text type="secondary">{record.profile?.department || '-'}</Typography.Text>
                </Space>
              ),
            },
            {
              title: '关联需求',
              width: 150,
              render: (_, record) => (
                <Space size={6}>
                  <Typography.Text>{record.requirements.length}</Typography.Text>
                  <Button type="link" size="small" onClick={() => setRequirementDetailUser(record)}>
                    详情
                  </Button>
                </Space>
              ),
            },
            {
              title: '最近登录',
              width: 160,
              render: (_, record) => (record.lastLoginAt ? dayjs(record.lastLoginAt).format('YYYY-MM-DD HH:mm') : '-'),
            },
            {
              title: '操作',
              width: 160,
              render: (_, record) => (
                <Space size={4}>
                  <Button type="link" size="small" onClick={() => openEditModal(record)}>
                    编辑
                  </Button>
                  <Popconfirm
                    title="删除用户"
                    description="删除后会连带删除该用户关联的需求和资料。"
                    okText="确定"
                    cancelText="取消"
                    onConfirm={() => deleteMutation.mutate(record.id)}
                  >
                    <Button type="link" size="small" danger loading={deleteMutation.isPending && deleteMutation.variables === record.id}>
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
          />
        </Card>
      </Space>

      <Modal
        open={Boolean(requirementDetailUser)}
        title={requirementDetailUser ? `${requirementDetailUser.username} 的关联需求` : '关联需求'}
        footer={null}
        onCancel={() => setRequirementDetailUser(null)}
        width={760}
        destroyOnClose
      >
        {requirementDetailUser?.requirements.length ? (
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={requirementDetailUser.requirements}
            columns={[
              { title: '需求标题', dataIndex: 'title' },
              { title: '状态', render: (_, item) => renderRequirementStatus(item.status as never) },
              { title: '创建时间', render: (_, item) => dayjs(item.createdAt).format('YYYY-MM-DD HH:mm') },
              {
                title: '操作',
                render: (_, item) => (
                  <Link to={`/admin/requirements/${item.id}`}>
                    <Button type="link" size="small">查看需求</Button>
                  </Link>
                ),
              },
            ]}
          />
        ) : (
          <Empty description="该用户暂无需求" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Modal>

      <Modal
        open={modalOpen}
        title={editingUser ? '编辑用户' : '新建用户'}
        okText={editingUser ? '保存' : '创建'}
        cancelText="取消"
        onCancel={() => {
          setModalOpen(false);
          setEditingUser(null);
          form.resetFields();
        }}
        onOk={() => void form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        width={760}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(values) => void handleSubmit(values)}>
          <Space style={{ width: '100%' }} size={16} align="start">
            <Form.Item label="账号" name="username" rules={[{ required: true, message: '请输入账号' }]}>
              <Input />
            </Form.Item>
            <Form.Item
              label={editingUser ? '重置密码' : '密码'}
              name="password"
              rules={editingUser ? [{ min: 6, message: '密码至少 6 位' }] : [{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少 6 位' }]}
            >
              <Input.Password placeholder={editingUser ? '留空则不修改' : ''} />
            </Form.Item>
            <Form.Item label="医院" name="hospitalName" rules={[{ required: true, message: '请输入医院' }]}>
              <Input />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size={16} align="start">
            <Form.Item label="角色" name="role" rules={[{ required: true, message: '请选择角色' }]}>
              <Select style={{ width: 160 }} options={[{ label: '用户', value: 'user' }, { label: '管理员', value: 'admin' }]} />
            </Form.Item>
            <Form.Item label="状态" name="status" rules={[{ required: true, message: '请选择状态' }]}>
              <Select style={{ width: 160 }} options={[{ label: '启用', value: 'active' }, { label: '禁用', value: 'disabled' }]} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size={16} align="start">
            <Form.Item label="真实姓名" name="realName">
              <Input readOnly />
            </Form.Item>
            <Form.Item
              label="邮箱"
              name="email"
              rules={[{ type: 'email', message: '请输入正确的邮箱格式' }]}
              extra="管理员通知邮件会发送到这个邮箱"
            >
              <Input placeholder="请输入邮箱地址" />
            </Form.Item>
            <Form.Item label="电话" name="phone">
              <Input readOnly />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size={16} align="start">
            <Form.Item label="微信" name="wechat">
              <Input readOnly />
            </Form.Item>
            <Form.Item label="科室" name="department">
              <Input readOnly />
            </Form.Item>
            <Form.Item label="职称" name="title">
              <Input readOnly />
            </Form.Item>
          </Space>
          <Form.Item label="资料备注" name="remark">
            <Input.TextArea rows={3} readOnly />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
