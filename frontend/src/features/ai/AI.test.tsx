import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '@/app/App'
import i18n from '@/i18n'
import { LOGGED_IN, mockApi } from '@/test/mockApi'

const renderApp = () => render(<App client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />)

const aiMsg = (id: string, role: 'user' | 'assistant', content: string) => ({
  id, role, content, provider: role === 'assistant' ? 'anthropic' : null, model: role === 'assistant' ? 'claude' : null,
  created_at: '2026-01-05T09:00:00Z',
})

const PROFILE = {
  active: true, provider: 'anthropic', model: 'claude-test', has_api_key: true, system_prompt: '', default_prompt: '',
  language: 'fr', tone: 'professional', length: 'medium', hours_start: null, hours_end: null, audience: 'owner_only',
  allowed_user_ids: [], allowed_team_ids: [], share_tasks: false, ready: true,
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  document.cookie = 'csrf_token=test-token'
})

afterEach(() => vi.unstubAllGlobals())

test('His AI tab: answers are labeled as AI and a notice says it is not the person', async () => {
  mockApi({
    ...LOGGED_IN,
    'GET /ai/u1/thread': { status: 200, body: { owner_id: 'u1', available: true, messages: [aiMsg('a', 'user', 'Où en est le rapport ?'), aiMsg('b', 'assistant', 'Il est en cours.')] } },
  })
  renderApp()
  await userEvent.click(await screen.findByRole('tab', { name: 'Son IA' }))
  expect(await screen.findByText('Il est en cours.')).toBeInTheDocument()
  expect(screen.getByText('IA de Amina Benali')).toBeInTheDocument()
  expect(screen.getByRole('note')).toHaveTextContent('Vous parlez à une IA, pas à Amina Benali.')
})

test('asking sends the question to that person AI', async () => {
  const fetchMock = mockApi({
    ...LOGGED_IN,
    'GET /ai/u1/thread': { status: 200, body: { owner_id: 'u1', available: true, messages: [] } },
    'POST /ai/u1/messages': { status: 201, body: aiMsg('c', 'assistant', 'Réponse') },
  })
  renderApp()
  await userEvent.click(await screen.findByRole('tab', { name: 'Son IA' }))
  await userEvent.type(await screen.findByLabelText("Demander à l'IA de Amina Benali…"), 'Bonjour{Enter}')
  const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/ai/u1/messages') && init?.method === 'POST')!
  expect(JSON.parse(String(call[1]!.body))).toEqual({ content: 'Bonjour' })
})

test('an AI not shared with me shows a clear message', async () => {
  mockApi({ ...LOGGED_IN, 'GET /ai/u1/thread': { status: 404, body: { error: { code: 'not_found' } } } })
  renderApp()
  await userEvent.click(await screen.findByRole('tab', { name: 'Son IA' }))
  expect(await screen.findByText("L'IA de Amina Benali n'est pas partagée avec vous.")).toBeInTheDocument()
})

test('provider errors are shown translated', async () => {
  mockApi({
    ...LOGGED_IN,
    'GET /ai/u1/thread': { status: 200, body: { owner_id: 'u1', available: true, messages: [] } },
    'POST /ai/u1/messages': { status: 429, body: { error: { code: 'ai_budget_exceeded' } } },
  })
  renderApp()
  await userEvent.click(await screen.findByRole('tab', { name: 'Son IA' }))
  await userEvent.type(await screen.findByLabelText("Demander à l'IA de Amina Benali…"), 'x{Enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent('Le budget quotidien de cette IA est atteint.')
})

test('settings never show the key and only send a new one when typed', async () => {
  const fetchMock = mockApi({
    ...LOGGED_IN,
    'GET /ai/profile': { status: 200, body: PROFILE },
    'PUT /ai/profile': { status: 200, body: { ...PROFILE, share_tasks: true } },
    'GET /teams': { status: 200, body: [] },
    'GET /ai/me/thread': { status: 200, body: { owner_id: 'me', available: true, messages: [] } },
  })
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: 'Mon assistant' }))
  await userEvent.click(await screen.findByRole('tab', { name: 'Réglages' }))
  const key = await screen.findByLabelText(/Clé API/)
  expect(key).toHaveValue('')
  expect(key).toHaveAttribute('placeholder', '•••••••• enregistrée')
  await userEvent.click(screen.getByLabelText('Mes tâches'))
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  const body = JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')![1]!.body))
  expect(body.api_key).toBeNull()
  expect(body.share_tasks).toBe(true)
  expect(body).not.toHaveProperty('has_api_key')
  expect(await screen.findByRole('status')).toHaveTextContent('Enregistré.')
})

test('the owner log shows who asked what', async () => {
  mockApi({
    ...LOGGED_IN,
    'GET /ai/profile': { status: 200, body: PROFILE },
    'GET /teams': { status: 200, body: [] },
    'GET /ai/me/thread': { status: 200, body: { owner_id: 'me', available: true, messages: [] } },
    'GET /ai/log': { status: 200, body: [{ caller_id: 'u2', messages: [aiMsg('x', 'user', 'Question de Lucas')] }] },
  })
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: 'Mon assistant' }))
  await userEvent.click(await screen.findByRole('tab', { name: 'Journal' }))
  const section = (await screen.findByRole('heading', { name: 'Lucas Martin' })).closest('section')!
  expect(within(section).getByText('Question de Lucas')).toBeInTheDocument()
})
