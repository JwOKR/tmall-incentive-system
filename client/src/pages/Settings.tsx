import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { backupApi } from '@/lib/api';
// utils not needed in this page
import {
  User,
  Lock,
  Keyboard,
  Download,
  Upload,
  Shield,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '@/components/Toast';

export default function Settings() {
  const { user } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();
  const [activeTab, setActiveTab] = useState<'account' | 'password' | 'shortcuts' | 'backup'>('account');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword) {
      toastError('请填写旧密码和新密码');
      return;
    }
    if (newPassword.length < 6) {
      toastError('新密码至少6位');
      return;
    }
    if (newPassword !== confirmPassword) {
      toastError('两次输入的新密码不一致');
      return;
    }

    setChanging(true);
    try {
      const { default: api } = await import('@/lib/api');
      const res: any = await api.put('/auth/password', { oldPassword, newPassword });
      if (res.success) {
        toastSuccess('密码修改成功');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toastError(res.message || '密码修改失败');
      }
    } catch (err: any) {
      toastError(err?.response?.data?.message || '密码修改失败');
    } finally {
      setChanging(false);
    }
  };

  const handleExportBackup = async () => {
    setBackingUp(true);
    try {
      const res: any = await backupApi.exportBackup();
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tmall-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess('备份导出成功');
    } catch (err) {
      toastError('备份导出失败');
    } finally {
      setBackingUp(false);
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toastError('请选择 JSON 格式的备份文件');
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup.data || !backup.version) {
        toastError('备份文件格式不正确');
        return;
      }

      const res: any = await backupApi.importBackup(backup.data, importMode);
      if (res.success) {
        const { takers, tasks, orders } = res.data;
        toastSuccess(
          `导入完成: 接单人${takers.created}个(+${takers.skipped}跳过), ` +
          `任务${tasks.created}个(+${tasks.skipped}跳过), ` +
          `订单${orders.created}个(+${orders.skipped}跳过)`
        );
      } else {
        toastError(res.message || '导入失败');
      }
    } catch (err: any) {
      toastError('文件解析失败: ' + (err.message || '格式错误'));
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const tabs = [
    { id: 'account' as const, label: '账户信息', icon: User },
    { id: 'password' as const, label: '修改密码', icon: Lock },
    { id: 'backup' as const, label: '数据备份', icon: Download },
    { id: 'shortcuts' as const, label: '快捷键', icon: Keyboard },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">系统设置</h2>
        <p className="text-muted-foreground">管理账户、备份数据和系统配置</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        {activeTab === 'account' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">账户信息</h3>
            <div className="grid gap-4 max-w-md">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm text-muted-foreground">用户名</span>
                <span className="font-medium">{user?.username || '-'}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm text-muted-foreground">角色</span>
                <span className="inline-flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-primary" />
                  <span className="font-medium">{user?.role || 'admin'}</span>
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm text-muted-foreground">登录状态</span>
                <span className="inline-flex items-center gap-1.5 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">已登录</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'password' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">修改密码</h3>
            <div className="max-w-md space-y-4">
              <div>
                <label className="text-sm font-medium">旧密码</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="请输入旧密码"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">新密码</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少6位"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">确认新密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={handleChangePassword}
                disabled={changing}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {changing && <Loader2 className="h-4 w-4 animate-spin" />}
                {changing ? '修改中...' : '确认修改'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'backup' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">数据备份与恢复</h3>

            {/* 导出 */}
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">导出备份</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    将所有接单人、任务、订单、日志数据导出为 JSON 文件
                  </p>
                </div>
                <button
                  onClick={handleExportBackup}
                  disabled={backingUp}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {backingUp ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {backingUp ? '导出中...' : '导出备份'}
                </button>
              </div>
            </div>

            {/* 导入 */}
            <div className="rounded-lg border p-4">
              <h4 className="font-medium mb-2">导入备份</h4>
              <p className="text-sm text-muted-foreground mb-4">
                从 JSON 备份文件恢复数据。支持两种模式：
              </p>
              <div className="flex gap-4 mb-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={importMode === 'merge'}
                    onChange={() => setImportMode('merge')}
                    className="w-4 h-4"
                  />
                  <div>
                    <span className="font-medium">合并模式</span>
                    <span className="text-muted-foreground ml-1">（跳过已存在的数据）</span>
                  </div>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={importMode === 'overwrite'}
                    onChange={() => setImportMode('overwrite')}
                    className="w-4 h-4"
                  />
                  <div>
                    <span className="font-medium">覆盖模式</span>
                    <span className="text-muted-foreground ml-1">（强制写入，不跳过）</span>
                  </div>
                </label>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportBackup}
                  disabled={importing}
                  className="hidden"
                  id="backup-import"
                />
                <label
                  htmlFor="backup-import"
                  className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium cursor-pointer hover:bg-accent ${importing ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {importing ? '导入中...' : '选择备份文件'}
                </label>
              </div>
              <div className="mt-3 p-3 rounded bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30">
                <p className="text-xs text-yellow-700 dark:text-yellow-400 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    导入操作会写入数据库。建议先使用「导出备份」保存当前数据。
                    <strong>合并模式</strong>会跳过已存在的记录；<strong>覆盖模式</strong>不检查重复，直接写入。
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'shortcuts' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">键盘快捷键</h3>
            <div className="grid gap-3 max-w-md">
              {[
                { key: '/', desc: '聚焦搜索框' },
                { key: 'Ctrl + K', desc: '聚焦搜索框（备选）' },
                { key: 'Alt + 1', desc: '跳转到 仪表盘' },
                { key: 'Alt + 2', desc: '跳转到 接单人管理' },
                { key: 'Alt + 3', desc: '跳转到 任务管理' },
                { key: 'Alt + 4', desc: '跳转到 订单管理' },
                { key: 'Alt + 5', desc: '跳转到 接单间隔' },
                { key: 'Alt + 6', desc: '跳转到 佣金分析' },
                { key: 'Alt + 7', desc: '跳转到 操作日志' },
                { key: 'Alt + 8', desc: '跳转到 数据导出' },
                { key: 'Alt + 9', desc: '跳转到 系统设置' },
                { key: 'Esc', desc: '关闭弹窗' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">{item.desc}</span>
                  <kbd className="px-2 py-1 text-xs font-mono bg-background border rounded shadow-sm">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
