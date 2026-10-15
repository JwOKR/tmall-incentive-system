import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, KeyRound, ChevronDown, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/lib/permissions';

interface UserMenuProps {
  /** 触发样式：topbar＝顶栏横向按钮；sidebar＝侧栏底部用户卡 */
  variant?: 'topbar' | 'sidebar';
  /** 侧栏折叠态：仅渲染头像、隐藏文字（顶层无条件传入，不构成 Hook 条件） */
  collapsed?: boolean;
  /**
   * 点击「修改密码」的回调。弹窗由父组件（Layout）挂在根 div 下渲染，
   * 以免落入顶栏 z-30 层叠上下文而压不过侧栏（z-50）。
   */
  onRequestChangePassword: () => void;
}

interface UserMenuItemsProps {
  /** 是否管理员（决定是否渲染「系统设置」项）；由 usePermissions().isAdmin() 计算后传入 */
  isAdmin: boolean;
  onOpenSettings: () => void;
  onOpenChangePassword: () => void;
}

/**
 * 菜单内容（共享渲染函数）：顶栏与侧栏 UserMenu 共同使用这唯一一份 JSX，
 * 不重复定义。单独导出亦便于以零依赖方式（renderToStaticMarkup）渲染取证。
 */
export function UserMenuItems({ isAdmin, onOpenSettings, onOpenChangePassword }: UserMenuItemsProps) {
  return (
    <>
      {isAdmin && (
        <button
          type="button"
          role="menuitem"
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left hover:bg-accent transition-colors"
        >
          <SettingsIcon className="h-4 w-4 text-muted-foreground" />
          系统设置
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={onOpenChangePassword}
        className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left hover:bg-accent transition-colors"
      >
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        修改密码
      </button>
    </>
  );
}

/**
 * 共享用户菜单：顶栏头像与侧栏用户卡「同一份实现」。
 * - 所有登录用户均可点开（菜单项「修改密码」对所有人可见）；「系统设置」仅管理员可见。
 * - 管理员判定统一走 usePermissions().isAdmin()，禁止在此写 user?.role === 'admin'
 *   （唯一保留该字面量之处是「角色文案展示」：管理员/普通用户 label）。
 * - 行为与顶栏现状一致：点击外部关闭、Esc 关闭、路由变化关闭。
 *
 * 注意：本组件内 Hook 调用数量与顺序恒定 —— useLocation/useNavigate/useAuth/usePermissions
 * 各 1、useState 1、useRef 1、useEffect 2，均为顶层无条件调用；管理员分支只影响 JSX 条件渲染，
 * 不改变 Hook 数量（避免历史上出现过的「条件式 return 导致 Hook 顺序违规」）。
 */
export default function UserMenu({ variant = 'topbar', collapsed = false, onRequestChangePassword }: UserMenuProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = usePermissions();
  const isAdminUser = isAdmin();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部 / Esc 关闭（仅菜单打开时挂监听）
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // 路由变化时关闭菜单
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const handleSettings = () => {
    setOpen(false);
    navigate('/settings');
  };

  const handleChangePassword = () => {
    setOpen(false);
    onRequestChangePassword();
  };

  const isSidebar = variant === 'sidebar';

  const triggerClass = isSidebar
    ? `w-full flex items-center gap-3 rounded-xl transition-colors duration-200 hover:bg-slate-100 dark:hover:bg-slate-800 ${
        collapsed ? 'justify-center p-3' : 'px-3 py-2.5'
      }`
    : 'flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors';

  const avatarClass = isSidebar
    ? 'flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/80 to-violet-500/60 shrink-0 shadow-sm'
    : 'w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500/80 to-violet-500/60 flex items-center justify-center';

  const menuPosition = isSidebar
    ? `left-0 bottom-full mb-2 ${collapsed ? '' : 'right-0'}`
    : 'right-0 top-full mt-2';

  const showText = isSidebar ? !collapsed : true;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={triggerClass}
        title={isSidebar ? (collapsed ? (user?.username || '未知') : undefined) : (user?.username || '未知')}
      >
        <div className={avatarClass}>
          <User className={isSidebar ? 'h-4 w-4 text-white' : 'h-3.5 w-3.5 text-white'} />
        </div>
        {showText && (
          isSidebar ? (
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium truncate">{user?.username || '未知'}</p>
              <p className="text-[10px] text-muted-foreground">{user?.role === 'admin' ? '管理员' : '普通用户'}</p>
            </div>
          ) : (
            <div className="hidden sm:block text-left">
              <p className="text-xs font-medium">{user?.username || '未知'}</p>
              <p className="text-[10px] text-muted-foreground">{user?.role === 'admin' ? '管理员' : '普通用户'}</p>
            </div>
          )
        )}
        {isSidebar ? (
          !collapsed && (
            <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
          )
        ) : (
          <ChevronDown className={`hidden sm:block h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="用户菜单"
          className={`dropdown-content absolute ${menuPosition} z-40 min-w-[11rem] rounded-xl border bg-card shadow-lg p-1`}
        >
          <UserMenuItems
            isAdmin={isAdminUser}
            onOpenSettings={handleSettings}
            onOpenChangePassword={handleChangePassword}
          />
        </div>
      )}
    </div>
  );
}
