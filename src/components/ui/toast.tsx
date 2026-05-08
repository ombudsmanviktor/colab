import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToastProps {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'destructive'
  action?: { label: string; onClick: () => void }
  duration?: number
  onDismiss: (id: string) => void
}

export function Toast({ id, title, description, variant = 'default', action, duration = 3500, onDismiss }: ToastProps) {
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    // Double rAF to reliably start CSS transition after paint
    bar.style.transition = 'none'
    bar.style.width = '100%'
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        bar.style.transition = `width ${duration}ms linear`
        bar.style.width = '0%'
      })
      return raf2
    })
    return () => cancelAnimationFrame(raf1)
  }, [duration])

  return (
    <div
      className={cn(
        'pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border p-4 shadow-lg transition-all',
        variant === 'destructive'
          ? 'border-red-200 bg-red-50 text-red-900'
          : 'border-gray-200 bg-white text-gray-900'
      )}
    >
      {/* Timer progress bar */}
      <div
        ref={barRef}
        className={cn(
          'absolute bottom-0 left-0 h-[3px]',
          variant === 'destructive' ? 'bg-red-400' : 'bg-purple-400'
        )}
        style={{ width: '100%' }}
      />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="text-sm opacity-80 mt-0.5">{description}</p>}
        {action && (
          <button
            onClick={() => { action.onClick(); onDismiss(id) }}
            className="mt-1.5 text-xs font-semibold text-purple-600 hover:text-purple-800 underline underline-offset-2"
          >
            {action.label}
          </button>
        )}
      </div>

      <button onClick={() => onDismiss(id)} className="flex-shrink-0 opacity-60 hover:opacity-100 mt-0.5">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

interface ToastContainerProps {
  toasts: Array<{
    id: string
    title: string
    description?: string
    variant?: 'default' | 'destructive'
    action?: { label: string; onClick: () => void }
    duration?: number
  }>
  onDismiss: (id: string) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map(t => (
        <Toast key={t.id} {...t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
