import { Suspense, lazy } from 'react';
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
import { UploadRequirementDataPage } from '../../pages/uploads/UploadRequirementDataPage';
import { NotificationPage } from '../../pages/notifications';
import { AdminRequirementListPage } from '../../pages/admin/RequirementListPage';
import { AdminRequirementDetailPage } from '../../pages/admin/RequirementDetailPage';
import { AdminRequirementDataPage } from '../../pages/admin/AdminRequirementDataPage';
import { AdminLogsPage } from '../../pages/admin/AdminLogsPage';
import { UserManagementPage } from '../../pages/admin/UserManagementPage';
import { LazyRouteErrorBoundary } from './LazyRouteErrorBoundary';

const RequirementViewerPage = lazy(() =>
  import('../../pages/requirements/viewer').then((module) => ({ default: module.RequirementViewerPage })),
);

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

function ProtectedFullscreenRoute() {
  const { isAuthenticated, isReady } = useAuth();

  if (!isReady) {
    return <Spin fullscreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
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
      element: <ProtectedFullscreenRoute />,
      children: [
        {
          path: 'requirements/:id/viewer',
          element: (
            <LazyRouteErrorBoundary routeName="Viewer">
              <Suspense fallback={<Spin fullscreen />}>
                <RequirementViewerPage />
              </Suspense>
            </LazyRouteErrorBoundary>
          ),
        },
      ],
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
        { path: 'requirements/:id/upload/data', element: <UploadRequirementDataPage /> },
        { path: 'uploads', element: <UploadCenterPage /> },
        { path: 'uploads/data', element: <UploadRequirementDataPage /> },
        { path: 'notifications', element: <NotificationPage /> },
        {
          path: 'admin',
          element: <AdminRoute />,
          children: [
            { path: 'requirements', element: <AdminRequirementListPage /> },
            { path: 'requirements/:id', element: <AdminRequirementDetailPage /> },
            { path: 'requirements/:id/data', element: <AdminRequirementDataPage /> },
            { path: 'users', element: <UserManagementPage /> },
            { path: 'logs', element: <AdminLogsPage /> },
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
