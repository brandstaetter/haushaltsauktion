import { createBrowserRouter, Navigate } from 'react-router';
import { App } from './App';
import { Layout } from './components/Layout/Layout';
import { useSession } from './api/hooks';
import { LoginPage } from './pages/LoginPage/LoginPage';
import { RegisterPage } from './pages/RegisterPage/RegisterPage';
import { DashboardPage } from './pages/DashboardPage/DashboardPage';
import { TaskListPage } from './pages/TaskListPage/TaskListPage';
import { TaskDetailPage } from './pages/TaskDetailPage/TaskDetailPage';
import { HistoryPage } from './pages/HistoryPage/HistoryPage';
import { AccountPage } from './pages/AccountPage/AccountPage';
import { LedgerPage } from './pages/LedgerPage/LedgerPage';
import { AdminPage } from './pages/AdminPage/AdminPage';
import { AdminSettingsPage } from './pages/AdminPage/AdminSettingsPage';

function Protected({ children }: { children: React.ReactNode }) {
  const { data: session, isLoading } = useSession();
  if (isLoading) return null;
  if (!session?.member) {
    return <Navigate to="/login" replace state={{ next: location.pathname }} />;
  }
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { data: session, isLoading } = useSession();
  if (isLoading) return null;
  if (session?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        path: '/',
        element: <Layout />,
        children: [
          {
            index: true,
            element: (
              <Protected>
                <DashboardPage />
              </Protected>
            ),
          },
          {
            path: 'aufgaben',
            element: (
              <Protected>
                <TaskListPage />
              </Protected>
            ),
          },
          {
            path: 'aufgaben/:id',
            element: (
              <Protected>
                <TaskDetailPage />
              </Protected>
            ),
          },
          {
            path: 'verlauf',
            element: (
              <Protected>
                <HistoryPage />
              </Protected>
            ),
          },
          {
            path: 'ich',
            element: (
              <Protected>
                <AccountPage />
              </Protected>
            ),
          },
          {
            path: 'punktekonto',
            element: (
              <Protected>
                <LedgerPage />
              </Protected>
            ),
          },
          {
            path: 'verwaltung',
            element: (
              <AdminRoute>
                <AdminPage />
              </AdminRoute>
            ),
          },
          {
            path: 'verwaltung/einstellungen',
            element: (
              <AdminRoute>
                <AdminSettingsPage />
              </AdminRoute>
            ),
          },
        ],
      },
      { path: 'login', element: <LoginPage /> },
      { path: 'registrieren', element: <RegisterPage /> },
    ],
  },
]);
