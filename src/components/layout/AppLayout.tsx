import { Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Sidebar } from './Sidebar'
import { FlaskConical } from 'lucide-react'

export function AppLayout() {
  const { isDemoMode } = useAuth()

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950 flex-col">
      {isDemoMode && (
        <div className="flex items-center justify-center gap-2 bg-amber-500 text-white text-xs px-4 py-2 flex-shrink-0">
          <FlaskConical className="w-3.5 h-3.5" />
          <span>Modo demonstração — dados de exemplo, sem persistência.</span>
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-auto pt-14 lg:pt-0">
          <div className="p-6 lg:p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
