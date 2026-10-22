import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Toast = { id: number; message: string; action?: { label: string; run: () => void } }
const ToastContext = createContext<((message: string, action?: Toast['action']) => void) | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (message: string, action?: Toast['action']) => {
      const id = Date.now() + Math.random()
      setToasts((t) => [...t.slice(-2), { id, message, action }])
      window.setTimeout(() => dismiss(id), 4200)
    },
    [dismiss],
  )
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.message}</span>
            {t.action && (
              <button type="button" onClick={() => { t.action?.run(); dismiss(t.id) }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const push = useContext(ToastContext)
  if (!push) throw new Error('useToast must be used inside <ToastProvider>')
  return push
}
