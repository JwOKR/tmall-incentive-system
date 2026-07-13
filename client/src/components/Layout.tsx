import { useState, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  ShoppingCart,
  FileText,
  Download,
  Sun,
  Moon,
  LogOut,
  User,
  Sparkles,
  Clock,
  DollarSign,
  Menu,
  X,
  Settings as SettingsIcon,
  AlertTriangle,
  TrendingDown,
  Home,
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';

interface LayoutProps {
  children: ReactNode;
}

// 激励登记模块导航
const incentiveNav = [
  { name: '数据汇总', href: '/dashboard', icon: LayoutDashboard },
  { name: '接单人', href: '/takers', icon: Users },
  { name: '任务', href: '/tasks', icon: ClipboardList },
  { name: '订单明细', href: '/orders', icon: ShoppingCart },
  { name: '接单间隔', href: '/intervals', icon: Clock },
  { name: '佣金分析', href: '/commissions', icon: DollarSign },
  { name: '操作日志', href: '/logs', icon: FileText },
  { name: '异常预警', href: '/anomalies', icon: AlertTriangle },
  { name: '数据导出', href: '/export', icon: Download },
];

// 回头客立减模块导航
const discountNav = [
  { name: '数据录入', href: '/repeat-discounts', icon: TrendingDown },
];

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeSidebar = () => setSidebarOpen(false);

  const isActive = (href: string) => location.pathname === href;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r flex flex-col transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Brand */}
        <div className="flex h-16 items-center justify-between px-6 border-b">
          <Link to="/" onClick={closeSidebar} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 shadow-sm">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">天猫激励系统</h1>
          </Link>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-accent transition-all hover:scale-110 active:scale-95"
              title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={closeSidebar}
              className="p-2 rounded-lg hover:bg-accent transition-colors lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-0.5 flex-1 overflow-y-auto">
          {/* 首页 */}
          <Link
            to="/"
            onClick={closeSidebar}
            className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              location.pathname === '/'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            <Home className="h-5 w-5" />
            首页
          </Link>

          {/* ── 激励登记 ── */}
          <div className="pt-3 pb-1 px-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">激励登记</span>
          </div>
          {incentiveNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={closeSidebar}
                className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary-foreground/80" />
                )}
                <item.icon className={`h-5 w-5 transition-transform ${active ? '' : 'group-hover:scale-110'}`} />
                {item.name}
              </Link>
            );
          })}

          {/* ── 回头客立减 ── */}
          <div className="pt-3 pb-1 px-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">回头客立减</span>
          </div>
          {discountNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={closeSidebar}
                className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary-foreground/80" />
                )}
                <item.icon className={`h-5 w-5 transition-transform ${active ? '' : 'group-hover:scale-110'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User info & logout */}
        <div className="border-t p-3 space-y-1">
          <Link
            to="/settings"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-primary/80 to-primary/60 shrink-0">
              <User className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{user?.username || '未知'}</p>
              <p className="text-xs text-muted-foreground">{user?.role === 'admin' ? '管理员' : '普通用户'}</p>
            </div>
            <SettingsIcon className="h-4 w-4 text-muted-foreground" />
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-all hover:translate-x-0.5"
          >
            <LogOut className="h-5 w-5" />
            退出登录
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-64">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-card/80 backdrop-blur-sm px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-primary/70">
              <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm">天猫激励系统</span>
          </div>
        </div>
        <div className="p-4 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
