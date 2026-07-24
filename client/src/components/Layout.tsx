import { useState, ReactNode, useEffect, useCallback } from 'react';
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
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/lib/permissions';
import { ConfirmProvider } from './ConfirmDialog';

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // 键盘快捷键：[ 键折叠/展开侧边栏
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // 确保不在输入框中
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          setSidebarCollapsed(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeSidebar = () => setSidebarOpen(false);

  const isActive = (href: string) => location.pathname === href;

  // 过滤搜索结果
  const filteredIncentiveNav = incentiveNav.filter(item => {
    if (!canView(item.module)) return false;
    if (!searchQuery) return true;
    return item.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const filteredDiscountNav = discountNav.filter(item => {
    if (!canView(item.module)) return false;
    if (!searchQuery) return true;
    return item.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const navLinkClass = (active: boolean, collapsed: boolean) =>
    `group relative flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 ${
      collapsed ? 'justify-center px-3 py-3' : 'px-3 py-2.5'
    } ${
      active
        ? 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-400'
        : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
    }`;

  return (
    <ConfirmProvider>
    <div className="min-h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="drawer-overlay lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Apple-style Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-card border-r flex flex-col transition-all duration-300 ease-[var(--apple-ease-out)] lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${sidebarCollapsed ? 'w-20' : 'w-72'}`}
      >
        {/* Brand */}
        <div className={`flex h-16 items-center justify-between border-b ${sidebarCollapsed ? 'px-4' : 'px-5'}`}>
          <Link
            to="/"
            onClick={closeSidebar}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity duration-200"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25 shrink-0">
              <Sparkles className="h-4.5 w-4.5 text-white" />
            </div>
            {!sidebarCollapsed && (
              <div className="overflow-hidden">
                <h1 className="text-base font-bold tracking-tight whitespace-nowrap">天猫激励系统</h1>
                <p className="text-[10px] text-muted-foreground whitespace-nowrap">订单数据管理</p>
              </div>
            )}
          </Link>
          <div className="flex items-center gap-0.5">
            {!sidebarCollapsed && (
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors hidden lg:flex"
              title={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={closeSidebar}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search Bar - 只在展开状态显示 */}
        {!sidebarCollapsed && (
          <div className="px-3 py-2.5">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
              searchFocused
                ? 'bg-white dark:bg-slate-800 ring-2 ring-indigo-500/20'
                : 'bg-slate-100/80 dark:bg-slate-800/40'
            }`}>
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="搜索功能..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* 折叠状态的主题切换 */}
        {sidebarCollapsed && (
          <div className="flex justify-center py-2.5">
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-0.5">
          {/* 首页 */}
          <Link
            to="/"
            onClick={closeSidebar}
            className={navLinkClass(location.pathname === '/', sidebarCollapsed)}
            title={sidebarCollapsed ? '首页' : undefined}
          >
            {location.pathname === '/' && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-indigo-500 nav-active-bar" />
            )}
            <Home className="h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" />
            {!sidebarCollapsed && <span>首页</span>}
          </Link>

          {/* 激励登记 */}
          {!sidebarCollapsed && (
            <div className="pt-5 pb-1.5 px-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                激励登记
              </span>
            </div>
          )}
          {sidebarCollapsed && <div className="h-px bg-border mx-2 my-3" />}
          
          {filteredIncentiveNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={closeSidebar}
                className={navLinkClass(active, sidebarCollapsed)}
                title={sidebarCollapsed ? item.name : undefined}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-indigo-500 nav-active-bar" />
                )}
                <item.icon className={`h-[18px] w-[18px] shrink-0 transition-transform duration-200 ${!active && 'group-hover:scale-110'}`} />
                {!sidebarCollapsed && <span>{item.name}</span>}
              </Link>
            );
          })}

          {/* 回头客立减 */}
          {!sidebarCollapsed && (
            <div className="pt-5 pb-1.5 px-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                回头客立减
              </span>
            </div>
          )}
          {sidebarCollapsed && <div className="h-px bg-border mx-2 my-3" />}
          
          {filteredDiscountNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={closeSidebar}
                className={navLinkClass(active, sidebarCollapsed)}
                title={sidebarCollapsed ? item.name : undefined}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-orange-500 nav-active-bar" />
                )}
                <item.icon className={`h-[18px] w-[18px] shrink-0 transition-transform duration-200 ${!active && 'group-hover:scale-110'}`} />
                {!sidebarCollapsed && <span>{item.name}</span>}
              </Link>
            );
          })}

          {/* 搜索无结果提示 */}
          {searchQuery && filteredIncentiveNav.length === 0 && filteredDiscountNav.length === 0 && (
            <div className="px-3 py-8 text-center">
              <Search className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">未找到匹配的功能</p>
            </div>
          )}
        </nav>

        {/* User info & logout */}
        <div className={`border-t p-3 space-y-1.5 ${sidebarCollapsed ? 'px-2' : ''}`}>
          <Link
            to="/settings"
            className={`flex items-center gap-3 rounded-xl transition-colors duration-200 hover:bg-slate-100 dark:hover:bg-slate-800 ${
              sidebarCollapsed ? 'justify-center p-3' : 'px-3 py-2.5'
            }`}
            title={sidebarCollapsed ? (user?.username || '未知') : undefined}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/80 to-violet-500/60 shrink-0 shadow-sm">
              <User className="h-4 w-4 text-white" />
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.username || '未知'}</p>
                <p className="text-[10px] text-muted-foreground">{user?.role === 'admin' ? '管理员' : '普通用户'}</p>
              </div>
            )}
            {!sidebarCollapsed && <SettingsIcon className="h-4 w-4 text-muted-foreground shrink-0" />}
          </Link>
          
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 rounded-xl text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all duration-200 ${
              sidebarCollapsed ? 'justify-center p-3' : 'px-3 py-2.5'
            }`}
            title={sidebarCollapsed ? '退出登录' : undefined}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            {!sidebarCollapsed && <span>退出登录</span>}
          </button>
          
          {/* Version badge */}
          {!sidebarCollapsed && (
            <div className="px-3 pt-1 pb-0.5 text-center">
              <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums select-none">
                v{__APP_VERSION__} · {__BUILD_TIME__}
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className={`transition-all duration-300 ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72'}`}>
        {/* Apple-style Top Bar */}
        <div className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b bg-card/80 backdrop-blur-md px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden lg:flex items-center gap-2.5">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="font-semibold text-sm">天猫激励系统</span>
            </div>
            {/* 面包屑导航 */}
            <div className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>/</span>
              <span className="text-foreground font-medium">
                {location.pathname === '/' 
                  ? '首页' 
                  : [...incentiveNav, ...discountNav].find(item => item.href === location.pathname)?.name || '页面'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* 快捷键提示 */}
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100/80 dark:bg-slate-800/40 text-[10px] text-muted-foreground">
              <kbd className="px-1 py-0.5 rounded bg-white dark:bg-slate-700 font-mono">[</kbd>
              <span>折叠侧边栏</span>
            </div>
            
            {/* Notifications */}
            <Link
              to="/logs"
              className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="操作日志"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white dark:ring-slate-900" />
            </Link>
            
            {/* User Avatar */}
            <Link
              to="/settings"
              className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="个人设置"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500/80 to-violet-500/60 flex items-center justify-center">
                <User className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-medium">{user?.username || '未知'}</p>
                <p className="text-[10px] text-muted-foreground">{user?.role === 'admin' ? '管理员' : '普通用户'}</p>
              </div>
            </Link>
          </div>
        </div>
        
        <div className="p-4 lg:p-6 page-enter">
          {children}
        </div>
      </main>
    </div>
    </ConfirmProvider>
  );
}