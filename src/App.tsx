import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { Login } from '@/pages/Login'
import { VisaoGeral } from '@/pages/VisaoGeral'
import { VisaoGeralEmbed } from '@/pages/VisaoGeralEmbed'
import { OrdemDoDiaPage as OrdemDoDia } from '@/pages/OrdemDoDia'
import { AtasEDecisoes } from '@/pages/AtasEDecisoes'
import { Leituras } from '@/pages/Leituras'
import { Usuarios } from '@/pages/Usuarios'
import { Settings } from '@/pages/Settings'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <HashRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/embed/visao-geral/:data" element={<VisaoGeralEmbed />} />
              <Route
                path="/app"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="visao-geral" replace />} />
                <Route path="visao-geral" element={<VisaoGeral />} />
                <Route path="ordem-do-dia" element={<OrdemDoDia />} />
                <Route path="atas-e-decisoes" element={<AtasEDecisoes />} />
                <Route path="leituras" element={<Leituras />} />
                <Route path="usuarios" element={<Usuarios />} />
                <Route path="settings" element={<Settings />} />
              </Route>
              <Route path="/" element={<Navigate to="/app/visao-geral" replace />} />
              <Route path="*" element={<Navigate to="/app/visao-geral" replace />} />
            </Routes>
          </HashRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
