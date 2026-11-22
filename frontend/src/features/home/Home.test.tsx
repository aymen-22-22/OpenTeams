import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '@/app/App'
import i18n from '@/i18n'
import { LOGGED_IN, message, mockApi, task } from '@/test/mockApi'

const renderApp = () => render(<App client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />)
const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString()

const HOME = {
  ...LOGGED_IN,
  'GET /conversations': {
    status: 200,
    body: [
      { id: 'c2', type: 'direct', title: null, member_ids: ['me', 'u2'], last_message: message(9, 'Tu as vu le devis ?', 'u2', { conversation_id: 'c2' }), unread_count: 2, last_read_seq: 0 },
      { id: 'ch1', type: 'channel', title: 'général', member_ids: ['me', 'u1'], last_message: message(10, 'Réunion à 14h', 'u1'), unread_count: 1, last_read_seq: 0 },
      { id: 'c1', type: 'direct', title: null, member_ids: ['me', 'u1'], last_message: null, unread_count: 0, last_read_seq: 0 },
    ],
  },
  'GET /tasks?assignee_id=me': {
    status: 200,
    body: [
      task('t1', 'Rapport mensuel', 'pending', { due_date: '2026-01-02', overdue: true, assignee_id: 'me' }),
      task('t2', 'Relire le contrat', 'in_progress', { due_date: soon(2), assignee_id: 'me' }),
      task('t3', 'Plus tard', 'pending', { due_date: soon(30), assignee_id: 'me' }),
      task('t4', 'Déjà fini', 'finished', { due_date: soon(1), assignee_id: 'me' }),
    ],
  },
  'GET /calendar/events*': {
    status: 200,
    body: [{ id: 'e1', type: 'meeting', title: 'Point équipe', starts_at: at(1), ends_at: at(2), all_day: false, user_ids: ['me'], task_id: null, creator_id: 'u1', description: '', conversation_id: null }],
  },
  'GET /requests?box=to_approve': {
    status: 200,
    body: [{ id: 'r1', requester_id: 'u2', approver_id: 'me', kind: 'leave', title: 'Congés de printemps', comment: '', details: {}, status: 'pending', decided_at: null, decision_comment: '', created_at: '2026-01-05T09:00:00Z', steps: [] }],
  },
  'GET /tasks/t1': { status: 200, body: task('t1', 'Rapport mensuel', 'pending', { assignee_id: 'me' }) },
  'GET /conversations/tc-t1': { status: 200, body: { id: 'tc-t1', type: 'task', title: 'Rapport mensuel', member_ids: ['me'], last_message: null, unread_count: 0, last_read_seq: 0 } },
  'GET /conversations/tc-t1/messages': { status: 200, body: { items: [], next_cursor: null } },
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  document.cookie = 'csrf_token=test-token'
})

afterEach(() => vi.unstubAllGlobals())

test('home greets me and sums up what needs attention', async () => {
  mockApi(HOME)
  renderApp()
  expect(await screen.findByRole('heading', { level: 1, name: /Moi$/ })).toBeInTheDocument()
  expect(await screen.findByText('3 messages non lus')).toBeInTheDocument()
  expect(screen.getByText('1 tâche en retard')).toHaveClass('text-danger')
  expect(await screen.findByText('1 demande à valider')).toBeInTheDocument()
})

test('unread conversations open from the home page', async () => {
  mockApi(HOME)
  renderApp()
  const toRead = await screen.findByRole('region', { name: 'À lire' })
  expect(await within(toRead).findByText('général')).toBeInTheDocument()
  const lucas = await within(toRead).findByRole('button', { name: /Lucas Martin/ })
  expect(within(lucas).getByText('Tu as vu le devis ?')).toBeInTheDocument()
  expect(within(lucas).getByLabelText('2 non lus')).toBeInTheDocument()
  await userEvent.click(lucas)
  expect(await screen.findByRole('tab', { name: 'Son IA' })).toBeInTheDocument()
})

test('tasks due: overdue first, this week only, finished ones hidden', async () => {
  mockApi(HOME)
  renderApp()
  const card = await screen.findByRole('region', { name: 'Mes tâches à échéance' })
  const items = await within(card).findAllByRole('button', { name: /Rapport mensuel|Relire le contrat/ })
  expect(items.map((b) => b.textContent)).toEqual([expect.stringMatching(/Rapport mensuel.*En retard/), expect.stringMatching(/Relire le contrat/)])
  expect(within(card).queryByText('Plus tard')).not.toBeInTheDocument()
  expect(within(card).queryByText('Déjà fini')).not.toBeInTheDocument()
  await userEvent.click(items[0])
  expect(await screen.findByRole('heading', { name: 'Rapport mensuel' })).toBeInTheDocument()
})

test('agenda and approvals', async () => {
  mockApi(HOME)
  renderApp()
  const agenda = await screen.findByRole('region', { name: "Aujourd'hui et demain" })
  expect(await within(agenda).findByText('Point équipe')).toBeInTheDocument()
  const approvals = await screen.findByRole('region', { name: 'À valider' })
  expect(within(approvals).getByText('Congés de printemps')).toBeInTheDocument()
  await userEvent.click(within(approvals).getByRole('button', { name: /Congés de printemps/ }))
  expect(await screen.findByRole('heading', { name: 'Demandes' })).toBeInTheDocument()
})

test('a quiet day shows friendly empty states and no approvals card', async () => {
  mockApi({ ...LOGGED_IN, 'GET /conversations': { status: 200, body: [] }, 'GET /tasks?assignee_id=me': { status: 200, body: [] } })
  renderApp()
  expect(await screen.findByText('Tout est à jour. Bonne journée !')).toBeInTheDocument()
  expect(screen.getByText('Vous avez tout lu.')).toBeInTheDocument()
  expect(await screen.findByText('Aucune tâche à échéance cette semaine.')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'À valider' })).not.toBeInTheDocument()
})
