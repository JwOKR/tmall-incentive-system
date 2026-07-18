import { useEffect } from 'react';

/**
 * 锁定 body 滚动，防止弹窗打开时页面滚动
 * 使用 MutationObserver 监听 .modal-overlay / .drawer-overlay 是否存在
 */
export function useBodyScrollLock() {
  useEffect(() => {
    let scrollY = 0;

    const lock = () => {
      scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
    };

    const unlock = () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };

    const check = () => {
      const hasOverlay = document.querySelector('.modal-overlay, .drawer-overlay');
      if (hasOverlay) {
        if (document.body.style.position !== 'fixed') lock();
      } else {
        if (document.body.style.position === 'fixed') unlock();
      }
    };

    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });

    // 初始检查
    check();

    return () => {
      observer.disconnect();
      // 清理
      if (document.body.style.position === 'fixed') unlock();
    };
  }, []);
}
