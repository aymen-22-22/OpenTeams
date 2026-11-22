import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '@/app/App'
import i18n from '@/i18n'
import { LOGGED_IN, message, mockApi, task, openChat } from '@/test/mockApi'

const renderApp = () => render(<App client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />)

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  document.cookie = 'csrf_token=test-token'
})

afterEach(() => vi.unstubAllGlobals())

const TASK_CHAT = {
  'GET /tasks/t1': { status: 200, body: task('t1', 'Préparer le rapport', 'pending') },
  'GET /conversations/tc-t1': {
    status: 200,
    body: { id: 'tc-t1', type: 'task', title: 'Préparer le rapport', member_ids: ['me', 'u1'], last_message: null, unread_count: 0, last_read_seq: 0 },
  },
  'GET /conversations/tc-t1/messages': { status: 200, body: { items: [message(9, 'Discussion de la tâche')], next_cursor: null } },
  'GET /conversations/tc-t1/pins': { status: 200, body: [] },
  'GET /conversations/tc-t1/files': { status: 200, body: [] },
}

test('the Tasks tab shows the person board in three columns, overdue highlighted', async () => {
  mockApi(LOGGED_IN)
  renderApp()
  await openChat()
  await userEvent.click(await screen.findByRole('tab', { name: 'Tâches' }))
  const pending = await screen.findByRole('region', { name: 'En attente' })
  const card = within(pending).getByRole('button', { name: /^Préparer le rapport/ })
  expect(card).toHaveTextContent(/En retard de \d+ jours/)
  expect(within(screen.getByRole('region', { name: 'En cours' })).getByText('Relire')).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'Terminé' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Ajouter une tâche'])
})

test('side panel shows real task counts and opens the board', async () => {
  mockApi(LOGGED_IN)
  renderApp()
  await openChat()
  const side = await screen.findByRole('complementary')
  expect(await within(side).findByText('4')).toBeInTheDocument()
  await userEvent.click(within(side).getByRole('button', { name: 'Ouvrir le tableau' }))
  expect(screen.getByRole('tab', { name: 'Tâches' })).toHaveAttribute('aria-selected', 'true')
})

test('clicking a task opens its own task chat', async () => {
  mockApi({ ...LOGGED_IN, ...TASK_CHAT })
  renderApp()
  await openChat()
  await userEvent.click(await screen.findByRole('tab', { name: 'Tâches' }))
  await userEvent.click(await screen.findByRole('button', { name: /^Préparer le rapport/ }))
  expect(await screen.findByText('Discussion de la tâche')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Préparer le rapport' })).toBeInTheDocument()
})

test('create a task from a message', async () => {
  const fetchMock = mockApi({
    ...LOGGED_IN,
    ...TASK_CHAT,
    'POST /tasks': { status: 201, body: task('t1', 'Bonjour !', 'pending') },
  })
  renderApp()
  await openChat()
  await screen.findByText('Bonjour !')
  await userEvent.click(screen.getAllByRole('button', { name: 'Créer une tâche' })[0])
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByLabelText('Titre')).toHaveValue('Bonjour !')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Créer' }))

  const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/tasks') && init?.method === 'POST')!
  expect(JSON.parse(String(call[1]!.body))).toMatchObject({ title: 'Bonjour !', assignee_id: 'u1', source_message_id: 'm1' })
  expect(await screen.findByText('Discussion de la tâche')).toBeInTheDocument() // task chat opened
})

test('changing status from the task view moves the task', async () => {
  const fetchMock = mockApi({
    ...LOGGED_IN,
    ...TASK_CHAT,
    'POST /tasks/t1/move': { status: 200, body: task('t1', 'Préparer le rapport', 'finished') },
  })
  renderApp()
  await openChat()
  await userEvent.click(await screen.findByRole('tab', { name: 'Tâches' }))
  await userEvent.click(await screen.findByRole('button', { name: /^Préparer le rapport/ }))
  await userEvent.selectOptions(await screen.findByLabelText('Statut'), 'finished')
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/tasks/t1/move'))!
  expect(JSON.parse(String(call[1]!.body))).toEqual({ status: 'finished', after_id: null })
})

test('cards show relative due dates, chat activity and a description marker', async () => {
  const day = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  mockApi({
    ...LOGGED_IN,
    'GET /tasks?assignee_id=u1': {
      status: 200,
      body: [
        task('t1', 'Aujourd’hui', 'pending', { due_date: day(0) }),
        task('t2', 'Demain', 'pending', { due_date: day(1), message_count: 3, file_count: 1, description: 'Détails' }),
        task('t3', 'Bientôt', 'in_progress', { due_date: day(3), priority: 'high' }),
        task('t4', 'En retard', 'pending', { due_date: day(-2), overdue: true }),
      ],
    },
  })
  renderApp()
  await openChat()
  await userEvent.click(await screen.findByRole('tab', { name: 'Tâches' }))
  const card = async (name: RegExp) => screen.findByRole('button', { name })
  expect(await card(/^Aujourd’hui/)).toHaveTextContent("Aujourd'hui")
  const tomorrow = await card(/^Demain/)
  expect(within(tomorrow).getByText('3 messages')).toHaveClass('sr-only')
  expect(within(tomorrow).getByText('1 fichier')).toBeInTheDocument()
  expect(within(tomorrow).getByText('A une description')).toBeInTheDocument()
  expect(await card(/^Bientôt/)).toHaveTextContent(/Haute.*Dans 3 jours/)
  expect(await card(/^En retard/)).toHaveTextContent('En retard de 2 jours')
})

test('quick add creates a task in that column, for the board owner', async () => {
  const fetchMock = mockApi({ ...LOGGED_IN, 'POST /tasks': { status: 201, body: task('t9', 'Appeler le client', 'in_progress') } })
  renderApp()
  await openChat()
  await userEvent.click(await screen.findByRole('tab', { name: 'Tâches' }))
  const column = await screen.findByRole('region', { name: 'En cours' })
  await userEvent.click(within(column).getByRole('button', { name: 'Ajouter une tâche' }))
  const field = within(column).getByLabelText('Titre de la nouvelle tâche (En cours)')
  await userEvent.type(field, 'Appeler le client{Enter}')
  const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/tasks') && init?.method === 'POST')!
  expect(JSON.parse(String(call[1]!.body))).toEqual({ title: 'Appeler le client', status: 'in_progress', assignee_id: 'u1' })
  await waitFor(() => expect(field).toHaveValue('')) // stays open for the next one
  await userEvent.keyboard('{Escape}')
  expect(within(column).getByRole('button', { name: 'Ajouter une tâche' })).toBeInTheDocument()
})
