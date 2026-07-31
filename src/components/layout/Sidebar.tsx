import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, FileText, BookOpen, Users, MessageSquare,
  Menu, X, LogOut, Sun, Moon, Settings, PanelLeftClose, PanelLeftOpen, GraduationCap, Clock,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  {
    to: '/app/visao-geral',
    label: 'Visão Geral',
    icon: LayoutDashboard,
    activeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    iconClass: 'text-amber-600',
  },
  {
    to: '/app/ordem-do-dia',
    label: 'Ordem do Dia',
    icon: ClipboardList,
    activeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    iconClass: 'text-amber-500',
  },
  {
    to: '/app/atas-e-decisoes',
    label: 'Atas e Decisões',
    icon: FileText,
    activeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    iconClass: 'text-amber-600',
  },
  {
    to: '/app/leituras',
    label: 'Leituras Recomendadas',
    icon: BookOpen,
    activeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    iconClass: 'text-amber-500',
  },
  {
    to: '/app/sugestoes',
    label: 'Bate-Papo e Sugestões',
    icon: MessageSquare,
    activeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    iconClass: 'text-amber-600',
  },
  {
    to: '/app/orientacoes',
    label: 'Orientações',
    icon: GraduationCap,
    activeClass: 'bg-pink-50 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300',
    iconClass: 'text-pink-600',
  },
  {
    to: '/app/linha-do-tempo',
    label: 'Linha do Tempo',
    icon: Clock,
    activeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    iconClass: 'text-amber-600',
  },
  {
    to: '/app/usuarios',
    label: 'Usuários',
    icon: Users,
    activeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    iconClass: 'text-amber-600',
  },
]

const AppLogo = ({ gid = 'cl' }: { gid?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" className="w-full h-full">
    <defs>
      <linearGradient id={gid} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="9" fill={`url(#${gid})`} />
    <circle cx="16" cy="12" r="5" fill="white" opacity="0.9" />
    <ellipse cx="16" cy="24" rx="8" ry="4.5" fill="white" opacity="0.7" />
    <circle cx="8" cy="14" r="3" fill="white" opacity="0.6" />
    <circle cx="24" cy="14" r="3" fill="white" opacity="0.6" />
    <ellipse cx="8" cy="24" rx="4.5" ry="3" fill="white" opacity="0.4" />
    <ellipse cx="24" cy="24" rx="4.5" ry="3" fill="white" opacity="0.4" />
  </svg>
)

function ThemeToggle({ small = false }: { small?: boolean }) {
  const { isDark, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
      className={cn(
        'rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
        small ? 'p-1.5' : 'p-2'
      )}
    >
      {isDark ? <Sun className={cn(small ? 'w-3.5 h-3.5' : 'w-4 h-4')} /> : <Moon className={cn(small ? 'w-3.5 h-3.5' : 'w-4 h-4')} />}
    </button>
  )
}

interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Shared content for mobile drawer (always expanded)
  const mobileContent = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex-shrink-0"><AppLogo gid="cl-mob-drawer" /></div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900 dark:text-white text-sm">coLAB</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Gestão de grupo de pesquisa</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, icon: Icon, activeClass, iconClass }) => (
          <NavLink key={to} to={to} onClick={() => setMobileOpen(false)}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive ? activeClass : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            )}
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('w-4 h-4 flex-shrink-0', isActive ? iconClass : 'text-gray-400 dark:text-gray-500')} />
                <span className="truncate">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-gray-100 dark:border-gray-700 space-y-1">
        <NavLink to="/app/settings" onClick={() => setMobileOpen(false)}
          className={({ isActive }) => cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
            isActive && 'bg-gray-100 dark:bg-gray-800'
          )}
        >
          <Settings className="w-4 h-4 text-gray-400 flex-shrink-0" />
          Configurações
        </NavLink>
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              {session?.email?.[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">{session?.email}</span>
          <div className="flex items-center gap-1 flex-shrink-0">
            <ThemeToggle small />
            <button onClick={() => { signOut(); navigate('/login') }} title="Sair"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7"><AppLogo gid="cl-mob" /></div>
          <span className="font-bold text-gray-900 dark:text-white">coLAB</span>
        </div>
        <button onClick={() => setMobileOpen(v => !v)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/30" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile drawer */}
      <div className={cn(
        'lg:hidden fixed top-14 left-0 bottom-0 w-64 z-40 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-700 transition-transform duration-200',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {mobileContent}
      </div>

      {/* Desktop sidebar */}
      <aside className={cn(
        'hidden lg:flex flex-col bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-700 flex-shrink-0 sticky top-0 h-screen transition-all duration-300 overflow-hidden',
        collapsed ? 'w-14' : 'w-60'
      )}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className={cn(
            'border-b border-gray-100 dark:border-gray-700 flex-shrink-0',
            collapsed ? 'p-2 flex flex-col items-center gap-2' : 'p-4'
          )}>
            {collapsed ? (
              <>
                <div className="w-8 h-8"><AppLogo gid="cl-side-c" /></div>
                <button
                  onClick={onToggle}
                  title="Expandir menu"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex-shrink-0"><AppLogo gid="cl-side" /></div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-gray-900 dark:text-white text-sm">coLAB</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Gestão de grupo de pesquisa</p>
                </div>
                <button
                  onClick={onToggle}
                  title="Ocultar menu"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav className={cn('flex-1 overflow-y-auto space-y-0.5', collapsed ? 'p-2' : 'p-3')}>
            {NAV_ITEMS.map(({ to, label, icon: Icon, activeClass, iconClass }) => (
              <NavLink
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className={({ isActive }) => cn(
                  'flex items-center rounded-lg text-sm font-medium transition-colors',
                  collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                  isActive
                    ? activeClass
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                )}
              >
                {({ isActive }) => (
                  <>
                    <Icon className={cn('w-4 h-4 flex-shrink-0', isActive ? iconClass : 'text-gray-400 dark:text-gray-500')} />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Footer */}
          <div className={cn(
            'border-t border-gray-100 dark:border-gray-700 space-y-1 flex-shrink-0',
            collapsed ? 'p-2' : 'p-3'
          )}>
            {collapsed ? (
              <div className="flex flex-col items-center gap-1">
                <NavLink to="/app/settings" title="Configurações"
                  className={({ isActive }) => cn(
                    'p-2.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
                    isActive && 'bg-gray-100 dark:bg-gray-800'
                  )}
                >
                  <Settings className="w-4 h-4" />
                </NavLink>
                <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center" title={session?.email}>
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                    {session?.email?.[0]?.toUpperCase() ?? '?'}
                  </span>
                </div>
                <ThemeToggle small />
                <button onClick={() => { signOut(); navigate('/login') }} title="Sair"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <NavLink to="/app/settings"
                  className={({ isActive }) => cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
                    isActive && 'bg-gray-100 dark:bg-gray-800'
                  )}
                >
                  <Settings className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  Configurações
                </NavLink>
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                      {session?.email?.[0]?.toUpperCase() ?? '?'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1">{session?.email}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <ThemeToggle small />
                    <button onClick={() => { signOut(); navigate('/login') }} title="Sair"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
