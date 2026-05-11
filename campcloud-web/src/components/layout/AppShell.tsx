import { FileAddOutlined, FileSearchOutlined, HomeOutlined, LogoutOutlined, SettingOutlined } from '@ant-design/icons';
import { Button, Image, Layout, Menu, Space, Typography } from 'antd';
import { PropsWithChildren } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/auth-provider';
import radioDynamicLogo from '../../pages/auth/assets/logo.png';

const { Header, Content, Sider } = Layout;

export function AppShell({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const menuItems = [
    { key: '/', icon: <HomeOutlined />, label: 'Dashboard' },
    { key: '/requirements', icon: <FileSearchOutlined />, label: '需求列表' },
    { key: '/requirements/create', icon: <FileAddOutlined />, label: '新建需求' },
    { key: '/profile', icon: <SettingOutlined />, label: '个人资料' },
  ];

  if (user?.role === 'admin') {
    menuItems.push({ key: '/admin/requirements', icon: <SettingOutlined />, label: '管理侧需求' });
  }

  const selectedKey =
    [...menuItems]
      .sort((left, right) => right.key.length - left.key.length)
      .find((item) => location.pathname === item.key || location.pathname.startsWith(`${item.key}/`))?.key ?? '/';

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Sider width={240} theme="light" style={{ borderRight: '1px solid #e7edf4' }}>
        <div style={{ padding: '24px 20px 18px' }}>
          <Image preview={false} src={radioDynamicLogo} alt="影动医疗" width={180} />
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderInlineEnd: 'none' }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: 'rgba(255,255,255,0.82)',
            backdropFilter: 'blur(16px)',
            borderBottom: '1px solid #e7edf4',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingInline: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 12,
              whiteSpace: 'nowrap',
            }}
          >
            <Typography.Title
              level={4}
              style={{
                margin: 0,
                color: '#4f87a8',
                fontWeight: 700,
                letterSpacing: '0.04em',
                fontFamily: '"Avenir Next", "Helvetica Neue", sans-serif',
              }}
            >
              CampCloud
            </Typography.Title>
            <Typography.Text
              style={{
                color: '#6f7f8c',
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: '0.12em',
              }}
            >
              科研需求协作平台
            </Typography.Text>
          </div>
          <Space>
            <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>
              {user?.hospitalName}
            </Typography.Text>
            <Button
              icon={<LogoutOutlined />}
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              退出
            </Button>
          </Space>
        </Header>
        <Content style={{ padding: 24 }}>
          <div
            style={{
              minHeight: 'calc(100vh - 112px)',
              background: 'rgba(255,255,255,0.74)',
              borderRadius: 20,
              border: '1px solid #e8eef4',
              padding: 24,
              boxShadow: '0 20px 60px rgba(17, 39, 56, 0.06)',
            }}
          >
            {children}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
