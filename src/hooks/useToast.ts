import { useState, useCallback } from 'react'

export interface Toast {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'destructive'
  action?: { label: string; onClick: () => void }
  duration?: number
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback(
    ({ title, description, variant = 'default', action, duration }: Omit<Toast, 'id'>) => {
      const id = Math.random().toString(36).slice(2)
      const d = duration ?? 3500
      setToasts(prev => [...prev, { id, title, description, variant, action, duration: d }])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, d)
    },
    []
  )

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return { toasts, toast, dismiss }
}
