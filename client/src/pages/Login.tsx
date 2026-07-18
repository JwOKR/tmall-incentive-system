import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, LogIn, Loader2, User, Lock, Sparkles } from 'lucide-react';
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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* 背景渐变 */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-indigo-50 to-violet-100 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950" />
      
      {/* 装饰性背景元素 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* 大光斑 */}
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-indigo-400/20 dark:bg-indigo-500/10 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-violet-400/20 dark:bg-violet-500/10 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-400/10 dark:bg-blue-500/5 rounded-full blur-[120px]" />
        
        {/* 网格装饰 */}
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }} />
      </div>

      {/* 主题切换 */}
      <button
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-3 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-slate-200/50 dark:border-slate-700/50 hover:bg-white dark:hover:bg-slate-800 transition-all duration-300 shadow-lg shadow-slate-900/5 dark:shadow-slate-900/20 hover:scale-105 active:scale-95 z-10"
        title="切换主题"
      >
        {theme === 'dark' ? <Sun className="h-5 w-5 text-amber-500" /> : <Moon className="h-5 w-5 text-indigo-600" />}
      </button>

      {/* 登录卡片 */}
      <div className="relative w-full max-w-md mx-4">
        {/* 卡片阴影层 */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 rounded-3xl blur-2xl transform translate-y-4 scale-95" />
        
        {/* 主卡片 */}
        <div className="relative bg-white/90 dark:bg-slate-900/90 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-slate-900/10 dark:shadow-slate-900/30 border border-white/50 dark:border-slate-700/50 overflow-hidden animate-fade-up">
          {/* 顶部装饰条 */}
          <div className="h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />
          
          {/* 头部 */}
          <div className="px-10 pt-12 pb-8 text-center">
            {/* Logo */}
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 mb-6 shadow-xl shadow-indigo-500/30 transform hover:scale-105 transition-transform duration-300">
              <Sparkles className="h-10 w-10 text-white" />
            </div>
            
            <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400 bg-clip-text text-transparent">
              天猫激励系统
            </h1>
            <p className="text-sm text-muted-foreground mt-3">
              请登录以继续使用
            </p>
          </div>

          {/* 表单 */}
          <form onSubmit={handleSubmit} className="px-10 pb-10 space-y-6">
            {/* 错误提示 */}
            {error && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 px-4 py-3 text-sm text-rose-600 dark:text-rose-400 flex items-center gap-2 animate-fade-in">
                <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                {error}
              </div>
            )}

            {/* 用户名输入 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                用户名
              </label>
              <div className="relative group">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入用户名"
                  autoComplete="username"
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 pl-11 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200 placeholder:text-muted-foreground/50"
                />
                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-indigo-500 transition-colors" />
              </div>
            </div>

            {/* 密码输入 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                密码
              </label>
              <div className="relative group">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSubmit(e);
                  }}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 pl-11 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all duration-200 placeholder:text-muted-foreground/50"
                />
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-indigo-500 transition-colors" />
              </div>
            </div>

            {/* 登录按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:from-indigo-600 hover:to-violet-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  登录中...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  登录
                </>
              )}
            </button>

            {/* 底部信息 */}
            <div className="text-center pt-2">
              <p className="text-xs text-muted-foreground/60">
                天猫激励订单管理系统
              </p>
            </div>
          </form>
        </div>
      </div>

      {/* 底部装饰 */}
      <div className="absolute bottom-6 left-0 right-0 text-center">
        <p className="text-xs text-muted-foreground/40">
          Powered by Tmall Incentive System
        </p>
      </div>
    </div>
  );
}
