import { useQuery } from '@tanstack/react-query';
import { ordersApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  X,
  ShoppingCart,
  DollarSign,
  User,
  Package,
  Calendar,
  CheckCircle,
  Star,
  AlertCircle,
  ExternalLink,
  Copy,
} from 'lucide-react';
import { useToast } from '@/components/Toast';

interface OrderDrawerProps {
  orderId: string | null;
  onClose: () => void;
}

export default function OrderDrawer({ orderId, onClose }: OrderDrawerProps) {
  const { success: toastSuccess } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['order-detail', orderId],
    queryFn: () => ordersApi.getById(orderId!),
    enabled: !!orderId,
  });

  if (!orderId) return null;

  const order = (data as any)?.data;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toastSuccess('已复制');
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-card border-l shadow-2xl flex flex-col animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            订单详情
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-accent rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                  <div className="h-5 w-full animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : order ? (
            <>
              {/* Status Bar */}
              <div className="flex gap-3">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${order.isRefunded ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                  {order.isRefunded ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  {order.isRefunded ? '已返款' : '待返款'}
                </div>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${order.isGoodReview ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-muted text-muted-foreground'}`}>
                  {order.isGoodReview ? <Star className="h-4 w-4" /> : <Star className="h-4 w-4" />}
                  {order.isGoodReview ? '已好评' : '未好评'}
                </div>
              </div>

              {/* Taker Info */}
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                  <User className="h-4 w-4" /> 接单人信息
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">微信昵称</p>
                    <p className="font-medium">{order.taker?.wechatName || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">微信号</p>
                    <p className="font-medium">{order.taker?.wechatId || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Order Info */}
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                  <Package className="h-4 w-4" /> 订单信息
                </h4>
                <div className="space-y-2">
                  {[
                    { label: '接单日期', value: formatDate(order.orderDate) },
                    { label: '商品ID', value: order.task?.productId || order.productId || '-' },
                    { label: '产品编号', value: order.task?.productCode || order.productCode || '-' },
                    { label: '19订单号', value: order.orderNo19 || '-', copyable: !!order.orderNo19 },
                    { label: '订单编号', value: order.orderNo || '-', copyable: !!order.orderNo },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{item.label}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium">{item.value}</span>
                        {item.copyable && (
                          <button onClick={() => handleCopy(item.value)} className="p-0.5 hover:bg-accent rounded text-muted-foreground">
                            <Copy className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {order.orderLink && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">订单链接</span>
                      <a
                        href={order.orderLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        打开 <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Info */}
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="h-4 w-4" /> 金额信息
                </h4>
                <div className="space-y-2">
                  {[
                    { label: '实付金额', value: formatCurrency(order.actualPayment) },
                    { label: '基础返佣', value: formatCurrency(order.baseCommission), color: 'text-green-600 dark:text-green-400' },
                    { label: '好评返佣', value: formatCurrency(order.reviewCommission), color: 'text-purple-600 dark:text-purple-400' },
                    { label: '总返款', value: formatCurrency(order.totalRefund), color: 'text-blue-600 dark:text-blue-400', bold: true },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{item.label}</span>
                      <span className={`text-sm ${item.bold ? 'font-bold' : 'font-medium'} ${item.color || ''}`}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" /> 时间记录
                </h4>
                <div className="space-y-2">
                  {[
                    { label: '返款日期', value: order.refundDate ? formatDate(order.refundDate) : '-' },
                    { label: '好评返佣日期', value: order.reviewCommissionDate ? formatDate(order.reviewCommissionDate) : '-' },
                    { label: '创建时间', value: formatDate(order.createdAt) },
                    { label: '更新时间', value: formatDate(order.updatedAt) },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{item.label}</span>
                      <span className="text-sm">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Remark */}
              {order.remark && (
                <div className="rounded-lg border p-4">
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2">备注</h4>
                  <p className="text-sm">{order.remark}</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">订单不存在</div>
          )}
        </div>
      </div>
    </>
  );
}
