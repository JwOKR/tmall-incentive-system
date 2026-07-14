import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { backupApi, adminApi, settingsApi } from '@/lib/api';
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
  Users,
  Plus,
  Pencil,
  Trash2,
  X,
  Sparkles,
  Save,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { formatDate } from '@/lib/utils';

export default function Settings() {
  const { user } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState<'account' | 'password' | 'shortcuts' | 'backup' | 'users' | 'ai'>('account');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');

  // AI配置状态
  const [aiSettings, setAiSettings] = useState<Record<string, string>>({});
  const [loadingAi, setLoadingAi] = useState(false);
  const [savingAi, setSavingAi] = useState(false);

  // 用户管理状态
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [userForm, setUserForm] = useState({ username: '', password: '', role: 'user', permissions: {} as Record<string, { view: boolean; edit: boolean }> });

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

  // 加载用户列表
  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const res: any = await adminApi.getAllUsers();
      if (res.success) setUsers(res.data || []);
    } catch { toastError('加载用户列表失败'); }
    finally { setLoadingUsers(false); }
  };

  useEffect(() => {
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'ai') loadAiSettings();
  }, [activeTab]);

  const loadAiSettings = async () => {
    setLoadingAi(true);
    try {
      const res: any = await settingsApi.get('ai');
      if (res.success) {
        const map: Record<string, string> = {};
        (res.data || []).forEach((s: any) => { map[s.key] = s.value; });
        setAiSettings(map);
      }
    } catch { toastError('加载AI配置失败'); }
    finally { setLoadingAi(false); }
  };

  const handleSaveAiSettings = async () => {
    setSavingAi(true);
    try {
      const settings = Object.entries(aiSettings).map(([key, value]) => ({ key, value }));
      const res: any = await settingsApi.update(settings);
      if (res.success) toastSuccess('AI配置已保存');
      else toastError(res.message || '保存失败');
    } catch (err: any) { toastError(err?.response?.data?.message || '保存失败'); }
    finally { setSavingAi(false); }
  };

  const handleSaveUser = async () => {
    if (!userForm.username) { toastError('请输入用户名'); return; }
    if (!editingUser && !userForm.password) { toastError('请输入密码'); return; }
    if (userForm.password && userForm.password.length < 6) { toastError('密码至少6位'); return; }

    try {
      if (editingUser) {
        const updateData: any = { username: userForm.username, role: userForm.role, permissions: userForm.permissions };
        if (userForm.password) updateData.password = userForm.password;
        const res: any = await adminApi.updateUser(editingUser.id, updateData);
        if (res.success) { toastSuccess('用户已更新'); setShowUserForm(false); setEditingUser(null); loadUsers(); }
        else toastError(res.message || '更新失败');
      } else {
        const res: any = await adminApi.createUser({ username: userForm.username, password: userForm.password, role: userForm.role, permissions: userForm.permissions });
        if (res.success) { toastSuccess('用户已创建'); setShowUserForm(false); loadUsers(); }
        else toastError(res.message || '创建失败');
      }
    } catch (err: any) { toastError(err?.response?.data?.message || '操作失败'); }
  };

  const handleDeleteUser = async (u: any) => {
    if (await confirm({ message: `确定删除用户「${u.username}」？此操作不可恢复。`, variant: 'danger', confirmText: '删除' })) {
      try {
        const res: any = await adminApi.deleteUser(u.id);
        if (res.success) { toastSuccess('用户已删除'); loadUsers(); }
        else toastError(res.message || '删除失败');
      } catch (err: any) { toastError(err?.response?.data?.message || '删除失败'); }
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
    { id: 'users' as const, label: '用户管理', icon: Users },
    { id: 'ai' as const, label: 'AI模型', icon: Sparkles },
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

        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">用户管理</h3>
              <button
                onClick={() => { setEditingUser(null); setUserForm({ username: '', password: '', role: 'user', permissions: {} }); setShowUserForm(true); }}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                添加用户
              </button>
            </div>

            {loadingUsers ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" /> 加载中...</div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">暂无用户</div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="table-header">
                      <th className="px-4 py-3 text-left font-medium">用户名</th>
                      <th className="px-4 py-3 text-left font-medium">角色</th>
                      <th className="px-4 py-3 text-left font-medium">创建时间</th>
                      <th className="px-4 py-3 text-right font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} className="table-row-hover table-row-zebra">
                        <td className="px-4 py-3 font-medium">{u.username}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${u.role === 'admin' ? 'badge-info' : 'badge-neutral'}`}>
                            <Shield className="h-3 w-3" />
                            {u.role === 'admin' ? '管理员' : '普通用户'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(u.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => { 
                                setEditingUser(u); 
                                setUserForm({ 
                                  username: u.username, 
                                  password: '', 
                                  role: u.role, 
                                  permissions: u.permissions ? JSON.parse(u.permissions) : {} 
                                }); 
                                setShowUserForm(true); 
                              }}
                              className="p-1.5 hover:bg-accent rounded-md"
                              title="编辑"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 hover:bg-destructive/10 rounded-md"
                              title="删除"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 用户表单弹窗 */}
            {showUserForm && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                onClick={() => { setShowUserForm(false); setEditingUser(null); }}
                onKeyDown={(e) => e.key === 'Escape' && (setShowUserForm(false), setEditingUser(null))}
                tabIndex={-1}
              >
                <div
                  className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl border border-border/50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">{editingUser ? '编辑用户' : '添加用户'}</h3>
                    <button onClick={() => { setShowUserForm(false); setEditingUser(null); }} className="p-1 hover:bg-accent rounded-md">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">用户名 *</label>
                      <input
                        type="text"
                        value={userForm.username}
                        onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                        placeholder="请输入用户名"
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">{editingUser ? '新密码（留空则不修改）' : '密码 *'}</label>
                      <input
                        type="password"
                        value={userForm.password}
                        onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                        placeholder={editingUser ? '留空则不修改' : '至少6位'}
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">角色</label>
                      <select
                        value={userForm.role}
                        onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="user">普通用户</option>
                        <option value="admin">管理员</option>
                      </select>
                      <p className="text-xs text-muted-foreground mt-1">管理员可管理用户和所有数据，普通用户仅可操作数据</p>
                    </div>
                    {/* 权限设置 */}
                    {userForm.role === 'user' && (
                      <div>
                        <label className="text-sm font-medium">权限设置</label>
                        <p className="text-xs text-muted-foreground mb-2">为普通用户设置模块访问和编辑权限</p>
                        <div className="space-y-2 rounded-md border p-3 bg-muted/30">
                          {[
                            { key: 'orders', label: '订单明细' },
                            { key: 'takers', label: '接单人' },
                            { key: 'tasks', label: '任务' },
                            { key: 'intervals', label: '接单间隔' },
                            { key: 'commissions', label: '佣金分析' },
                            { key: 'logs', label: '操作日志' },
                            { key: 'repeatDiscounts', label: '回头客立减' },
                          ].map(({ key, label }) => {
                            const perm = userForm.permissions?.[key] || { view: false, edit: false };
                            return (
                              <div key={key} className="flex items-center justify-between">
                                <span className="text-sm">{label}</span>
                                <div className="flex items-center gap-3">
                                  <label className="flex items-center gap-1.5 text-xs">
                                    <input
                                      type="checkbox"
                                      checked={perm.view}
                                      onChange={(e) => setUserForm({
                                        ...userForm,
                                        permissions: {
                                          ...userForm.permissions,
                                          [key]: { ...perm, view: e.target.checked }
                                        }
                                      })}
                                      className="rounded"
                                    />
                                    查看
                                  </label>
                                  <label className="flex items-center gap-1.5 text-xs">
                                    <input
                                      type="checkbox"
                                      checked={perm.edit}
                                      onChange={(e) => setUserForm({
                                        ...userForm,
                                        permissions: {
                                          ...userForm.permissions,
                                          [key]: { ...perm, edit: e.target.checked }
                                        }
                                      })}
                                      className="rounded"
                                    />
                                    编辑
                                  </label>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={() => { setShowUserForm(false); setEditingUser(null); }}
                        className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSaveUser}
                        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
                      >
                        {editingUser ? '保存修改' : '创建用户'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">AI 模型配置</h3>
                <p className="text-sm text-muted-foreground mt-1">配置用于「回头客立减」日报AI分析的大模型接口</p>
              </div>
              <button
                onClick={handleSaveAiSettings}
                disabled={savingAi}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {savingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {savingAi ? '保存中...' : '保存配置'}
              </button>
            </div>

            {loadingAi ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8">
                <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
              </div>
            ) : (
              <div className="grid gap-5 max-w-xl">
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      支持所有 OpenAI 兼容格式的 API（DeepSeek、千问、豆包、OpenAI、Claude 等）。
                      配置保存后立即生效，无需重启服务。
                    </span>
                  </p>
                </div>

                {[
                  { key: 'ai_api_url', label: 'API 地址', placeholder: 'https://api.deepseek.com/chat/completions', type: 'text' },
                  { key: 'ai_api_key', label: 'API Key', placeholder: 'sk-...', type: 'password' },
                  { key: 'ai_model', label: '模型名称', placeholder: 'deepseek-chat', type: 'text' },
                  { key: 'ai_max_tokens', label: '最大 Token 数', placeholder: '1000', type: 'number' },
                  { key: 'ai_temperature', label: '温度 (Temperature)', placeholder: '0.7', type: 'number' },
                ].map(field => (
                  <div key={field.key}>
                    <label className="text-sm font-medium">{field.label}</label>
                    <input
                      type={field.type}
                      value={aiSettings[field.key] || ''}
                      onChange={e => setAiSettings(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                ))}

                <div className="rounded-lg border p-4">
                  <h4 className="text-sm font-medium mb-2">常见模型配置参考</h4>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p><strong>DeepSeek：</strong>https://api.deepseek.com/chat/completions · deepseek-chat</p>
                    <p><strong>千问 (Qwen)：</strong>https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions · qwen-plus</p>
                    <p><strong>豆包 (Doubao)：</strong>https://ark.cn-beijing.volces.com/api/v3/chat/completions · doubao-pro-32k</p>
                    <p><strong>OpenAI：</strong>https://api.openai.com/v1/chat/completions · gpt-4o</p>
                  </div>
                </div>
              </div>
            )}
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
