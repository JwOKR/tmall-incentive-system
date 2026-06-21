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
        <div className="flex h-16 items-center justify-between px-6 border-b">
          <h1 className="text-xl font-bold text-primary">天猫激励系统</h1>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-md hover:bg-accent"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
        <nav className="p-4 space-y-1 flex-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>
        {/* User info & logout */}
        <div className="border-t p-4 space-y-2">
          <div className="flex items-center gap-3 px-3 py-2 text-sm">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{user?.username || '未知'}</p>
              <p className="text-xs text-muted-foreground">{user?.role === 'admin' ? '管理员' : '普通用户'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            退出登录
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="pl-64">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}