import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/Toast';

interface ChangePasswordFormProps {
  /** 修改成功后的回调（由调用方决定是否关闭弹窗/菜单）；失败不触发 */
  onSuccess?: () => void;
}

/**
 * 修改密码表单（单一数据源）。
 *
 * 说明：原先该表单内联在 Settings 页的「修改密码」tab 中；因 `/settings` 已收紧为
 * admin-only，非管理员需要一个独立的改密入口（顶栏用户菜单），故抽取为共享组件，
 * 避免复制两份表单与校验。校验规则、toast 文案、请求路径与原实现**逐字一致**：
 * - 旧密码/新密码为空 → 「请填写旧密码和新密码」
 * - 新密码 < 6 位 → 「新密码至少6位」
 * - 两次不一致 → 「两次输入的新密码不一致」
 * - PUT /auth/password { oldPassword, newPassword }；成功 → 「密码修改成功」
 */
export default function ChangePasswordForm({ onSuccess }: ChangePasswordFormProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);

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
        // 成功后清空三框（组件若随之卸载，状态亦会自然重置）
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        onSuccess?.();
      } else {
        toastError(res.message || '密码修改失败');
      }
    } catch (err: any) {
      toastError(err?.response?.data?.message || '密码修改失败');
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">旧密码</label>
        <input
          type="password"
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          placeholder="请输入旧密码"
          className="apple-input rounded-lg mt-1"
        />
      </div>
      <div>
        <label className="text-sm font-medium">新密码</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="至少6位"
          className="apple-input rounded-lg mt-1"
        />
      </div>
      <div>
        <label className="text-sm font-medium">确认新密码</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="再次输入新密码"
          className="apple-input rounded-lg mt-1"
        />
      </div>
      <button
        onClick={handleChangePassword}
        disabled={changing}
        className="apple-btn inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
      >
        {changing && <Loader2 className="h-4 w-4 animate-spin" />}
        {changing ? '修改中...' : '确认修改'}
      </button>
    </div>
  );
}
