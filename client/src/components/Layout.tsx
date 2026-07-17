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
import { usePermissions } from '@/lib/permissions';

interface LayoutProps {
  children: ReactNode;
}

// 激励登记模块导航
const incentiveNav = [
  { name: '数据汇总', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { name: '接单人', href: '/takers', icon: Users, module: 'takers' },
  { name: '任务', href: '/tasks', icon: ClipboardList, module: 'tasks' },
  { name: '订单明细', href: '/orders', icon: ShoppingCart, module: 'orders' },
  { name: '接单间隔', href: '/intervals', icon: Clock, module: 'intervals' },
  { name: '佣金分析', href: '/commissions', icon: DollarSign, module: 'commissions' },
  { name: '操作日志', href: '/logs', icon: FileText, module: 'logs' },
  { name: '异常预警', href: '/anomalies', icon: AlertTriangle, module: 'anomalies' },
  { name: '数据导出', href: '/export', icon: Download, module: 'export' },
];

// 回头客立减模块导航
const discountNav = [
  { name: '数据录入', href: '/repeat-discounts', icon: TrendingDown, module: 'repeatDiscounts' },
];

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { canView } = usePermissions();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeSidebar = () => setSidebarOpen(false);

  const isActive = (href: string) => location.pathname === href;

  const navLinkClass = (active: boolean) =>
    `group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
      active
        ? 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-400'
        : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
    }`;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r flex flex-col transition-transform duration-300 ease-[var(--ease-drawer)] lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Brand */}
        <div className="flex h-16 items-center justify-between px-5 border-b">
          <Link to="/" onClick={closeSidebar} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity duration-200">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/25">
              <Sparkles className="h-4.5 w-4.5 text-white" />
            </div>
            <h1 className="text-base font-bold tracking-tight">天猫激励系统</h1>
          </Link>
          <div className="flex items-center gap-0.5">
            <button
              onClick={toggleTheme}
              className="btn-press p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={closeSidebar}
              className="btn-press p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors lg:hidden"
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
            className={navLinkClass(location.pathname === '/')}
          >
            {location.pathname === '/' && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-indigo-500 nav-active-bar" />
            )}
            <Home className="h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110" />
            首页
          </Link>

          {/* 激励登记 */}
          <div className="pt-4 pb-1.5 px-3">
            <span className="section-label">激励登记</span>
          </div>
          {incentiveNav.filter(item => canView(item.module)).map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={closeSidebar}
                className={navLinkClass(active)}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-indigo-500 nav-active-bar" />
                )}
                <item.icon className={`h-[18px] w-[18px] transition-transform duration-200 ${!active && 'group-hover:scale-110'}`} />
                {item.name}
              </Link>
            );
          })}

          {/* 回头客立减 */}
          <div className="pt-4 pb-1.5 px-3">
            <span className="section-label">回头客立减</span>
          </div>
          {discountNav.filter(item => canView(item.module)).map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={closeSidebar}
                className={navLinkClass(active)}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-orange-500 nav-active-bar" />
                )}
                <item.icon className={`h-[18px] w-[18px] transition-transform duration-200 ${!active && 'group-hover:scale-110'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User info & logout */}
        <div className="border-t p-3 space-y-1">
          <Link
            to="/settings"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50/80 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-200"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/80 to-violet-500/60 shrink-0 shadow-sm">
              <User className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{user?.username || '未知'}</p>
              <p className="text-xs text-muted-foreground">{user?.role === 'admin' ? '管理员' : '普通用户'}</p>
            </div>
            <SettingsIcon className="h-4 w-4 text-muted-foreground" />
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all duration-200"
          >
            <LogOut className="h-[18px] w-[18px]" />
            退出登录
          </button>
          {/* Version badge */}
          <div className="px-3 pt-1 pb-0.5 text-center">
            <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums select-none">
              v{__APP_VERSION__} · {__BUILD_TIME__}
            </span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-64">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/80 backdrop-blur-md px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="btn-press p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-bold text-sm">天猫激励系统</span>
          </div>
        </div>
        <div className="p-4 lg:p-8 page-enter">
          {children}
        </div>
      </main>
    </div>
  );
}
