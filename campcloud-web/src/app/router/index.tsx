import { Navigate, Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { Result, Spin } from 'antd';
import { AppShell } from '../../components/layout/AppShell';
import { useAuth } from '../providers/auth-provider';
import { LoginPage } from '../../pages/auth/LoginPage';
import { DashboardPage } from '../../pages/dashboard';
import { ProfilePage } from '../../pages/profile';
import { RequirementCreatePage } from '../../pages/requirements/create';
import { RequirementListPage } from '../../pages/requirements/list';
import { RequirementDetailPage } from '../../pages/requirements/detail';
import { UploadCenterPage } from '../../pages/uploads';
import { NotificationPage } from '../../pages/notifications';
import { AdminRequirementListPage } from '../../pages/admin/RequirementListPage';
import { AdminRequirementDetailPage } from '../../pages/admin/RequirementDetailPage';

function ProtectedRoute() {
  const { isAuthenticated, isReady } = useAuth();

  if (!isReady) {
    return <Spin fullscreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell><Outlet /></AppShell>;
}

function AdminRoute() {
  const { user } = useAuth();

  if (user?.role !== 'admin') {
    return <Result status="403" title="403" subTitle="仅管理员可访问该页面" />;
  }

  return <Outlet />;
}

function PublicOnlyRoute() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/" replace /> : <Outlet />;
}

function RouterContainer() {
  const router = createBrowserRouter([
    {
      element: <PublicOnlyRoute />,
      children: [{ path: '/login', element: <LoginPage /> }],
    },
    {
      path: '/',
      element: <ProtectedRoute />,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: 'profile', element: <ProfilePage /> },
        { path: 'requirements', element: <RequirementListPage /> },
        { path: 'requirements/create', element: <RequirementCreatePage /> },
        { path: 'requirements/:id', element: <RequirementDetailPage /> },
        { path: 'requirements/:id/upload', element: <UploadCenterPage /> },
        { path: 'uploads', element: <UploadCenterPage /> },
        { path: 'notifications', element: <NotificationPage /> },
        {
          path: 'admin',
          element: <AdminRoute />,
          children: [
            { path: 'requirements', element: <AdminRequirementListPage /> },
            { path: 'requirements/:id', element: <AdminRequirementDetailPage /> },
          ],
        },
      ],
    },
  ]);

  return <RouterProvider router={router} />;
}

export function AppRouter() {
  return <RouterContainer />;
}
