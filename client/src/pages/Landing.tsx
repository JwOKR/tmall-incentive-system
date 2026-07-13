import { Link } from 'react-router-dom';
import { ClipboardList, TrendingDown, ArrowRight, Sparkles } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">天猫激励系统</h1>
        <p className="text-muted-foreground text-lg">选择要进入的模块</p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl w-full px-4">
        {/* 激励登记 */}
        <Link
          to="/dashboard"
          className="group relative rounded-2xl border bg-card p-8 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-primary/50"
        >
          <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-md mb-5 group-hover:scale-110 transition-transform">
            <ClipboardList className="h-7 w-7 text-white" />
          </div>
          <h2 className="text-xl font-bold mb-2">激励登记</h2>
          <p className="text-muted-foreground text-sm mb-6">
            管理接单人、任务发布、订单明细、佣金统计等激励登记业务
          </p>
          <div className="flex items-center gap-1.5 text-sm font-medium text-primary group-hover:gap-3 transition-all">
            进入模块
            <ArrowRight className="h-4 w-4" />
          </div>
        </Link>

        {/* 回头客立减 */}
        <Link
          to="/repeat-discounts"
          className="group relative rounded-2xl border bg-card p-8 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-orange-500/50"
        >
          <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-md mb-5 group-hover:scale-110 transition-transform">
            <TrendingDown className="h-7 w-7 text-white" />
          </div>
          <h2 className="text-xl font-bold mb-2">回头客立减数据</h2>
          <p className="text-muted-foreground text-sm mb-6">
            录入与查看每日回头客立减数据：发放金额、支付金额、买家数、件数
          </p>
          <div className="flex items-center gap-1.5 text-sm font-medium text-orange-600 dark:text-orange-400 group-hover:gap-3 transition-all">
            进入模块
            <ArrowRight className="h-4 w-4" />
          </div>
        </Link>
      </div>
    </div>
  );
}
