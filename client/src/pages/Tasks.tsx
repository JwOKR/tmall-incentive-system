import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi, takersApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Plus, RefreshCw } from 'lucide-react';
import ExportDialog from '@/components/ExportDialog';
import ImportDialog from '@/components/ImportDialog';
import { filterData } from '@/components/ColumnFilter';
import { useToast } from '@/components/Toast';
import { BatchFormModal, TaskBatchActions } from '@/components/tasks/TaskBatchPanels';
import { TaskFilters, TaskPagination } from '@/components/tasks/TaskFilters';
import NewTaskRow from '@/components/tasks/NewTaskRow';
import TaskRow from '@/components/tasks/TaskRow';
import TaskTableHead from '@/components/tasks/TaskTableHead';
import { renderTaskDeadlineCell, renderTaskEditableCell, renderTaskStatusSelect, renderTaskTaoTokenCell } from '@/components/tasks/TaskCells';
import { PREVIEW_SAFE_MARGIN, type EditingCell } from '@/lib/taskPreview';

import { useConfirm } from '@/components/ConfirmDialog';
import { taskColumns } from '@/lib/export';
import { copyToClipboard } from '@/lib/clipboard';
import {
  COMPLIANCE_META,
  describeComplianceReason,
  isTakerOrderable,
  type ComplianceStatus,
  type TakerCompliance,
} from '@/lib/takerConstants';

