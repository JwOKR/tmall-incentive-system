import type React from 'react';
import { formatDate } from '@/lib/utils';

export interface NewTaskRowData {
  productId: string;
  productCode: string;
  taoToken: string;
  price: string;
  baseCommission: string;
  reviewReward: string;
  maxOrders: string;
  deadline: string;
}

interface NewTaskRowProps {
  newRowData: NewTaskRowData;
  setNewRowData: React.Dispatch<React.SetStateAction<NewTaskRowData>>;
  handleSaveNewRow: () => void;
  createMutation: { isPending: boolean };
  handleCancelNewRow: () => void;
}

export default function NewTaskRow({ newRowData, setNewRowData, handleSaveNewRow, createMutation, handleCancelNewRow }: NewTaskRowProps) {
  return (
    <tr className="border-b bg-indigo-50/50 dark:bg-indigo-950/20">
      <td className="px-4 py-2"></td>
      <td className="px-4 py-2">
        <input
          type="text"
          value={newRowData.productId}
          onChange={(e) => setNewRowData({ ...newRowData, productId: e.target.value })}
          className="w-full rounded border px-2 py-1 text-sm"
          placeholder="商品ID"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="text"
          value={newRowData.productCode}
          onChange={(e) => setNewRowData({ ...newRowData, productCode: e.target.value })}
          className="w-full rounded border px-2 py-1 text-sm"
          placeholder="产品编号"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="text"
          value={newRowData.taoToken}
          onChange={(e) => setNewRowData({ ...newRowData, taoToken: e.target.value })}
          className="w-full rounded border px-2 py-1 text-sm"
          placeholder="淘口令"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          step="0.01"
          value={newRowData.price}
          onChange={(e) => setNewRowData({ ...newRowData, price: e.target.value })}
          className="w-24 rounded border px-2 py-1 text-sm"
          placeholder="价格"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          step="0.01"
          value={newRowData.baseCommission}
          onChange={(e) => setNewRowData({ ...newRowData, baseCommission: e.target.value })}
          className="w-20 rounded border px-2 py-1 text-sm"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          step="0.01"
          value={newRowData.reviewReward}
          onChange={(e) => setNewRowData({ ...newRowData, reviewReward: e.target.value })}
          className="w-20 rounded border px-2 py-1 text-sm"
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="1"
            value={newRowData.maxOrders}
            onChange={(e) => setNewRowData({ ...newRowData, maxOrders: e.target.value })}
            className="w-16 rounded border px-2 py-1 text-sm"
          />
          <span className="text-xs text-muted-foreground">人</span>
        </div>
      </td>
      <td className="px-4 py-2 text-muted-foreground">0人</td>
      <td className="px-4 py-2">
        <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          待接单
        </span>
      </td>
      <td className="px-4 py-2 text-muted-foreground">
        {formatDate(new Date())}
      </td>
      <td className="px-4 py-2">
        <input
          type="date"
          value={newRowData.deadline}
          onChange={(e) => setNewRowData({ ...newRowData, deadline: e.target.value })}
          className="w-full rounded border px-2 py-1 text-sm"
        />
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={handleSaveNewRow}
            disabled={createMutation.isPending}
            className="apple-btn px-3 py-1 bg-indigo-500 text-white rounded-lg text-sm hover:bg-indigo-600 disabled:opacity-50"
          >
            {createMutation.isPending ? '保存中...' : '保存'}
          </button>
          <button
            onClick={handleCancelNewRow}
            className="apple-btn px-3 py-1 border rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            取消
          </button>
        </div>
      </td>
    </tr>
  );
}
