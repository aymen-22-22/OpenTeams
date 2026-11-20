import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { useMe } from '@/features/auth/api'
import { LoginPage } from '@/features/auth/LoginPage'
import { usePresenceSocket } from '@/features/presence/usePresenceSocket'
import { AppShell } from '@/features/shell/AppShell'

function AuthGate() {
  const me = useMe()
  usePresenceSocket(Boolean(me.data))

  if (me.isPending) return null
  if (!me.data) return <LoginPage />
  return <AppShell me={me.data} />
}

export function App({ client = new QueryClient() }: { client?: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <AuthGate />
    </QueryClientProvider>
  )
}
