import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '@/app/App'
import i18n from '@/i18n'
import { LOGGED_IN, ME, mockApi, task } from '@/test/mockApi'

const renderApp = () => render(<App client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />)

const PROJECT = {
  id: 'p1', name: 'Site web', description: 'Refonte', status: 'active', owner_id: 'me', start_date: null, due_date: '2026-03-01',
  finished_at: null, member_ids: ['me', 'u1'], counts: { pending: 1, in_progress: 0, finished: 1 }, can_edit: true,
}

const DETAIL = {
  ...PROJECT,
  milestones: [{ id: 'm1', title: 'Bêta', date: '2026-02-01', done: false }],
  tasks: [task('t1', 'Maquette', 'pending', { project_id: 'p1' }), task('t2', 'Cahier des charges', 'finished', { project_id: 'p1' })],
  files: [{ id: 'f1', conversation_id: 'tc-t1', name: 'maquette.png', kind: 'image', size: 1, current_version: 1, updated_at: '2026-01-05T09:00:00Z' }],
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  document.cookie = 'csrf_token=test-token'
  history.replaceState(null, '', '/')
})

afterEach(() => vi.unstubAllGlobals())

test('projects list shows progress and opens the project page', async () => {
  const fetchMock = mockApi({
    ...LOGGED_IN,
    'GET /projects': { status: 200, body: [PROJECT] },
    'GET /projects/p1': { status: 200, body: DETAIL },
    'PUT /projects/milestones/m1': { status: 200, body: { ...DETAIL.milestones[0], done: true } },
  })
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: 'Projets' }))
  await userEvent.click(await screen.findByRole('button', { name: /Site web.*1\/2 tâches terminées/ }))
  expect(await screen.findByRole('heading', { name: 'Site web' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Maquette' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'maquette.png' })).toBeInTheDocument() // file icon, no visible name
  await userEvent.click(screen.getByRole('checkbox', { name: /Bêta/ }))
  const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/projects/milestones/m1'))!
  expect(JSON.parse(String(call[1]!.body))).toMatchObject({ title: 'Bêta', done: true })
})

test('a new task can be linked to a project', async () => {
  const fetchMock = mockApi({
    ...LOGGED_IN,
    'GET /projects': { status: 200, body: [PROJECT] },
    'GET /projects/p1': { status: 200, body: DETAIL },
    'POST /tasks': { status: 201, body: task('t3', 'Tests', 'pending') },
  })
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: 'Projets' }))
  await userEvent.click(await screen.findByRole('button', { name: /Site web/ }))
  await userEvent.click(await screen.findByRole('button', { name: 'Nouvelle tâche' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByLabelText('Projet')).toHaveValue('p1')
  await userEvent.type(within(dialog).getByLabelText('Titre'), 'Tests')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Créer' }))
  const body = JSON.parse(String(fetchMock.mock.calls.find(([u, init]) => String(u).endsWith('/tasks') && init?.method === 'POST')![1]!.body))
  expect(body.project_id).toBe('p1')
})

test('manager dashboard shows workload, finished vs planned and delays', async () => {
  mockApi({
    ...LOGGED_IN,
    'GET /users/me': { status: 200, body: { ...ME, role: 'manager' } },
    'GET /teams': { status: 200, body: [] },
    'GET /dashboard?period=week': {
      status: 200,
      body: {
        period_start: '2026-01-05', period_end: '2026-01-11',
        people: [{ user_id: 'u1', display_name: 'Amina Benali', pending: 1, in_progress: 1, overdue: 1, planned: 2, finished_planned: 1, finished: 1 }],
        totals: { user_id: 'me', display_name: '', pending: 1, in_progress: 1, overdue: 1, planned: 2, finished_planned: 1, finished: 1 },
        delays: [{ task_id: 't1', title: 'Facture', assignee_id: 'u1', due_date: '2026-01-02', days_late: 3 }],
      },
    },
  })
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: 'Tableau de bord' }))
  const row = (await screen.findByRole('cell', { name: 'Amina Benali' })).closest('tr')!
  expect(within(row).getByLabelText('1 terminées sur 2 prévues')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Facture.*3 jours de retard/ })).toBeInTheDocument()
})
