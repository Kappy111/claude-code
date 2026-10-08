import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: ToastKind; message: string; }
interface ToastCtx { show: (message: string, kind?: ToastKind) => void; }

const Ctx = createContext<ToastCtx>({ show: () => {} });

const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
const colors = {
  success: 'text-accent-teal',
  error: 'text-accent-pink',
  info: 'text-brand-300',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[min(92vw,380px)] pointer-events-none">
        {toasts.map((t) => {
          const Icon = icons[t.kind];
          return (
            <div key={t.id}
              className="pointer-events-auto card bg-ink-800/95 backdrop-blur shadow-card px-4 py-3 flex items-start gap-3 animate-slide-up">
              <Icon size={20} className={`${colors[t.kind]} shrink-0 mt-0.5`} />
              <p className="text-sm text-txt-primary flex-1">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="text-txt-muted hover:text-txt-primary">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
