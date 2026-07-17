import { Link } from 'react-router-dom';
import { ClipboardList, TrendingDown, ArrowRight, Sparkles } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center ambient-bg page-enter">
      {/* Hero Header */}
      <div className="text-center mb-14 relative z-10">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 mb-6 animate-fade-in">
          <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">订单管理系统</span>
        </div>
        <h1 className="text-5xl font-bold tracking-tight mb-3">
          天猫<span className="apple-text-title-1">激励系统</span>
        </h1>
        <p className="text-muted-foreground text-lg max-w-md mx-auto">
          选择要进入的模块，开始管理你的业务数据
        </p>
      </div>

      {/* Module Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl w-full px-4 relative z-10">
        {/* 激励登记 */}
        <Link
          to="/dashboard"
          className="group relative overflow-hidden rounded-2xl border bg-card p-7 shadow-sm card-hover stagger-item"
        >
          {/* Decorative gradient orb */}
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-gradient-to-br from-indigo-400/15 to-violet-400/5 blur-2xl group-hover:scale-110 transition-transform duration-500" />

          <div className="relative">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25 mb-5 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
              <ClipboardList className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-xl font-bold mb-2">激励登记</h2>
            <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
              管理接单人、任务发布、订单明细、佣金统计等激励登记业务
            </p>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400 group-hover:gap-3 transition-all duration-300">
              进入模块
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </Link>

        {/* 回头客立减 */}
        <Link
          to="/repeat-discounts"
          className="group relative overflow-hidden rounded-2xl border bg-card p-7 shadow-sm card-hover stagger-item"
          style={{ animationDelay: '60ms' }}
        >
          {/* Decorative gradient orb */}
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-gradient-to-br from-orange-400/15 to-amber-400/5 blur-2xl group-hover:scale-110 transition-transform duration-500" />

          <div className="relative">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 shadow-lg shadow-orange-500/25 mb-5 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
              <TrendingDown className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-xl font-bold mb-2">回头客立减数据</h2>
            <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
              录入与查看每日回头客立减数据：发放金额、支付金额、买家数、件数
            </p>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-orange-600 dark:text-orange-400 group-hover:gap-3 transition-all duration-300">
              进入模块
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
