import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    return {
      confirm: (opts: ConfirmOptions | string) => {
        const msg = typeof opts === 'string' ? opts : opts.message;
        return Promise.resolve(window.confirm(msg));
      },
    };
  }
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    show: boolean;
    options: ConfirmOptions;
    resolve: ((value: boolean) => void) | null;
  }>({ show: false, options: { message: '' }, resolve: null });

  const confirm = useCallback((opts: ConfirmOptions | string): Promise<boolean> => {
    const options = typeof opts === 'string' ? { message: opts } : opts;
    return new Promise((resolve) => {
      setState({ show: true, options, resolve });
    });
  }, []);

  const handleClose = (result: boolean) => {
    state.resolve?.(result);
    setState({ show: false, options: { message: '' }, resolve: null });
  };

  const variantColors = {
    danger: { icon: 'text-destructive', bg: 'bg-destructive/10', btn: 'bg-destructive text-destructive-foreground hover:bg-destructive/90' },
    warning: { icon: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30', btn: 'bg-yellow-600 text-white hover:bg-yellow-700' },
    info: { icon: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', btn: 'bg-primary text-primary-foreground hover:bg-primary/90' },
  };

  const colors = variantColors[state.options.variant || 'danger'];

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state.show && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => handleClose(false)}
          onKeyDown={(e) => e.key === 'Escape' && handleClose(false)}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-card p-6 shadow-xl border border-border/50 animate-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div className={`p-2 rounded-full ${colors.bg} shrink-0`}>
                <AlertTriangle className={`h-5 w-5 ${colors.icon}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold mb-1">
                  {state.options.title || '确认操作'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {state.options.message}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => handleClose(false)}
                className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
              >
                {state.options.cancelText || '取消'}
              </button>
              <button
                onClick={() => handleClose(true)}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${colors.btn}`}
                autoFocus
              >
                {state.options.confirmText || '确认'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
