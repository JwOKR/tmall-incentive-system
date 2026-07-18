import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmDialog';
import ErrorBoundary from './components/ErrorBoundary';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useBodyScrollLock } from './hooks/useBodyScrollLock';
import Layout from './components/Layout';
import { Loader2 } from 'lucide-react';

// 路由懒加载
const Landing = lazy(() => import('./pages/Landing'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Takers = lazy(() => import('./pages/Takers'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Orders = lazy(() => import('./pages/Orders'));
const Logs = lazy(() => import('./pages/Logs'));
const ExportPage = lazy(() => import('./pages/ExportPage'));
const IntervalStats = lazy(() => import('./pages/IntervalStats'));
const CommissionStats = lazy(() => import('./pages/CommissionStats'));
const AnomalyAlerts = lazy(() => import('./pages/AnomalyAlerts'));
const RepeatDiscounts = lazy(() => import('./pages/RepeatDiscounts'));
const TakerDetail = lazy(() => import('./pages/TakerDetail'));
const Settings = lazy(() => import('./pages/Settings'));
const Login = lazy(() => import('./pages/Login'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

// 页面加载 fallback
function PageLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

// 路由守卫：未登录时跳转登录页
function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  useKeyboardShortcuts();
  useBodyScrollLock();

  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/"
          element={
            <ProtectedLayout>
              <Landing />
            </ProtectedLayout>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedLayout>
              <Dashboard />
            </ProtectedLayout>
          }
        />
        <Route
          path="/takers"
          element={
            <ProtectedLayout>
              <Takers />
            </ProtectedLayout>
          }
        />
        <Route
          path="/tasks"
          element={
            <ProtectedLayout>
              <Tasks />
            </ProtectedLayout>
          }
        />
        <Route
          path="/orders"
          element={
            <ProtectedLayout>
              <Orders />
            </ProtectedLayout>
          }
        />
        <Route
          path="/logs"
          element={
            <ProtectedLayout>
              <Logs />
            </ProtectedLayout>
          }
        />
        <Route
          path="/intervals"
          element={
            <ProtectedLayout>
              <IntervalStats />
            </ProtectedLayout>
          }
        />
        <Route
          path="/commissions"
          element={
            <ProtectedLayout>
              <CommissionStats />
            </ProtectedLayout>
          }
        />
        <Route
          path="/export"
          element={
            <ProtectedLayout>
              <ExportPage />
            </ProtectedLayout>
          }
        />
        <Route
          path="/anomalies"
          element={
            <ProtectedLayout>
              <AnomalyAlerts />
            </ProtectedLayout>
          }
        />
        <Route
          path="/repeat-discounts"
          element={
            <ProtectedLayout>
              <RepeatDiscounts />
            </ProtectedLayout>
          }
        />
        <Route
          path="/takers/:id"
          element={
            <ProtectedLayout>
              <TakerDetail />
            </ProtectedLayout>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedLayout>
              <Settings />
            </ProtectedLayout>
          }
        />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>
              <Router>
                <AppRoutes />
              </Router>
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
