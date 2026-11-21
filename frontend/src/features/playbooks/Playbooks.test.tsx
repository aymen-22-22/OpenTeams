import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '@/app/App'
import i18n from '@/i18n'
import { LOGGED_IN, ME, mockApi } from '@/test/mockApi'

const renderApp = () => render(<App client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />)

const PLAYBOOK = {
  id: 'p1', owner_id: 'me', name: 'Rapport hebdo', kind: 'weekly_report', enabled: true, frequency: 'weekly',
  weekday: 0, day_of_month: 1, hour: 8, scope_user_ids: [], recipient_ids: ['u1'], deliver_in_app: true,
  deliver_email: false, approval_required: true, use_ai: false, instructions: '', next_run_at: '2026-01-12T07:00:00Z',
}

const RUN = {
  id: 'r1', playbook_id: 'p1', trigger: 'manual', status: 'awaiting_approval', period_start: '2026-01-05T00:00:00Z',
  period_end: '2026-01-12T07:00:00Z', inputs: { counts: { finished: 1 }, ai: false }, recipient_ids: ['u1'],
  tokens: 0, cost: 0, duration_ms: 120, attempts: 1, error: null, created_at: '2026-01-12T07:00:00Z',
}

const MANAGER = { 'GET /users/me': { status: 200, body: { ...ME, role: 'manager' } } }

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  document.cookie = 'csrf_token=test-token'
  history.replaceState(null, '', '/')
})

afterEach(() => vi.unstubAllGlobals())

test('create a weekly report playbook', async () => {
  const fetchMock = mockApi({
    ...LOGGED_IN, ...MANAGER,
    'GET /playbooks': { status: 200, body: [] },
    'POST /playbooks': { status: 201, body: PLAYBOOK },
  })
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: 'Playbooks' }))
  await userEvent.click(screen.getByRole('button', { name: 'Nouveau playbook' }))
  await userEvent.clear(screen.getByLabelText('Nom'))
  await userEvent.type(screen.getByLabelText('Nom'), 'Rapport hebdo')
  const recipients = screen.getByRole('group', { name: 'Destinataires (vide = moi)' })
  await userEvent.click(within(recipients).getByLabelText('Amina Benali'))
  await userEvent.click(screen.getByLabelText('Je valide avant l\'envoi'))
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  const body = JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/playbooks') && init?.method === 'POST')![1]!.body))
  expect(body).toMatchObject({ name: 'Rapport hebdo', kind: 'weekly_report', recipient_ids: ['u1'], approval_required: true })
})

test('employees cannot pick recipients or the Monday summary', async () => {
  mockApi({ ...LOGGED_IN, 'GET /playbooks': { status: 200, body: [] } })
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: 'Playbooks' }))
  await userEvent.click(screen.getByRole('button', { name: 'Nouveau playbook' }))
  expect(screen.queryByRole('group', { name: /Destinataires/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'Résumé du lundi' })).not.toBeInTheDocument()
})

test('run now and see the history', async () => {
  const fetchMock = mockApi({
    ...LOGGED_IN, ...MANAGER,
    'GET /playbooks': { status: 200, body: [PLAYBOOK] },
    'GET /playbooks/p1/runs': { status: 200, body: [RUN] },
    'POST /playbooks/p1/run': { status: 201, body: RUN },
  })
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: 'Playbooks' }))
  await userEvent.click(await screen.findByRole('button', { name: /Rapport hebdo/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Exécuter maintenant' }))
  expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/playbooks/p1/run') && init?.method === 'POST')).toBe(true)
  expect(await screen.findByText('En attente de validation')).toBeInTheDocument()
})

test('the owner approves a waiting report', async () => {
  history.replaceState(null, '', '/reports/r1')
  const fetchMock = mockApi({
    ...LOGGED_IN, ...MANAGER,
    'GET /playbooks/runs/r1': { status: 200, body: { run: RUN, playbook_name: 'Rapport hebdo', is_owner: true, reports: { u1: 'Terminées (1)\n- Rapport Q1' } } },
    'POST /playbooks/runs/r1/approve': { status: 200, body: { ...RUN, status: 'delivered' } },
  })
  renderApp()
  expect(await screen.findByText(/Rapport Q1/)).toBeInTheDocument()
  expect(screen.getByText('Pour Amina Benali')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Approuver et envoyer' }))
  expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith('/runs/r1/approve') && init?.method === 'POST')).toBe(true)
})

test('a recipient sees only the report, without approval buttons', async () => {
  history.replaceState(null, '', '/reports/r1')
  mockApi({
    ...LOGGED_IN,
    'GET /playbooks/runs/r1': { status: 200, body: { run: { ...RUN, status: 'delivered' }, playbook_name: 'Rapport hebdo', is_owner: false, reports: { me: 'Vos tâches ouvertes (0)' } } },
  })
  renderApp()
  expect(await screen.findByText('Vos tâches ouvertes (0)')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Approuver et envoyer' })).not.toBeInTheDocument()
})
