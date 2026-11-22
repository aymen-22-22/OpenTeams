import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '@/app/App'
import i18n from '@/i18n'
import { LOGGED_IN, mockApi, task, openChat } from '@/test/mockApi'

const renderApp = () => render(<App client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />)

const EVENTS = [
  { id: 'e1', type: 'meeting', title: 'Point projet', starts_at: '2026-01-07T09:00:00Z', ends_at: '2026-01-07T10:00:00Z', all_day: false,
    user_ids: ['me', 'u1'], task_id: null, creator_id: 'me', description: '', conversation_id: null },
  { id: 'task-due:t1', type: 'task_due', title: 'Facture', starts_at: '2026-01-15T00:00:00Z', ends_at: '2026-01-15T00:00:00Z', all_day: true,
    user_ids: ['me'], task_id: 't1', creator_id: null, description: '', conversation_id: null },
]

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 0, 6, 12))
  await i18n.changeLanguage('fr')
  document.cookie = 'csrf_token=test-token'
  history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function openCalendar() {
  await userEvent.click(await screen.findByRole('button', { name: 'Calendrier' }))
}

test('month view places events on their day, coloured by type', async () => {
  const fetchMock = mockApi({ ...LOGGED_IN, 'GET /calendar/events*': { status: 200, body: EVENTS }, 'GET /teams': { status: 200, body: [] } })
  renderApp()
  await openCalendar()
  const jan7 = (await screen.findByRole('button', { name: 'mercredi 7 janvier 2026' })).closest<HTMLElement>('[role=gridcell]')!
  expect(await within(jan7).findByRole('button', { name: /Point projet/ })).toBeInTheDocument()
  const jan15 = screen.getByRole('button', { name: 'jeudi 15 janvier 2026' }).closest<HTMLElement>('[role=gridcell]')!
  expect(within(jan15).getByRole('button', { name: 'Facture' })).toHaveClass('bg-red-100')
  const url = String(fetchMock.mock.calls.find(([u]) => String(u).includes('/calendar/events'))![0])
  expect(url).toContain('user_id=me') // "My calendar" by default
})

test('clicking a task event opens the task', async () => {
  mockApi({
    ...LOGGED_IN,
    'GET /calendar/events*': { status: 200, body: EVENTS },
    'GET /teams': { status: 200, body: [] },
    'GET /tasks/t1': { status: 200, body: task('t1', 'Facture', 'pending') },
    'GET /conversations/tc-t1': { status: 200, body: { id: 'tc-t1', type: 'task', title: 'Facture', member_ids: ['me'], last_message: null, unread_count: 0, last_read_seq: 0 } },
    'GET /conversations/tc-t1/messages': { status: 200, body: { items: [], next_cursor: null } },
    'GET /conversations/tc-t1/pins': { status: 200, body: [] },
    'GET /conversations/tc-t1/files': { status: 200, body: [] },
  })
  renderApp()
  await openCalendar()
  await userEvent.click(await screen.findByRole('button', { name: 'Facture' }))
  const dialog = screen.getByRole('dialog', { name: 'Facture' })
  expect(within(dialog).getByText('Échéance de tâche')).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Ouvrir la tâche' }))
  expect(await screen.findByRole('heading', { name: 'Facture' })).toBeInTheDocument()
})

test('create a meeting with attendees', async () => {
  const fetchMock = mockApi({
    ...LOGGED_IN,
    'GET /calendar/events*': { status: 200, body: [] },
    'GET /teams': { status: 200, body: [] },
    'POST /calendar/events': { status: 201, body: EVENTS[0] },
  })
  renderApp()
  await openCalendar()
  await userEvent.click(screen.getByRole('button', { name: 'Nouvelle réunion' }))
  const dialog = screen.getByRole('dialog', { name: 'Nouvelle réunion' })
  await userEvent.type(within(dialog).getByLabelText('Titre'), 'Point projet')
  await userEvent.click(within(dialog).getByLabelText('Amina Benali'))
  await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
  const body = JSON.parse(String(fetchMock.mock.calls.find(([u, init]) => String(u).endsWith('/calendar/events') && init?.method === 'POST')![1]!.body))
  expect(body).toMatchObject({ title: 'Point projet', attendee_ids: ['u1'], all_day: false })
  expect(new Date(body.starts_at).getHours()).toBe(10) // 10:00 local, sent with timezone
})

test('schedule a meeting from a chat invites its members', async () => {
  const fetchMock = mockApi({ ...LOGGED_IN, 'POST /calendar/events': { status: 201, body: EVENTS[0] } })
  renderApp()
  await openChat()
  await userEvent.click(await screen.findByRole('button', { name: 'Planifier une réunion' }))
  const dialog = screen.getByRole('dialog', { name: 'Nouvelle réunion' })
  expect(within(dialog).getByText('Les membres de cette conversation seront invités.')).toBeInTheDocument()
  await userEvent.type(within(dialog).getByLabelText('Titre'), 'Démo')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
  const body = JSON.parse(String(fetchMock.mock.calls.find(([u, init]) => String(u).endsWith('/calendar/events') && init?.method === 'POST')![1]!.body))
  expect(body.conversation_id).toBe('c1')
})

test('subscribe shows the private iCal link', async () => {
  mockApi({
    ...LOGGED_IN,
    'GET /calendar/events*': { status: 200, body: [] },
    'GET /teams': { status: 200, body: [] },
    'POST /calendar/feed': { status: 200, body: { url: 'https://team.example/api/v1/calendar/feed/abc.ics' } },
  })
  renderApp()
  await openCalendar()
  await userEvent.click(screen.getByRole('button', { name: "S'abonner (iCal)" }))
  expect(await screen.findByLabelText('Lien iCal privé')).toHaveValue('https://team.example/api/v1/calendar/feed/abc.ics')
})
