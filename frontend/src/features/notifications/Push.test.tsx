import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '@/app/App'
import i18n from '@/i18n'
import { LOGGED_IN, mockApi } from '@/test/mockApi'

import { disablePush } from './push'

const renderApp = () => render(<App client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />)
const PUBLIC_KEY = 'BN3lVMhf1haDx66qbrN8YR7h3GQg_HMXySboOOMJDc4irVUt5tF2OMFFJgMbNGEgmNxW7hfUCejANHE9r7ck334'
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc'
const PREFS = ['message', 'file'].map((type) => ({ type, in_app: true, email: false, email_frequency: 'instant', push: type === 'message' }))

/** A browser with service workers and the Push API, fully under the test's control. */
function fakeBrowser({ permission = 'default' as NotificationPermission, subscribed = false } = {}) {
  const state = { permission, subscription: null as null | typeof subscription }
  const subscription = {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p'.repeat(40), auth: 'a'.repeat(16) } }),
    unsubscribe: vi.fn(async () => { state.subscription = null; return true }),
  }
  if (subscribed) state.subscription = subscription
  const pushManager = {
    getSubscription: vi.fn(async () => state.subscription),
    subscribe: vi.fn(async () => { state.subscription = subscription; return subscription }),
  }
  const registration = { pushManager }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register: vi.fn(async () => registration), getRegistration: vi.fn(async () => registration), ready: Promise.resolve(registration) },
  })
  vi.stubGlobal('PushManager', function PushManager() {})
  vi.stubGlobal('Notification', {
    get permission() { return state.permission },
    requestPermission: vi.fn(async () => { state.permission = 'granted'; return 'granted' }),
  })
  return { pushManager, subscription }
}

const routes = (publicKey: string | null = PUBLIC_KEY) => ({
  ...LOGGED_IN,
  'GET /push/config': { status: 200, body: { public_key: publicKey } },
  'GET /notifications/preferences': { status: 200, body: PREFS },
  'PUT /notifications/preferences': { status: 200, body: PREFS },
  'POST /push/subscriptions': { status: 204 },
  'DELETE /push/subscriptions': { status: 204 },
  'POST /push/test': { status: 202, body: null }, // FastAPI sends "null"
})

async function openPreferences() {
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Préférences de notification' }))
}

const calls = (fetchMock: ReturnType<typeof mockApi>, method: string, path: string) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith(path) && init?.method === method)

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  document.cookie = 'csrf_token=test-token'
})

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

test('turn push on for this device, then send a test', async () => {
  const { pushManager } = fakeBrowser()
  const fetchMock = mockApi(routes())
  await openPreferences()
  expect(await screen.findByText(/Recevez une alerte sur ce navigateur/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Activer' }))

  await waitFor(() => expect(calls(fetchMock, 'POST', '/push/subscriptions')).toHaveLength(1))
  const options = pushManager.subscribe.mock.calls[0] as unknown as [PushSubscriptionOptionsInit]
  expect(options[0].userVisibleOnly).toBe(true)
  expect((options[0].applicationServerKey as Uint8Array).length).toBe(65) // decoded VAPID key
  const body = JSON.parse(String(calls(fetchMock, 'POST', '/push/subscriptions')[0][1]!.body))
  expect(body).toEqual({ endpoint: ENDPOINT, keys: { p256dh: 'p'.repeat(40), auth: 'a'.repeat(16) } })

  expect(await screen.findByRole('button', { name: 'Désactiver' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Envoyer un test' }))
  expect(await screen.findByText('Notification de test envoyée.')).toBeInTheDocument()
  expect(calls(fetchMock, 'POST', '/push/test')).toHaveLength(1)
})

test('turn push off removes the device on the server and in the browser', async () => {
  const { subscription } = fakeBrowser({ permission: 'granted', subscribed: true })
  const fetchMock = mockApi(routes())
  await openPreferences()
  await userEvent.click(await screen.findByRole('button', { name: 'Désactiver' }))
  await waitFor(() => expect(subscription.unsubscribe).toHaveBeenCalled())
  expect(JSON.parse(String(calls(fetchMock, 'DELETE', '/push/subscriptions')[0][1]!.body))).toEqual({ endpoint: ENDPOINT })
  expect(await screen.findByRole('button', { name: 'Activer' })).toBeInTheDocument()
})

test('a failed subscription is reported', async () => {
  const { pushManager } = fakeBrowser()
  pushManager.subscribe.mockRejectedValueOnce(new DOMException('push service error', 'AbortError'))
  mockApi(routes())
  await openPreferences()
  await userEvent.click(await screen.findByRole('button', { name: 'Activer' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("Impossible d'activer les notifications")
})

test('blocked or unsupported browsers get an explanation instead of a button', async () => {
  fakeBrowser({ permission: 'denied' })
  mockApi(routes())
  await openPreferences()
  expect(await screen.findByText(/bloquées pour ce site/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Activer' })).not.toBeInTheDocument()
})

test('on a browser without the Push API (iPhone not installed)', async () => {
  mockApi(routes())
  await openPreferences()
  expect(await screen.findByText(/ajoutez d'abord OpenTeams à l'écran d'accueil/)).toBeInTheDocument()
})

test('push column per type, hidden when the server has no push keys', async () => {
  fakeBrowser()
  const fetchMock = mockApi(routes())
  await openPreferences()
  const filePush = await screen.findByLabelText('Nouveau fichier — Push')
  expect(filePush).not.toBeChecked()
  expect(screen.getByLabelText('Nouveau message — Push')).toBeChecked()
  await userEvent.click(filePush)
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  await waitFor(() => expect(calls(fetchMock, 'PUT', '/notifications/preferences')).toHaveLength(1))
  const body = JSON.parse(String(calls(fetchMock, 'PUT', '/notifications/preferences')[0][1]!.body))
  expect(body[1]).toMatchObject({ type: 'file', push: true })
})

test('no push section or column when push is not configured', async () => {
  fakeBrowser()
  mockApi(routes(null))
  await openPreferences()
  expect(await screen.findByLabelText('Nouveau message — E-mail')).toBeInTheDocument()
  expect(screen.queryByText('Notifications sur cet appareil')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Nouveau message — Push')).not.toBeInTheDocument()
})

test('signing out stops push on this device', async () => {
  const { subscription } = fakeBrowser({ permission: 'granted', subscribed: true })
  const fetchMock = mockApi({ ...routes(), 'POST /auth/logout': { status: 204 } })
  await disablePush()
  expect(subscription.unsubscribe).toHaveBeenCalled()
  expect(calls(fetchMock, 'DELETE', '/push/subscriptions')).toHaveLength(1)
})
