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

export const message = (seq: number, body: string, author = 'u1', extra: object = {}) => ({
  id: `m${seq}`, seq, conversation_id: 'c1', author_id: author, body, reply_to_id: null,
  created_at: '2026-01-05T09:00:00Z', edited_at: null, deleted: false, ...extra,
})

const conversation = (id: string, other: string, unread = 0) => ({
  id, type: 'direct', title: null, member_ids: ['me', other], last_message: null, unread_count: unread, last_read_seq: 0,
})

export const LOGGED_IN: Routes = {
  'GET /users/me': { status: 200, body: ME },
  'GET /users': { status: 200, body: PEOPLE },
  'GET /conversations': { status: 200, body: [conversation('c1', 'u1'), conversation('c2', 'u2', 3)] },
  'POST /conversations/direct': { status: 200, body: conversation('c1', 'u1') },
  'GET /conversations/c1/messages': { status: 200, body: { items: [message(1, 'Bonjour !'), message(2, 'Salut', 'me')], next_cursor: null } },
  'GET /conversations/c1/pins': { status: 200, body: [] },
  'GET /conversations/c1/files': {
    status: 200,
    body: [
      { id: 'f1', conversation_id: 'c1', name: 'budget.xlsx', kind: 'spreadsheet', size: 10, current_version: 2, updated_at: '2026-01-05T09:00:00Z' },
      { id: 'f2', conversation_id: 'c1', name: 'rapport.pdf', kind: 'pdf', size: 10, current_version: 1, updated_at: '2026-01-05T09:00:00Z' },
    ],
  },
  'POST /conversations/c1/read': { status: 204 },
}
