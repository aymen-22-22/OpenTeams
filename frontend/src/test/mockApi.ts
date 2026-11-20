import { vi } from 'vitest'

type Route = { status: number; body?: unknown }
export type Routes = Record<string, Route | (() => Route)>

/** Mock fetch by "METHOD /path" (path after /api/v1). Unknown routes return 404. */
export function mockApi(routes: Routes) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('/api/v1', '')
    const entry = routes[`${init?.method ?? 'GET'} ${path}`]
    const route = typeof entry === 'function' ? entry() : (entry ?? { status: 404 })
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), {
      status: route.status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export const ME = { id: 'me', email: 'me@example.com', display_name: 'Moi', locale: 'fr', role: 'employee' }

export const PEOPLE = [
  { id: 'me', display_name: 'Moi', role: 'employee', presence: 'online', ai_active: false },
  { id: 'u1', display_name: 'Amina Benali', role: 'manager', presence: 'online', ai_active: false },
  { id: 'u2', display_name: 'Lucas Martin', role: 'employee', presence: 'offline', ai_active: false },
]

export const LOGGED_IN: Routes = {
  'GET /users/me': { status: 200, body: ME },
  'GET /users': { status: 200, body: PEOPLE },
}
