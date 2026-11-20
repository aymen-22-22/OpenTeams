import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '@/app/App'
import i18n from '@/i18n'
import { LOGGED_IN, message, mockApi, task } from '@/test/mockApi'

const renderApp = () => render(<App client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />)

const TASK_ROUTES = {
  'GET /tasks/t1': { status: 200, body: task('t1', 'Valider la facture', 'pending') },
  'GET /conversations/tc-t1': {
    status: 200,
    body: { id: 'tc-t1', type: 'task', title: 'Valider la facture', member_ids: ['me', 'u1'], last_message: null, unread_count: 0, last_read_seq: 0 },
  },
  'GET /conversations/tc-t1/messages': { status: 200, body: { items: [message(9, 'Dans la tâche')], next_cursor: null } },
  'GET /conversations/tc-t1/pins': { status: 200, body: [] },
  'GET /conversations/tc-t1/files': { status: 200, body: [] },
}

const NOTIFICATION = {
  id: 'n1', type: 'task', title: 'Valider la facture', body: 'Amina', link: '/tasks/t1', read_at: null, created_at: '2026-01-05T09:00:00Z',
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  document.cookie = 'csrf_token=test-token'
  history.replaceState(null, '', '/')
})

afterEach(() => vi.unstubAllGlobals())

test('the bell shows unread notifications and opens the linked task', async () => {
  const fetchMock = mockApi({
    ...LOGGED_IN,
    ...TASK_ROUTES,
    'GET /notifications': { status: 200, body: { items: [NOTIFICATION], unread: 1 } },
    'POST /notifications/n1/read': { status: 204 },
  })
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: 'Notifications (1 non lues)' }))
  const panel = screen.getByRole('dialog', { name: 'Notifications' })
  expect(within(panel).getByText('Tâche')).toBeInTheDocument()
  await userEvent.click(within(panel).getByRole('button', { name: /Valider la facture/ }))
  expect(await screen.findByText('Dans la tâche')).toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/notifications/n1/read') && init?.method === 'POST')).toBe(true)
})

test('reminders appear in the side panel', async () => {
  mockApi({
    ...LOGGED_IN,
    'GET /reminders': { status: 200, body: [{ id: 'r1', title: 'Appeler le client', remind_at: '2026-01-05T10:00:00Z', recurrence: 'weekly', target_type: null, target_id: null, active: true }] },
  })
  renderApp()
  const side = await screen.findByRole('complementary')
  expect(await within(side).findByText('Appeler le client')).toBeInTheDocument()
  expect(within(side).getByText(/Chaque semaine/)).toBeInTheDocument()
})

test('remind me on a message creates a reminder attached to it', async () => {
  const fetchMock = mockApi({
    ...LOGGED_IN,
    'POST /reminders': { status: 201, body: { id: 'r2' } },
  })
  renderApp()
  await screen.findByText('Bonjour !')
  await userEvent.click(screen.getAllByRole('button', { name: 'Me le rappeler' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Nouveau rappel' })
  expect(within(dialog).getByLabelText('Rappel')).toHaveValue('Bonjour !')
  await userEvent.selectOptions(within(dialog).getByLabelText('Répéter'), 'daily')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Créer le rappel' }))
  const body = JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/reminders') && init?.method === 'POST')![1]!.body))
  expect(body).toMatchObject({ title: 'Bonjour !', recurrence: 'daily', target_type: 'message', target_id: 'm1' })
  expect(body.remind_at).toMatch(/Z$/) // sent with timezone (UTC)
})

test('notification preferences can be changed', async () => {
  const prefs = ['message', 'reminder', 'file', 'task', 'approval'].map((type) => ({ type, in_app: true, email: type !== 'message' }))
  const fetchMock = mockApi({
    ...LOGGED_IN,
    'GET /notifications/preferences': { status: 200, body: prefs },
    'PUT /notifications/preferences': { status: 200, body: prefs },
  })
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Préférences de notification' }))
  await userEvent.click(await screen.findByLabelText('Nouveau message — E-mail'))
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  const body = JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')![1]!.body))
  expect(body[0]).toEqual({ type: 'message', in_app: true, email: true })
})

test('a deep link from an email opens the task', async () => {
  history.replaceState(null, '', '/tasks/t1')
  mockApi({ ...LOGGED_IN, ...TASK_ROUTES })
  renderApp()
  expect(await screen.findByText('Dans la tâche')).toBeInTheDocument()
  expect(location.pathname).toBe('/')
})
