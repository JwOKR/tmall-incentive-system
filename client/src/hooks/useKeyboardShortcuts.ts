import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// 全局键盘快捷键
export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName;
      const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target.isContentEditable;

      // Esc 关闭弹框（不拦截其他 Esc 行为）
      if (e.key === 'Escape') {
        // 让各组件自己处理 Esc
        return;
      }

      // 以下快捷键在输入框内不生效
      if (isInput) return;

      // / 聚焦搜索框
      if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="搜索"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }

      // Ctrl/Cmd + K 聚焦搜索框
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="搜索"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }

      // 导航快捷键（Alt + 数字）
      if (e.altKey) {
        const routes: Record<string, string> = {
          '1': '/',
          '2': '/takers',
          '3': '/tasks',
          '4': '/orders',
          '5': '/intervals',
          '6': '/commissions',
          '7': '/logs',
          '8': '/export',
          '9': '/settings',
        };
        if (routes[e.key]) {
          e.preventDefault();
          navigate(routes[e.key]);
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [navigate]);
}
