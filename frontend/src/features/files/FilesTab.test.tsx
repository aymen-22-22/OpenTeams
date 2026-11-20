import { QueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '@/app/App'
import i18n from '@/i18n'
import { LOGGED_IN, mockApi } from '@/test/mockApi'

const renderApp = () => render(<App client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />)

/** Fake XHR: records the request and answers with the given status/body. */
class FakeXHR {
  static last: FakeXHR
  static reply = { status: 201, body: {} as unknown }
  headers: Record<string, string> = {}
  url = ''
  body: unknown
  status = 0
  responseText = ''
  withCredentials = false
  upload = { onprogress: null as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  open(_method: string, url: string) {
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }
  send(body: unknown) {
    FakeXHR.last = this
    this.body = body
    this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 })
    setTimeout(() => {
      this.status = FakeXHR.reply.status
      this.responseText = JSON.stringify(FakeXHR.reply.body)
      this.onload?.()
    })
  }
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  document.cookie = 'csrf_token=test-token'
  vi.stubGlobal('XMLHttpRequest', FakeXHR)
})

afterEach(() => vi.unstubAllGlobals())

async function openFilesTab() {
  await userEvent.click(await screen.findByRole('tab', { name: 'Fichiers' }))
}

test('files are shown as icons only, with name and version on hover', async () => {
  mockApi(LOGGED_IN)
  renderApp()
  await openFilesTab()
  const tiles = await screen.findAllByRole('button', { name: 'budget.xlsx' })
  expect(tiles[0]).toHaveAttribute('title', 'budget.xlsx (v2)')
  expect(screen.queryByText('budget.xlsx')).not.toBeInTheDocument()
})

test('uploads the raw file with name, CSRF token and cookies', async () => {
  FakeXHR.reply = { status: 201, body: { id: 'f3' } }
  const fetchMock = mockApi(LOGGED_IN)
  renderApp()
  await openFilesTab()
  const file = new File(['hello'], 'notes été.txt', { type: 'text/plain' })
  await userEvent.upload(screen.getByLabelText('Ajouter des fichiers', { selector: 'input' }), file)

  expect(FakeXHR.last.url).toBe('/api/v1/conversations/c1/files')
  expect(FakeXHR.last.body).toBe(file)
  expect(FakeXHR.last.headers['X-File-Name']).toBe(encodeURIComponent('notes été.txt'))
  expect(FakeXHR.last.headers['X-CSRF-Token']).toBe('test-token')
  expect(FakeXHR.last.withCredentials).toBe(true)
  // the list is refreshed after the upload
  await vi.waitFor(() =>
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/c1/files')).length).toBeGreaterThan(1),
  )
})

test('shows a translated error when the type is refused', async () => {
  FakeXHR.reply = { status: 415, body: { error: { code: 'type_not_allowed', message: 'x' } } }
  mockApi(LOGGED_IN)
  renderApp()
  await openFilesTab()
  await userEvent.upload(
    screen.getByLabelText('Ajouter des fichiers', { selector: 'input' }),
    new File(['x'], 'virus.exe'),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('Type de fichier non autorisé.')
})

test('clicking a file asks for a signed link and downloads it', async () => {
  const assign = vi.fn()
  vi.stubGlobal('location', { ...window.location, assign })
  mockApi({ ...LOGGED_IN, 'GET /files/f2/download-url': { status: 200, body: { url: '/api/v1/files/download?token=t', expires_in: 300 } } })
  renderApp()
  await openFilesTab()
  await userEvent.click((await screen.findAllByRole('button', { name: 'rapport.pdf' }))[0])
  await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/api/v1/files/download?token=t'))
})
