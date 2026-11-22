import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { vi } from 'vitest'

type Route = { status: number; body?: unknown }
export type Routes = Record<string, Route | (() => Route)>

/** Mock fetch by "METHOD /path" (path after /api/v1); a key ending in * matches a prefix. Unknown routes return 404. */
/** The app opens on the home page: open a person's chat from the people panel. */
export async function openChat(name: RegExp = /Amina Benali/) {
  const nav = await screen.findByRole('navigation', { name: 'Personnes' })
  await userEvent.click(await within(nav).findByRole('button', { name }))
}

export function mockApi(routes: Routes) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('/api/v1', '')
    const key = `${init?.method ?? 'GET'} ${path}`
    const prefix = Object.keys(routes).find((k) => k.endsWith('*') && key.startsWith(k.slice(0, -1)))
    const entry = routes[key] ?? (prefix ? routes[prefix] : undefined)
    const route = typeof entry === 'function' ? entry() : (entry ?? { status: 404 })
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), {
      status: route.status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export const ME = { id: 'me', email: 'me@example.com', display_name: 'Moi', locale: 'fr', role: 'employee', digest_hour: 8 }

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

export const task = (id: string, title: string, status: string, extra: object = {}) => ({
  id, title, description: '', status, priority: 'normal', position: 0, due_date: null, overdue: false,
  finished_at: null, creator_id: 'me', assignee_id: 'u1', conversation_id: `tc-${id}`, source_message_id: null,
  created_at: '2026-01-05T09:00:00Z', ...extra,
})

export const LOGGED_IN: Routes = {
  'GET /channels': { status: 200, body: [] },
  'GET /notifications': { status: 200, body: { items: [], unread: 0 } },
  'GET /reminders': { status: 200, body: [] },
  'GET /tasks?assignee_id=u1': {
    status: 200,
    body: [task('t1', 'Préparer le rapport', 'pending', { due_date: '2026-01-02', overdue: true }), task('t2', 'Relire', 'in_progress')],
  },
  'GET /tasks/counts?assignee_id=u1': { status: 200, body: { pending: 1, in_progress: 1, finished: 4 } },
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
