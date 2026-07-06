import { ReactNode } from 'react';
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
} from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';

interface LayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: '数据汇总', href: '/', icon: LayoutDashboard },
  { name: '接单人', href: '/takers', icon: Users },
  { name: '任务', href: '/tasks', icon: ClipboardList },
  { name: '订单明细', href: '/orders', icon: ShoppingCart },
  { name: '接单间隔', href: '/intervals', icon: Clock },
  { name: '操作日志', href: '/logs', icon: FileText },
  { name: '数据导出', href: '/export', icon: Download },
];

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-card border-r flex flex-col">
        {/* Brand */}
        <div className="flex h-16 items-center justify-between px-6 border-b">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 shadow-sm">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">天猫激励系统</h1>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-accent transition-all hover:scale-110 active:scale-95"
            title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
        
        {/* Navigation */}
        <nav className="p-3 space-y-0.5 flex-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary-foreground/80" />
                )}
                <item.icon className={`h-5 w-5 transition-transform ${isActive ? '' : 'group-hover:scale-110'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User info & logout */}
        <div className="border-t p-3 space-y-1">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-primary/80 to-primary/60 shrink-0">
              <User className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{user?.username || '未知'}</p>
              <p className="text-xs text-muted-foreground">{user?.role === 'admin' ? '管理员' : '普通用户'}</p>
            </div>
          </div>
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
      <main className="pl-64">
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
