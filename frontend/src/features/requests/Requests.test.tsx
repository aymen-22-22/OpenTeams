import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '@/app/App'
import i18n from '@/i18n'
import { LOGGED_IN, ME, mockApi } from '@/test/mockApi'

const renderApp = () => render(<App client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />)

const REQUEST = {
  id: 'q1', requester_id: 'u2', approver_id: 'me', kind: 'leave', title: "Congés d'hiver", comment: 'Merci',
  details: { start_date: '2026-02-09', end_date: '2026-02-13', leave_type: 'paid' }, status: 'pending',
  decided_at: null, decision_comment: '', created_at: '2026-01-05T09:00:00Z', steps: [],
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  document.cookie = 'csrf_token=test-token'
  history.replaceState(null, '', '/')
})

afterEach(() => vi.unstubAllGlobals())

test('an employee submits a leave request', async () => {
  const fetchMock = mockApi({
    ...LOGGED_IN,
    'GET /requests?box=mine': { status: 200, body: [] },
    'GET /requests/approvers': { status: 200, body: [{ id: 'u1', display_name: 'Amina Benali' }] },
    'POST /requests': { status: 201, body: REQUEST },
  })
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: 'Demandes' }))
  expect(screen.queryByRole('tab', { name: 'À approuver' })).not.toBeInTheDocument() // employees have no inbox
  await userEvent.click(screen.getByRole('button', { name: 'Nouvelle demande' }))
  await userEvent.type(screen.getByLabelText('Titre'), "Congés d'hiver")
  await userEvent.type(screen.getByLabelText('Du'), '2026-02-09')
  await userEvent.type(screen.getByLabelText('Au'), '2026-02-13')
  await userEvent.click(await screen.findByRole('button', { name: 'Envoyer la demande' }))
  const body = JSON.parse(String(fetchMock.mock.calls.find(([u, init]) => String(u).endsWith('/requests') && init?.method === 'POST')![1]!.body))
  expect(body).toMatchObject({ kind: 'leave', title: "Congés d'hiver", approver_id: 'u1', start_date: '2026-02-09', end_date: '2026-02-13', leave_type: 'paid' })
})

test('a manager approves a request from the inbox', async () => {
  const fetchMock = mockApi({
    ...LOGGED_IN,
    'GET /users/me': { status: 200, body: { ...ME, role: 'manager' } },
    'GET /requests?box=to_approve': { status: 200, body: [REQUEST] },
    'GET /requests?box=mine': { status: 200, body: [] },
    'POST /requests/q1/approve': { status: 200, body: { ...REQUEST, status: 'approved' } },
  })
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: 'Demandes' }))
  const card = (await screen.findByText("Congés d'hiver")).closest('li')!
  expect(within(card).getByText(/Par Lucas Martin/)).toBeInTheDocument()
  await userEvent.type(within(card).getByLabelText('Commentaire (facultatif)'), 'Bonnes vacances')
  await userEvent.click(within(card).getByRole('button', { name: 'Approuver' }))
  const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/requests/q1/approve'))!
  expect(JSON.parse(String(call[1]!.body))).toEqual({ comment: 'Bonnes vacances' })
})

test('the dashboard entry is only shown to managers', async () => {
  mockApi(LOGGED_IN)
  renderApp()
  await screen.findByRole('button', { name: 'Demandes' })
  expect(screen.queryByRole('button', { name: 'Tableau de bord' })).not.toBeInTheDocument()
})
