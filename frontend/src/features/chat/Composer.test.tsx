import { QueryClient } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '@/app/App'
import i18n from '@/i18n'
import { LOGGED_IN, message, mockApi, openChat } from '@/test/mockApi'

const renderApp = () => render(<App client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />)

/** Fake upload: stores allowed files, refuses .exe like the server does. */
class FakeXHR {
  static sent: string[] = []
  headers: Record<string, string> = {}
  status = 0
  responseText = ''
  withCredentials = false
  upload = { onprogress: null as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  open() {}
  setRequestHeader(name: string, value: string) { this.headers[name] = value }
  send() {
    const name = decodeURIComponent(this.headers['X-File-Name'])
    FakeXHR.sent.push(name)
    this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 })
    setTimeout(() => {
      const refused = name.endsWith('.exe')
      this.status = refused ? 415 : 201
      this.responseText = JSON.stringify(refused
        ? { error: { code: 'type_not_allowed', message: '' } }
        : { id: 'f9', conversation_id: 'c1', name, kind: 'pdf', size: 3, current_version: 1, updated_at: '2026-01-05T09:00:00Z' })
      this.onload?.()
    })
  }
}

const sentBodies = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls
    .filter(([url, init]) => String(url).endsWith('/c1/messages') && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init!.body)).body)

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  document.cookie = 'csrf_token=test-token'
  FakeXHR.sent = []
  vi.stubGlobal('XMLHttpRequest', FakeXHR)
})

afterEach(() => vi.unstubAllGlobals())

const ROUTES = { ...LOGGED_IN, 'POST /conversations/c1/messages': { status: 201, body: message(3, 'ok', 'me') } }

test('attach files with the paperclip: uploaded on send, listed in the message', async () => {
  const fetchMock = mockApi(ROUTES)
  renderApp()
  await openChat()
  const pdf = new File(['abc'], 'devis.pdf', { type: 'application/pdf' })
  await userEvent.upload(screen.getByLabelText('Joindre des fichiers', { selector: 'input' }), pdf)
  const chips = screen.getByRole('list', { name: 'Fichiers à envoyer' })
  expect(within(chips).getByText('devis.pdf')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Envoyer' })).toBeEnabled() // a file alone can be sent
  await userEvent.type(screen.getByLabelText('Écrire un message…'), 'Voici le devis{Enter}')
  await waitFor(() => expect(sentBodies(fetchMock)).toEqual(['Voici le devis\n\n📎 devis.pdf']))
  expect(FakeXHR.sent).toEqual(['devis.pdf'])
  await waitFor(() => expect(screen.queryByRole('list', { name: 'Fichiers à envoyer' })).not.toBeInTheDocument())
})

test('a refused file stays with its error; the others are sent', async () => {
  const fetchMock = mockApi(ROUTES)
  renderApp()
  await openChat()
  await userEvent.upload(screen.getByLabelText('Joindre des fichiers', { selector: 'input' }), [
    new File(['a'], 'plan.pdf'),
    new File(['MZ'], 'setup.exe'),
  ])
  await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
  await waitFor(() => expect(sentBodies(fetchMock)).toEqual(['📎 plan.pdf']))
  const chips = await screen.findByRole('list', { name: 'Fichiers à envoyer' })
  expect(within(chips).getByText('Type de fichier non autorisé.')).toBeInTheDocument()
  await userEvent.click(within(chips).getByRole('button', { name: 'Retirer setup.exe' }))
  expect(screen.queryByRole('list', { name: 'Fichiers à envoyer' })).not.toBeInTheDocument()
})

test('files can be pasted or dropped into the chat', async () => {
  mockApi(ROUTES)
  renderApp()
  await openChat()
  const box = screen.getByLabelText('Écrire un message…')
  fireEvent.paste(box, { clipboardData: { files: [new File(['png'], 'capture.png', { type: 'image/png' })] } })
  expect(await screen.findByText('capture.png')).toBeInTheDocument()

  const chat = box.closest('form')!.parentElement!
  fireEvent.dragOver(chat, { dataTransfer: { types: ['Files'], files: [] } })
  expect(screen.getByText('Déposez les fichiers pour les joindre')).toBeInTheDocument()
  fireEvent.drop(chat, { dataTransfer: { types: ['Files'], files: [new File(['x'], 'notes.txt')] } })
  expect(await screen.findByText('notes.txt')).toBeInTheDocument()
  expect(screen.queryByText('Déposez les fichiers pour les joindre')).not.toBeInTheDocument()
})

test('the keyboard hint is shown under the box', async () => {
  mockApi(ROUTES)
  renderApp()
  await openChat()
  expect(screen.getByText('Entrée pour envoyer · Maj+Entrée pour aller à la ligne')).toBeInTheDocument()
})
