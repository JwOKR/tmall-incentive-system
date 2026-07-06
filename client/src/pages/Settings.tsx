import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import api from '@/lib/api';
import { Lock, User, Save, Eye, EyeOff } from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  // 修改密码
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async () => {
    if (!passwordForm.oldPassword || !passwordForm.newPassword) {
      toastError('请填写旧密码和新密码');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toastError('新密码至少6位');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toastError('两次输入的新密码不一致');
      return;
    }
    if (passwordForm.oldPassword === passwordForm.newPassword) {
      toastError('新密码不能与旧密码相同');
      return;
    }

    setSaving(true);
    try {
      await api.put('/auth/password', {
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
      });
      toastSuccess('密码修改成功');
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      toastError(err?.response?.data?.message || '密码修改失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">系统设置</h2>
        <p className="text-muted-foreground">账户信息与安全设置</p>
      </div>

      {/* 账户信息 */}
      <div className="rounded-xl border bg-card p-6 shadow-sm max-w-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary/10 rounded-lg">
            <User className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">账户信息</h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <span className="text-sm text-muted-foreground">用户名</span>
            <span className="font-medium">{user?.username || '-'}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <span className="text-sm text-muted-foreground">角色</span>
            <span className="font-medium">{user?.role === 'admin' ? '管理员' : '普通用户'}</span>
          </div>
        </div>
      </div>

      {/* 修改密码 */}
      <div className="rounded-xl border bg-card p-6 shadow-sm max-w-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
            <Lock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          </div>
          <h3 className="text-lg font-semibold">修改密码</h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">旧密码</label>
            <div className="relative mt-1">
              <input
                type={showOld ? 'text' : 'password'}
                value={passwordForm.oldPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm pr-10"
                placeholder="请输入旧密码"
              />
              <button
                type="button"
                onClick={() => setShowOld(!showOld)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">新密码</label>
            <div className="relative mt-1">
              <input
                type={showNew ? 'text' : 'password'}
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm pr-10"
                placeholder="至少6位"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">确认新密码</label>
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="再次输入新密码"
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? '保存中...' : '修改密码'}
          </button>
        </div>
      </div>

      {/* 快捷键说明 */}
      <div className="rounded-xl border bg-card p-6 shadow-sm max-w-lg">
        <h3 className="text-lg font-semibold mb-4">键盘快捷键</h3>
        <div className="space-y-2">
          {[
            { keys: '/', desc: '聚焦搜索框' },
            { keys: 'Ctrl + K', desc: '聚焦搜索框' },
            { keys: 'Alt + 1~8', desc: '快速切换页面' },
            { keys: 'Esc', desc: '关闭弹框' },
            { keys: 'Enter', desc: '确认保存' },
          ].map(shortcut => (
            <div key={shortcut.keys} className="flex items-center justify-between p-2">
              <span className="text-sm text-muted-foreground">{shortcut.desc}</span>
              <kbd className="px-2 py-1 rounded border bg-muted text-xs font-mono">{shortcut.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