export default function Tasks() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [inlineOrderId, setInlineOrderId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [selectedTaker, setSelectedTaker] = useState('');
  const [takerSearch, setTakerSearch] = useState('');
  // 接单人下拉的搜索词做 300ms 防抖（与列表搜索同一套手法），避免每敲一个字就打一次接口
  const debouncedTakerSearch = useDebouncedValue(takerSearch, 300);
  // ⚠️ takerSearch 同时承载「已选中接单人」的显示文本 —— 选中后会被写成「昵称（微信号）」这种含
  //    全角括号的文本，若直接当作搜索词去查后端，必然零结果、下次打开下拉框一片空白。
  //    因此：已选中接单人、或输入框已被清空时，都不带关键词（只拉默认列表）。
  const takerQuery = selectedTaker || !takerSearch.trim() ? '' : debouncedTakerSearch;
  const [showTakerDropdown, setShowTakerDropdown] = useState(false);
  // 下拉里只展示资质合格的接单人（默认关闭：不合格的仍会列出，但置灰不可选）
  const [onlyQualifiedTaker, setOnlyQualifiedTaker] = useState(false);
  const [quickOrderForm, setQuickOrderForm] = useState({ orderNo: '', orderNo19: '', actualPayment: '' });
  const takerDropdownRef = useRef<HTMLDivElement>(null);
  // 接单人下拉实测定位所需：锚点（输入框外层）与面板本体
  const takerAnchorRef = useRef<HTMLDivElement>(null);
  const takerPanelRef = useRef<HTMLDivElement>(null);
  const [takerPanelStyle, setTakerPanelStyle] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
    visibility: 'visible' | 'hidden';
  }>({ left: 0, top: 0, width: 224, maxHeight: 240, visibility: 'hidden' });

  /**
   * 实测计算接单人下拉面板的位置。
   * 面板 portal 到 body 后用 fixed 定位，必须自己算坐标：
   * 下方空间不足就翻到上方，并把 maxHeight 压进可用空间，保证整块落在视口内。
   */
  const layoutTakerPanel = useCallback(() => {
    const anchorEl = takerAnchorRef.current;
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const margin = PREVIEW_SAFE_MARGIN;
    const gap = 4;

    const width = Math.max(160, Math.min(rect.width, viewportWidth - margin * 2));
    let left = rect.left;
    if (left + width > viewportWidth - margin) {
      left = viewportWidth - margin - width;
    }
    left = Math.max(margin, left);

    const spaceBelow = viewportHeight - margin - (rect.bottom + gap);
    const spaceAbove = rect.top - gap - margin;
    // 优先向下展开（下方足够宽敞时）；否则翻到空间更大的一侧。
    // ⚠️ maxHeight 绝不能设下限：下边距 = spaceBelow + margin − maxHeight，
    // 一旦给 maxHeight 兜一个大于该侧可用空间的最小值（原写法兜 120），
    // 面板就会越过视口边缘 —— 视口很矮时（底部停靠 DevTools 很容易压到 ~280px）
    // 面板宁可矮一点，也绝不能溢出。
    const expandBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(0, Math.min(240, expandBelow ? spaceBelow : spaceAbove));
    const top = expandBelow
      ? rect.bottom + gap
      : Math.max(margin, rect.top - gap - maxHeight);

    setTakerPanelStyle({ left, top, width, maxHeight, visibility: 'visible' });
  }, []);

  const batchFormModalRef = useRef<HTMLDivElement>(null);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchProductCodes, setBatchProductCodes] = useState('');
  const [addingNewRow, setAddingNewRow] = useState(false);
  const [newRowData, setNewRowData] = useState({
    productId: '',
    productCode: '',
    taoToken: '',
    price: '',
    baseCommission: '5',
    reviewReward: '0',
    maxOrders: '1',
    deadline: '',
  });
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState<any>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', page, debouncedSearch, statusFilter],
    queryFn: () => tasksApi.getAll({ page, pageSize: 20, search: debouncedSearch, status: statusFilter }),
  });

  // 交给服务端做关键词匹配（后端同时支持微信昵称 / 微信号 / 淘宝昵称），
  // 避免原来「只取最新 100 条再在前端过滤」导致早期接单人永远搜不到的问题
  // 页大小：带关键词时 50 条足够定位；不带关键词（纯翻着挑人）时维持改动前的 100 条，
  // 否则无翻页入口的下拉会白白少掉一半可浏览的人
  const { data: takersData, isFetching: takersLoading } = useQuery({
    queryKey: ['takers-list', takerQuery],
    queryFn: () => takersApi.getAll({ search: takerQuery || undefined, pageSize: takerQuery ? 50 : 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: tasksApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setAddingNewRow(false);
      resetNewRow();
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message || '创建任务失败');
    },
  });

  const batchCreateMutation = useMutation({
    mutationFn: (tasks: any[]) => tasksApi.batchCreate(tasks),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setShowBatchForm(false);
      setBatchProductCodes('');
      toastSuccess(data?.message || '批量创建成功');
    },
    onError: () => {
      toastError('批量创建失败');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => tasksApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message || '更新任务失败');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: tasksApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toastSuccess('删除成功');
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message || '删除任务失败');
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map(id => tasksApi.delete(id)));
      const success = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      return { success, failed };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setSelectedIds(new Set());
      toastSuccess(`批量删除完成: 成功${result.success}条${result.failed > 0 ? `，失败${result.failed}条` : ''}`);
    },
    onError: () => {
      toastError('批量删除失败');
    },
  });

  const quickOrderMutation = useMutation({
    mutationFn: tasksApi.quickOrder,
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      // 在清空 selectedTask 之前获取淘口令，接单成功后自动复制到剪贴板
      const taoToken = selectedTask?.taoToken;
      setInlineOrderId(null);
      setSelectedTask(null);
      setSelectedTaker('');
      setTakerSearch('');
      setShowTakerDropdown(false);
      setQuickOrderForm({ orderNo: '', orderNo19: '', actualPayment: '' });
      if (taoToken) {
        copyToClipboard(taoToken).then((success) => {
          toastSuccess(success ? '接单成功，淘口令已自动复制' : (data?.message || '接单成功'));
        });
      } else {
        toastSuccess(data?.message || '接单成功');
      }
    },
    onError: async (error: any) => {
      const errorData = error?.response?.data;
      const message = errorData?.message || '接单失败';
      const code = errorData?.code;
      
      // 账号资质不合格：服务端已拦截，直接提示原因，不提供「强制接单」（force 对资质无效）
      if (code === 'TAKER_NOT_QUALIFIED') {
        toastError(message);
        return;
      }

      // 如果是7天间隔限制，显示二次确认
      if (code === 'INTERVAL_LIMIT') {
        const confirmed = await confirm({ message: `${message}\n\n是否强制接单？`, variant: 'warning', confirmText: '强制接单' });
        if (confirmed) {
          handleConfirmQuickOrder(true);
          return;
        }
      } else {
        toastError(message);
      }
    },
  });

  const refreshStatusMutation = useMutation({
    mutationFn: tasksApi.refreshStatus,
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toastSuccess(data?.message || '任务状态已更新');
    },
    onError: () => {
      toastError('更新任务状态失败');
    },
  });

  useEffect(() => {
    if (editingCell) {
      if (inputRef.current) inputRef.current.focus();
      if (selectRef.current) selectRef.current.focus();
    }
  }, [editingCell]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // 下拉面板已 portal 到 body，不再是 takerDropdownRef 的 DOM 后代，
      // 因此点面板内部也要算「点内部」，否则点选项/复选框会被误判成点外部而提前关闭
      const inTrigger = !!takerDropdownRef.current && takerDropdownRef.current.contains(e.target as Node);
      const inPanel = !!takerPanelRef.current && takerPanelRef.current.contains(e.target as Node);
      if (!inTrigger && !inPanel) {
        setShowTakerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 下拉面板 portal 到 body 后用 fixed 定位，页面/表格滚动或窗口尺寸变化时
  // 需重新贴合锚点，否则会停在原地脱离输入框
  useLayoutEffect(() => {
    if (!showTakerDropdown) return;
    layoutTakerPanel();
    const reposition = () => layoutTakerPanel();
    window.addEventListener('resize', reposition);
    // capture=true：同时捕获表格容器等内部滚动容器的滚动
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [showTakerDropdown, layoutTakerPanel]);



  useEffect(() => {
    if (showBatchForm && batchFormModalRef.current) {
      batchFormModalRef.current.focus();
    }
  }, [showBatchForm]);

  const tasks = (data as any)?.data?.list || [];
  const total = (data as any)?.data?.total || 0;
  const takers = (takersData as any)?.data?.list || [];
  // 服务端返回的「匹配总数」，用于在列表被 pageSize 截断时给出「还有更多」提示
  const takersTotal = Number((takersData as any)?.data?.total ?? takers.length) || 0;
  // 下拉展示列表：关键词匹配已由服务端完成，这里只保留「只看可接单（资质合格）」这一客户端过滤
  const takerOptions = takers.filter((t: any) =>
    onlyQualifiedTaker ? isTakerOrderable((t.compliance ?? null) as TakerCompliance | null) : true
  );

  const handleCellClick = (taskId: string, field: string, currentValue: any) => {
    if (editingCell?.taskId === taskId && editingCell?.field === field) return;
    setEditingCell({ taskId, field });
    setEditValue(String(currentValue || ''));
  };

  const handleSave = (taskId: string) => {
    if (!editingCell) return;
    const { field } = editingCell;
    let value = editValue;
    
    // 检查商品ID和淘口令重复
    if (field === 'productId' || field === 'taoToken') {
      const trimmed = String(value).trim();
      if (trimmed) {
        const duplicate = tasks.find((t: any) => t.id !== taskId && t[field] === trimmed);
        if (duplicate) {
          toastError(`${field === 'productId' ? '商品ID' : '淘口令'} "${trimmed}" 已存在于其他任务中`);
          return;
        }
      }
    }
    
    if (['price', 'baseCommission', 'reviewReward'].includes(field)) {
      value = Number(value) || 0;
    } else if (field === 'maxOrders') {
      value = Math.max(0, Math.floor(Number(value) || 0));
    }
    
    updateMutation.mutate({ id: taskId, data: { [field]: value } });
    setEditingCell(null);
    setEditValue('');
  };

  const handleCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent, taskId: string) => {
    if (e.key === 'Enter') {
      handleSave(taskId);
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleSelectChange = (taskId: string, field: string, value: string) => {
    updateMutation.mutate({ id: taskId, data: { [field]: value } });
    setEditingCell(null);
  };

  const isEditing = (taskId: string, field: string) => {
    return editingCell?.taskId === taskId && editingCell?.field === field;
  };

  const renderEditableCell = (task: any, field: string, type: 'text' | 'number' | 'integer' = 'text') =>
    renderTaskEditableCell(task, field, type, {
      isEditing,
      inputRef,
      editValue,
      setEditValue,
      handleSave,
      handleKeyDown,
      handleCellClick,
    });

  const renderStatusSelect = (task: any) =>
    renderTaskStatusSelect(task, {
      isEditing,
      selectRef,
      editValue,
      handleSelectChange,
      handleCellClick,
      setEditingCell,
      handleCancel,
    });

  const resetNewRow = () => {
    setNewRowData({
      productId: '',
      productCode: '',
      taoToken: '',
      price: '',
      baseCommission: '5',
      reviewReward: '0',
      maxOrders: '1',
      deadline: '',
    });
  };

  const handleAddNewRow = () => {
    setAddingNewRow(true);
    resetNewRow();
  };

  const handleSaveNewRow = () => {
    createMutation.mutate(newRowData);
  };

  const handleCancelNewRow = () => {
    setAddingNewRow(false);
    resetNewRow();
  };

  const handleDelete = async (taskId: string) => {
    if (await confirm({ message: '确定要删除这个任务吗？注意：如果任务有关联订单，将无法删除。', variant: 'danger', confirmText: '删除' })) {
      deleteMutation.mutate(taskId);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredTasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTasks.map((t: any) => t.id)));
    }
  };

  const handleSelectOne = (taskId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedIds(newSelected);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) {
      toastError('请先选择要删除的任务');
      return;
    }
    if (await confirm({ message: `确定要删除选中的 ${selectedIds.size} 个任务吗？删除后关联的订单也会被删除。此操作不可恢复！`, variant: 'danger', confirmText: '删除' })) {
      batchDeleteMutation.mutate(Array.from(selectedIds));
    }
  };

  const handleBatchCreate = () => {
    const codes = batchProductCodes.split(/[\s,，、;；]+/).filter(code => code.trim());
    if (codes.length === 0) {
      toastError('请输入商品编号');
      return;
    }
    
    // 检查批量输入中的重复
    const uniqueCodes = new Set<string>();
    const duplicateCodes: string[] = [];
    for (const code of codes) {
      const trimmed = code.trim();
      if (uniqueCodes.has(trimmed)) {
        duplicateCodes.push(trimmed);
      } else {
        uniqueCodes.add(trimmed);
      }
    }
    if (duplicateCodes.length > 0) {
      toastError(`输入中有重复的商品编号: ${duplicateCodes.join(', ')}`);
      return;
    }
    
    // 检查与已有任务的重复
    const existingIds = new Set(tasks.map((t: any) => t.productId).filter(Boolean));
    const existingCodes = new Set(tasks.map((t: any) => t.productCode).filter(Boolean));
    const duplicates = codes.filter(code => {
      const trimmed = code.trim();
      return existingIds.has(trimmed) || existingCodes.has(trimmed);
    });
    if (duplicates.length > 0) {
      toastError(`以下商品编号已存在: ${duplicates.join(', ')}`);
      return;
    }
    
    const newTasks = codes.map(code => ({
      productId: code.trim(),
      productCode: code.trim(),
      taoToken: '',
      price: 0,
      baseCommission: 5,
      reviewReward: 0,
      maxOrders: 1,
    }));
    
    batchCreateMutation.mutate(newTasks);
  };

  const handleQuickOrder = (task: any) => {
    setSelectedTask(task);
    setInlineOrderId(task.id);
    setTakerSearch('');
    setSelectedTaker('');
    setShowTakerDropdown(false);
    setQuickOrderForm({ orderNo: '', orderNo19: '', actualPayment: '' });
  };

  const handleConfirmQuickOrder = (force = false) => {
    if (!selectedTaker) {
      toastError('请选择接单人');
      return;
    }
    quickOrderMutation.mutate({
      taskId: selectedTask.id,
      takerId: selectedTaker,
      orderNo: quickOrderForm.orderNo || undefined,
      orderNo19: quickOrderForm.orderNo19 || undefined,
      actualPayment: quickOrderForm.actualPayment !== '' ? Number(quickOrderForm.actualPayment) : undefined,
      force,
    });
  };

  const handleCopyTaoToken = (taoToken: string) => {
    copyToClipboard(taoToken).then((success) => {
      if (success) {
        toastSuccess('淘口令已复制');
      } else {
        toastError('复制失败，请手动复制');
      }
    });
  };

  const renderTaoTokenCell = (task: any) =>
    renderTaskTaoTokenCell(task, {
      isEditing,
      inputRef,
      editValue,
      setEditValue,
      handleSave,
      handleKeyDown,
      handleCellClick,
      handleCopyTaoToken,
    });

  const filteredTasks = useMemo(() => {
    return filterData(tasks, columnFilters, (item: any, key: string) => {
      if (key === 'publishDate') return item.publishDate ? formatDate(item.publishDate) : '';
      return String(item[key] ?? '');
    });
  }, [tasks, columnFilters]);

  const setColFilter = (key: string, value: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  };

  // ── P2-5 任务超时提醒 ──────────────────────────────────────
  const renderDeadlineCell = (task: any) =>
    renderTaskDeadlineCell(task, {
      isEditing,
      inputRef,
      editValue,
      setEditValue,
      handleSave,
      handleKeyDown,
      setEditingCell,
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">任务管理</h2>
          <p className="text-muted-foreground mt-1">点击单元格直接编辑，按 Enter 保存</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDialog
            title="导出任务数据"
            filename="任务数据"
            columns={taskColumns}
            data={tasks}
            buttonLabel="导出"
            fetchData={async () => {
              const res: any = await tasksApi.getAll({ pageSize: 99999, search, status: statusFilter });
              return res?.data?.list || [];
            }}
          />
          <ImportDialog
            title="导入任务数据"
            templateFilename="任务导入模板"
            columns={[
              { key: 'publishDate', label: '发布日期' },
              { key: 'productId', label: '商品ID', required: true },
              { key: 'productCode', label: '产品编号', required: true },
              { key: 'taoToken', label: '淘口令' },
              { key: 'price', label: '商品价格' },
              { key: 'baseCommission', label: '基础返佣' },
              { key: 'reviewReward', label: '好评返佣' },
              { key: 'maxOrders', label: '限接人数' },
              { key: 'deadline', label: '截止日期' },
            ]}
            onImport={async (data) => {
              try {
                const result = await tasksApi.batchCreate(data);
                queryClient.invalidateQueries({ queryKey: ['tasks'] });
                return result.data || { success: data.length, failed: 0, duplicates: 0 };
              } catch (error: any) {
                console.error('Import error:', error);
                const errorMessage = error?.response?.data?.message || error?.message || '导入失败';
                toastError(errorMessage);
                return { success: 0, failed: data.length, duplicates: 0 };
              }
            }}
            buttonLabel="导入"
          />
          <button
            onClick={() => setShowBatchForm(true)}
            className="apple-btn apple-btn inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 transition-colors shadow-md shadow-indigo-500/20"
          >
            <Plus className="h-4 w-4" />
            批量新增
          </button>
          <button
            onClick={handleAddNewRow}
            className="apple-btn apple-btn inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600 transition-colors shadow-md shadow-violet-500/20"
          >
            <Plus className="h-4 w-4" />
            新增任务
          </button>
          <button
            onClick={() => refreshStatusMutation.mutate()}
            disabled={refreshStatusMutation.isPending}
            className="apple-btn apple-btn inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors shadow-md shadow-amber-500/20 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshStatusMutation.isPending ? 'animate-spin' : ''}`} />
            {refreshStatusMutation.isPending ? '更新中...' : '刷新状态'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <TaskFilters search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} />

      {/* Batch Form Modal */}
      {showBatchForm && (
        <BatchFormModal
          setShowBatchForm={setShowBatchForm}
          setBatchProductCodes={setBatchProductCodes}
          batchFormModalRef={batchFormModalRef}
          batchProductCodes={batchProductCodes}
          handleBatchCreate={handleBatchCreate}
          batchCreateMutation={batchCreateMutation}
        />
      )}

      {/* Batch Actions */}
      {selectedIds.size > 0 && (
        <TaskBatchActions
          selectedIds={selectedIds}
          handleBatchDelete={handleBatchDelete}
          batchDeleteMutation={batchDeleteMutation}
          setSelectedIds={setSelectedIds}
        />
      )}

      {/* Table */}
      <div className="rounded-2xl border bg-card shadow-sm overflow-x-auto apple-card">
        <table className="w-full">
          <TaskTableHead
            selectedIds={selectedIds}
            filteredTasks={filteredTasks}
            handleSelectAll={handleSelectAll}
            columnFilters={columnFilters}
            setColFilter={setColFilter}
          />
          <tbody>
            {/* New Row */}
            {addingNewRow && (
              <NewTaskRow
                newRowData={newRowData}
                setNewRowData={setNewRowData}
                handleSaveNewRow={handleSaveNewRow}
                createMutation={createMutation}
                handleCancelNewRow={handleCancelNewRow}
              />
            )}
            
            {/* Data Rows */}
            {isLoading ? (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">
                  加载中...
                </td>
              </tr>
            ) : filteredTasks.length === 0 && !addingNewRow ? (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">
                  暂无匹配数据
                </td>
              </tr>
            ) : (
              filteredTasks.map((task: any) => (
                <Fragment key={task.id}>
                <TaskRow
                  task={task}
                  selectedIds={selectedIds}
                  inlineOrderId={inlineOrderId}
                  handleSelectOne={handleSelectOne}
                  renderEditableCell={renderEditableCell}
                  renderTaoTokenCell={renderTaoTokenCell}
                  renderStatusSelect={renderStatusSelect}
                  renderDeadlineCell={renderDeadlineCell}
                  handleQuickOrder={handleQuickOrder}
                  handleDelete={handleDelete}
                />
                {inlineOrderId === task.id && (
                  <tr className="border-b bg-indigo-50/50 dark:bg-indigo-950/20">
                    <td colSpan={13} className="px-6 py-4">
                      <div className="flex items-center justify-end gap-4 flex-wrap">
                        <div className="rounded-lg border p-3 bg-white dark:bg-slate-900/40">
                          <p className="text-sm font-medium">商品: {task.productId || task.productCode || '未填写'}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            剩余名额: <span className="font-bold text-indigo-600 dark:text-indigo-400">{task.maxOrders - task.currentOrders}人</span>
                          </p>
                        </div>
                        <div className="relative" ref={takerDropdownRef}>
                          <label className="text-xs font-medium text-muted-foreground">接单人 *</label>
                          <div className="relative mt-1" ref={takerAnchorRef}>
                            <input
                              type="text"
                              value={takerSearch}
                              onChange={(e) => {
                                setTakerSearch(e.target.value);
                                setSelectedTaker('');
                                setShowTakerDropdown(true);
                              }}
                              onFocus={() => setShowTakerDropdown(true)}
                              placeholder="搜索接单人（昵称/微信号/淘宝昵称）..."
                              className={`w-56 rounded-lg border bg-card px-3 py-2 text-sm pr-8 apple-input ${
                                selectedTaker ? 'border-emerald-500' : 'border-input'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowTakerDropdown(v => !v)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              <svg className={`h-3 w-3 transition-transform ${showTakerDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </button>
                          </div>
                          {showTakerDropdown && createPortal(
                            <div
                              ref={takerPanelRef}
                              // portal 到 body：内联接单行位于表格外层的
                              // overflow-x-auto 容器内（一个轴 auto 会把另一个 visible
                              // 计算成 auto，纵向同样裁剪），留在原地会被切掉。
                              // z 取 45：高于页面内容，低于 .modal-overlay(50)/.drawer-content(50)
                              className="fixed z-[45] overflow-y-auto overscroll-contain rounded-md border bg-card shadow-lg"
                              style={{
                                left: takerPanelStyle.left,
                                top: takerPanelStyle.top,
                                width: takerPanelStyle.width,
                                maxHeight: takerPanelStyle.maxHeight,
                                visibility: takerPanelStyle.visibility,
                              }}
                            >
                              <label className="flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground select-none hover:bg-accent">
                                <input
                                  type="checkbox"
                                  checked={onlyQualifiedTaker}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onChange={(e) => setOnlyQualifiedTaker(e.target.checked)}
                                  className="h-3 w-3 accent-indigo-500"
                                />
                                只看可接单（资质合格）
                              </label>
                              {takersLoading && (
                                <div className="px-3 py-2 text-xs text-muted-foreground">搜索中...</div>
                              )}
                              {takerOptions
                                .map((taker: any) => {
                                  const compliance = (taker.compliance ?? null) as TakerCompliance | null;
                                  const orderable = isTakerOrderable(compliance);
                                  const status = (compliance?.status ?? 'incomplete') as ComplianceStatus;
                                  const meta = COMPLIANCE_META[status];
                                  const reason = describeComplianceReason(compliance);
                                  return (
                                    <div
                                      key={taker.id}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        // 资质非「合格」的接单人置灰不可选（服务端同样会拦截）
                                        if (!orderable) return;
                                        setSelectedTaker(taker.id);
                                        setTakerSearch(`${taker.wechatName}（${taker.wechatId}）`);
                                        setShowTakerDropdown(false);
                                      }}
                                      title={orderable ? '账号资质合格，可接单' : `${meta.label}：${reason}（不可接单）`}
                                      className={`px-3 py-1.5 text-sm ${
                                        orderable ? 'cursor-pointer hover:bg-accent' : 'cursor-not-allowed opacity-50'
                                      } ${selectedTaker === taker.id ? 'bg-accent font-medium' : ''}`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="truncate">
                                          {taker.wechatName} <span className="text-xs text-muted-foreground">{taker.wechatId}</span>
                                          {taker.taobaoNickname ? (
                                            <span className="text-xs text-muted-foreground"> · 淘宝：{taker.taobaoNickname}</span>
                                          ) : null}
                                        </span>
                                        <span
                                          className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${meta.className}`}
                                        >
                                          {meta.label}
                                        </span>
                                      </div>
                                      {!orderable && (
                                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                                          {meta.label}：{reason}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              }
                              {!takersLoading && takers.length === 0 && (
                                <div className="px-3 py-2 text-xs text-muted-foreground">
                                  未找到匹配的接单人
                                </div>
                              )}
                              {!takersLoading && takers.length > 0 && takerOptions.length === 0 && (
                                <div className="px-3 py-2 text-xs text-muted-foreground">
                                  当前 {takers.length} 条结果均非资质合格，已被「只看可接单」过滤
                                </div>
                              )}
                              {!takersLoading && takersTotal > takers.length && (
                                <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                                  共 {takersTotal} 人匹配，已显示前 {takerOptions.length} 人，请补充更多关键词缩小范围
                                </div>
                              )}
                            </div>,
                            document.body,
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleConfirmQuickOrder()}
                            disabled={quickOrderMutation.isPending || !selectedTaker}
                            className="apple-btn rounded-lg bg-indigo-500 px-5 py-2 text-sm text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                          >
                            {quickOrderMutation.isPending ? '接单中...' : '确认接单'}
                          </button>
                          <button
                            onClick={() => {
                              setInlineOrderId(null);
                              setSelectedTask(null);
                              setSelectedTaker('');
                              setTakerSearch('');
                              setShowTakerDropdown(false);
                              setQuickOrderForm({ orderNo: '', orderNo19: '', actualPayment: '' });
                            }}
                            className="apple-btn rounded-lg border px-5 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 20 && (
        <TaskPagination page={page} total={total} setPage={setPage} />
      )}
    </div>
  );
}