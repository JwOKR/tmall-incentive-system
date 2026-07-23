import { Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6">
        <div className="text-8xl font-bold text-muted-foreground/30">404</div>
        <h1 className="text-2xl font-bold">页面未找到</h1>
        <p className="text-muted-foreground">您访问的页面不存在或已被移除</p>
        <div className="flex items-center justify-center gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-colors"
          >
            <Home className="h-4 w-4" />
            返回首页
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            返回上页
          </button>
        </div>
      </div>
    </div>
  );
}
