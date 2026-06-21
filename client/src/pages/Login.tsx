import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, LogIn, Loader2 } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }

    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '登录失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-1/4 -right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      {/* 主题切换 */}
      <button
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-3 rounded-full bg-card/80 backdrop-blur-sm border border-border hover:bg-accent transition-all shadow-sm z-10"
        title="切换主题"
      >
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      {/* 登录卡片 */}
      <div className="relative w-full max-w-md mx-4">
        <div className="bg-card/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-border/50 overflow-hidden">
          {/* 头部 */}
          <div className="px-8 pt-10 pb-6 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <LogIn className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">天猫激励系统</h1>
            <p className="text-sm text-muted-foreground mt-2">请登录以继续使用</p>
          </div>

          {/* 表单 */}
          <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5">
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                autoComplete="username"
                autoFocus
                className="w-full rounded-lg border border-input bg-background/50 px-4 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit(e);
                }}
                className="w-full rounded-lg border border-input bg-background/50 px-4 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  登录中...
                </>
              ) : (
                '登录'
              )}
            </button>

            <p className="text-center text-xs text-muted-foreground pt-2">
              默认账户: admin / admin123
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
