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
  Search,
  Bell,
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

export default function AppleLayout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { canView } = usePermissions();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeSidebar = () => setSidebarOpen(false);

  const isActive = (href: string) => location.pathname === href;

  const navLinkClass = (active: boolean) =>
    `apple-nav-item ${active ? 'apple-nav-item-active' : ''}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Apple-style Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-card border-r flex flex-col transition-transform duration-300 ease-[var(--apple-ease-out)] lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Brand */}
        <div className="flex h-18 items-center justify-between px-6 border-b">
          <Link to="/" onClick={closeSidebar} className="flex items-center gap-3 hover:opacity-80 transition-opacity duration-200">
            <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="apple-text-headline font-bold tracking-tight">天猫激励系统</h1>
              <p className="apple-text-caption-1 text-muted-foreground">订单数据管理</p>
            </div>
          </Link>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="apple-btn apple-btn-ghost p-2 rounded-xl"
              title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              onClick={closeSidebar}
              className="apple-btn apple-btn-ghost p-2 rounded-xl lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-4 py-3">
          <div className="apple-search">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="搜索功能..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="apple-search-input"
            />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
          {/* 首页 */}
          <Link
            to="/"
            onClick={closeSidebar}
            className={navLinkClass(location.pathname === '/')}
          >
            <Home className="h-5 w-5" />
            首页
          </Link>

          {/* 激励登记 */}
          <div className="pt-6 pb-2 px-3">
            <span className="apple-text-caption-1 font-semibold uppercase tracking-wider text-muted-foreground">激励登记</span>
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
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}

          {/* 回头客立减 */}
          <div className="pt-6 pb-2 px-3">
            <span className="apple-text-caption-1 font-semibold uppercase tracking-wider text-muted-foreground">回头客立减</span>
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
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User info & logout */}
        <div className="border-t p-4 space-y-2">
          <Link
            to="/settings"
            className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-200 apple-card"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500/80 to-violet-500/60 shrink-0 shadow-sm">
              <User className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="apple-text-headline truncate">{user?.username || '未知'}</p>
              <p className="apple-text-footnote text-muted-foreground">{user?.role === 'admin' ? '管理员' : '普通用户'}</p>
            </div>
            <SettingsIcon className="h-5 w-5 text-muted-foreground" />
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all duration-200 apple-btn apple-btn-ghost"
          >
            <LogOut className="h-5 w-5" />
            退出登录
          </button>
          {/* Version badge */}
          <div className="px-4 pt-2 pb-1 text-center">
            <span className="apple-text-caption-2 text-muted-foreground/50 font-mono tabular-nums select-none">
              v{__APP_VERSION__} · {__BUILD_TIME__}
            </span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-72">
        {/* Apple-style Top Bar */}
        <div className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-card/80 backdrop-blur-md px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="apple-btn apple-btn-ghost p-2 rounded-xl lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden lg:flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="apple-text-headline font-bold">天猫激励系统</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Notifications */}
            <button className="apple-btn apple-btn-ghost p-2 rounded-xl relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full"></span>
            </button>
            
            {/* User Avatar */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/80 to-violet-500/60 flex items-center justify-center">
                <User className="h-4 w-4 text-white" />
              </div>
              <div className="hidden sm:block">
                <p className="apple-text-footnote font-medium">{user?.username || '未知'}</p>
                <p className="apple-text-caption-2 text-muted-foreground">{user?.role === 'admin' ? '管理员' : '普通用户'}</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-6 lg:p-8 page-enter">
          {children}
        </div>
      </main>
    </div>
  );
}