import { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '@/app/App'
import i18n from '@/i18n'
import { LOGGED_IN, message, mockApi, openChat } from '@/test/mockApi'

const renderApp = () => render(<App client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />)
const ADDRESS = 'team+c-k3x9abcd2345wxyz@example.com'
const posts = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith('/c1/email-address') && init?.method === 'POST')

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  document.cookie = 'csrf_token=test-token'
})

afterEach(() => vi.unstubAllGlobals())

test('the email section is hidden when the bridge is not configured', async () => {
  mockApi(LOGGED_IN) // email-address answers 404
  renderApp()
  await openChat()
  expect(await screen.findByText('Bonjour !')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'E-mail' })).not.toBeInTheDocument()
})

test('create, copy and replace the conversation address', async () => {
  let address: string | null = null
  const fetchMock = mockApi({
    ...LOGGED_IN,
    'GET /conversations/c1/email-address': () => ({ status: 200, body: { address } }),
    'POST /conversations/c1/email-address': () => {
      address = address ? 'team+c-newnewnewnew2345@example.com' : ADDRESS
      return { status: 200, body: { address } }
    },
  })
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  renderApp()
  await openChat()

  const section = (await screen.findByRole('heading', { name: 'E-mail' })).closest('section')!
  await userEvent.click(within(section).getByRole('button', { name: 'Créer une adresse e-mail' }))
  expect(await within(section).findByText(ADDRESS)).toHaveAttribute('dir', 'ltr')

  await userEvent.click(within(section).getByRole('button', { name: "Copier l'adresse" }))
  expect(writeText).toHaveBeenCalledWith(ADDRESS)
  expect(await within(section).findByRole('button', { name: 'Adresse copiée' })).toBeInTheDocument()

  // Replacing asks for confirmation first.
  await userEvent.click(within(section).getByRole('button', { name: 'Nouvelle adresse' }))
  expect(within(section).getByText("L'adresse actuelle cessera de fonctionner immédiatement.")).toBeInTheDocument()
  await userEvent.click(within(section).getByRole('button', { name: 'Annuler' }))
  expect(posts(fetchMock)).toHaveLength(1)
  await userEvent.click(within(section).getByRole('button', { name: 'Nouvelle adresse' }))
  await userEvent.click(within(section).getByRole('button', { name: "Remplacer l'adresse" }))
  expect(await within(section).findByText('team+c-newnewnewnew2345@example.com')).toBeInTheDocument()
  expect(posts(fetchMock)).toHaveLength(2)
})

test('messages that came by email are labelled', async () => {
  mockApi({
    ...LOGGED_IN,
    'GET /conversations/c1/messages': {
      status: 200,
      body: { items: [message(1, 'Devis fournisseur\n\nVoici le devis.', 'u1', { via_email: true })], next_cursor: null },
    },
  })
  renderApp()
  await openChat()
  expect(await screen.findByText('par e-mail')).toBeInTheDocument()
})
