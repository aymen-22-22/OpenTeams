import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { App } from '@/app/App'
import i18n from '@/i18n'
import { LOGGED_IN, ME, mockApi } from '@/test/mockApi'

const renderApp = () => render(<App client={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />)
const ADMIN = { ...ME, role: 'admin' }
const user = (id: string, name: string, extra: object = {}) => ({
  id, email: `${id}@example.com`, display_name: name, role: 'employee', locale: 'fr', is_active: true, created_at: '2026-01-05T09:00:00Z', ...extra,
})
const USERS = [user('me', 'Moi', { role: 'admin' }), user('u1', 'Amina Benali', { role: 'manager' }), user('u2', 'Lucas Martin'), user('u3', 'Ancien', { is_active: false })]
const ROUTES = {
  ...LOGGED_IN,
  'GET /users/me': { status: 200, body: ADMIN },
  'GET /admin/users': { status: 200, body: USERS },
  'GET /teams': { status: 200, body: [{ id: 't1', name: 'Ventes', member_ids: ['u1'] }] },
}
const calls = (fetchMock: ReturnType<typeof mockApi>, method: string, path: string) =>
  fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith(path) && (init?.method ?? 'GET') === method)
const body = (fetchMock: ReturnType<typeof mockApi>, method: string, path: string) => JSON.parse(String(calls(fetchMock, method, path)[0][1]!.body))

async function openAdmin() {
  renderApp()
  const nav = await screen.findByRole('navigation', { name: 'Personnes' })
  await userEvent.click(await within(nav).findByRole('button', { name: 'Administration' }))
  return screen.findByRole('list', { name: 'Utilisateurs' })
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  document.cookie = 'csrf_token=test-token'
})

afterEach(() => vi.unstubAllGlobals())

test('only admins see the administration', async () => {
  mockApi(LOGGED_IN) // an employee
  renderApp()
  const nav = await screen.findByRole('navigation', { name: 'Personnes' })
  await within(nav).findByRole('button', { name: 'Accueil' })
  expect(within(nav).queryByRole('button', { name: 'Administration' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /Compte de/ }))
  expect(screen.queryByRole('menuitem', { name: 'Administration' })).not.toBeInTheDocument()
})

test('lists every account with role and status, and filters them', async () => {
  mockApi(ROUTES)
  const list = await openAdmin()
  expect(await within(list).findByText('Amina Benali')).toBeInTheDocument()
  expect(within(list).getAllByText('Manager').length).toBeGreaterThan(0)
  expect(within(list).getAllByText(/Désactivé/).length).toBeGreaterThan(0)
  expect(screen.getByText('3 comptes actifs')).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Rechercher un utilisateur'), 'lucas')
  expect(within(list).getByText('Lucas Martin')).toBeInTheDocument()
  expect(within(list).queryByText('Amina Benali')).not.toBeInTheDocument()
})

test('create an account with a generated password, shown once to hand over', async () => {
  const fetchMock = mockApi({ ...ROUTES, 'POST /admin/users': { status: 201, body: user('u9', 'Sara K', { email: 'sara@example.com' }) } })
  await openAdmin()
  await userEvent.click(screen.getByRole('button', { name: 'Nouvel utilisateur' }))
  const dialog = screen.getByRole('dialog', { name: 'Nouvel utilisateur' })
  await userEvent.type(within(dialog).getByLabelText('Nom'), 'Sara K')
  await userEvent.type(within(dialog).getByLabelText('E-mail'), 'sara@example.com')
  await userEvent.selectOptions(within(dialog).getByLabelText('Rôle'), 'manager')
  const password = (within(dialog).getByLabelText('Mot de passe') as HTMLInputElement).value
  expect(password).toMatch(/^[A-Za-z0-9]{16}$/)
  await userEvent.click(within(dialog).getByRole('button', { name: 'Créer le compte' }))
  expect(body(fetchMock, 'POST', '/admin/users')).toEqual({ display_name: 'Sara K', email: 'sara@example.com', role: 'manager', locale: 'fr', password })
  const done = await screen.findByRole('dialog', { name: 'Compte créé' })
  expect(within(done).getByText(password)).toBeInTheDocument()
})

test('duplicate email shows a translated error', async () => {
  mockApi({ ...ROUTES, 'POST /admin/users': { status: 409, body: { error: { code: 'email_taken', message: '' } } } })
  await openAdmin()
  await userEvent.click(screen.getByRole('button', { name: 'Nouvel utilisateur' }))
  const dialog = screen.getByRole('dialog', { name: 'Nouvel utilisateur' })
  await userEvent.type(within(dialog).getByLabelText('Nom'), 'Lucas')
  await userEvent.type(within(dialog).getByLabelText('E-mail'), 'u2@example.com')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Créer le compte' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Un compte existe déjà avec cet e-mail.')
})

test('edit: change role, reset the password, deactivate', async () => {
  const fetchMock = mockApi({ ...ROUTES, 'PATCH /admin/users/u2': { status: 200, body: user('u2', 'Lucas Martin', { role: 'manager' }) } })
  await openAdmin()
  await userEvent.click(await screen.findByRole('button', { name: 'Modifier Lucas Martin' }))
  let dialog = screen.getByRole('dialog', { name: 'Lucas Martin' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Réinitialiser le mot de passe' }))
  const password = (within(dialog).getByLabelText('Nouveau mot de passe') as HTMLInputElement).value
  await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer le mot de passe' }))
  expect(await within(dialog).findByRole('status')).toHaveTextContent(password)
  expect(body(fetchMock, 'PATCH', '/admin/users/u2')).toEqual({ new_password: password })

  await userEvent.selectOptions(within(dialog).getByLabelText('Rôle'), 'manager')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))
  await waitFor(() => expect(calls(fetchMock, 'PATCH', '/admin/users/u2')).toHaveLength(2))
  expect(JSON.parse(String(calls(fetchMock, 'PATCH', '/admin/users/u2')[1][1]!.body))).toEqual({ role: 'manager' })

  await userEvent.click(await screen.findByRole('button', { name: 'Modifier Lucas Martin' }))
  dialog = screen.getByRole('dialog', { name: 'Lucas Martin' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Désactiver le compte' }))
  await waitFor(() => expect(calls(fetchMock, 'PATCH', '/admin/users/u2')).toHaveLength(3))
  expect(JSON.parse(String(calls(fetchMock, 'PATCH', '/admin/users/u2')[2][1]!.body))).toEqual({ is_active: false })
})

test('an admin cannot change their own role or deactivate themselves', async () => {
  mockApi(ROUTES)
  await openAdmin()
  await userEvent.click(await screen.findByRole('button', { name: 'Modifier Moi' }))
  const dialog = screen.getByRole('dialog', { name: 'Moi' })
  expect(within(dialog).getByLabelText('Rôle')).toBeDisabled()
  expect(within(dialog).queryByRole('button', { name: 'Désactiver le compte' })).not.toBeInTheDocument()
})

test('teams: create, add and remove members, delete after confirmation', async () => {
  const fetchMock = mockApi({
    ...ROUTES,
    'POST /admin/teams': { status: 201, body: { id: 't2', name: 'Support', member_ids: [] } },
    'POST /admin/teams/t1/members': { status: 204 },
    'DELETE /admin/teams/t1/members/u1': { status: 204 },
    'DELETE /admin/teams/t1': { status: 204 },
  })
  await openAdmin()
  await userEvent.click(screen.getByRole('tab', { name: 'Équipes' }))
  await userEvent.type(screen.getByLabelText("Nom de l'équipe"), 'Support{Enter}')
  expect(body(fetchMock, 'POST', '/admin/teams')).toEqual({ name: 'Support' })

  const team = await screen.findByRole('region', { name: 'Ventes' })
  expect(within(team).getByText('1 membre')).toBeInTheDocument()
  await userEvent.selectOptions(within(team).getByLabelText('Ajouter un membre à Ventes'), 'u2')
  expect(body(fetchMock, 'POST', '/admin/teams/t1/members')).toEqual({ user_id: 'u2' })
  expect(within(within(team).getByLabelText('Ajouter un membre à Ventes')).queryByRole('option', { name: 'Ancien' })).not.toBeInTheDocument()
  await userEvent.click(within(team).getByRole('button', { name: 'Retirer Amina Benali de Ventes' }))
  expect(calls(fetchMock, 'DELETE', '/admin/teams/t1/members/u1')).toHaveLength(1)

  await userEvent.click(within(team).getByRole('button', { name: 'Supprimer Ventes' }))
  expect(calls(fetchMock, 'DELETE', '/admin/teams/t1')).toHaveLength(0) // asks first
  await userEvent.click(within(team).getByRole('button', { name: 'Supprimer' }))
  await waitFor(() => expect(calls(fetchMock, 'DELETE', '/admin/teams/t1')).toHaveLength(1))
})

const EMAIL = { host: '', port: 587, security: 'starttls', user: '', password_set: false, mail_from: '', source: 'env', env_host: 'mailpit' }

async function openEmailTab(extra: object = {}) {
  const fetchMock = mockApi({ ...ROUTES, 'GET /admin/email': { status: 200, body: EMAIL }, ...extra })
  await openAdmin()
  await userEvent.click(screen.getByRole('tab', { name: 'E-mail' }))
  await screen.findByRole('heading', { name: "Serveur d'envoi (SMTP)" })
  return fetchMock
}

test('SMTP settings: saved without echoing the password back', async () => {
  const saved = { ...EMAIL, host: 'smtp.sdg.dz', port: 465, security: 'ssl', user: 'notify@sdg.dz', password_set: true, mail_from: 'SDG <notify@sdg.dz>', source: 'admin' }
  const fetchMock = await openEmailTab({ 'PUT /admin/email': { status: 200, body: saved } })
  expect(screen.getByText('Réglages du serveur (.env) utilisés : mailpit')).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Serveur'), 'smtp.sdg.dz')
  await userEvent.selectOptions(screen.getByLabelText('Sécurité'), 'ssl')
  expect(screen.getByLabelText('Port')).toHaveValue(465) // port follows the security choice
  await userEvent.type(screen.getByLabelText('Utilisateur'), 'notify@sdg.dz')
  await userEvent.type(screen.getByLabelText('Mot de passe'), 'secret-pass')
  await userEvent.type(screen.getByLabelText('Expéditeur'), 'SDG <notify@sdg.dz>')
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  await waitFor(() => expect(calls(fetchMock, 'PUT', '/admin/email')).toHaveLength(1))
  expect(body(fetchMock, 'PUT', '/admin/email')).toEqual({ host: 'smtp.sdg.dz', port: 465, security: 'ssl', user: 'notify@sdg.dz', mail_from: 'SDG <notify@sdg.dz>', password: 'secret-pass' })
  expect(await screen.findByText('Réglages de cette page utilisés')).toBeInTheDocument()
  expect(screen.getByLabelText('Mot de passe')).toHaveValue('') // never shown again
  expect(screen.getByText(/Mot de passe enregistré \(chiffré\)/)).toBeInTheDocument()
})

test('saving again without typing a password keeps the saved one', async () => {
  const fetchMock = await openEmailTab({
    'GET /admin/email': { status: 200, body: { ...EMAIL, host: 'smtp.sdg.dz', password_set: true, source: 'admin' } },
    'PUT /admin/email': { status: 200, body: { ...EMAIL, host: 'smtp.sdg.dz', password_set: true, source: 'admin' } },
  })
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
  await waitFor(() => expect(calls(fetchMock, 'PUT', '/admin/email')).toHaveLength(1))
  expect(body(fetchMock, 'PUT', '/admin/email')).not.toHaveProperty('password')
})

test('test email: success and a clear reason on failure', async () => {
  let fail = false
  const fetchMock = await openEmailTab({
    'POST /admin/email/test': () => (fail
      ? { status: 502, body: { error: { code: 'smtp_failed', message: '', details: { reason: 'auth', code: 535 } } } }
      : { status: 204 }),
  })
  const to = screen.getByLabelText('Destinataire du test')
  expect(to).toHaveValue('me@example.com') // my own address by default
  await userEvent.click(screen.getByRole('button', { name: 'Envoyer un test' }))
  expect(await screen.findByText(/E-mail envoyé à me@example.com/)).toBeInTheDocument()
  expect(body(fetchMock, 'POST', '/admin/email/test')).toEqual({ to: 'me@example.com' })
  fail = true
  await userEvent.click(screen.getByRole('button', { name: 'Envoyer un test' }))
  expect(await screen.findByRole('alert')).toHaveTextContent("Le serveur a refusé l'identifiant ou le mot de passe.")
})

const DESIGN = {
  'GET /admin/email/branding': { status: 200, body: { name: '', color: '', footer: '', has_logo: false } },
  'GET /admin/email/texts': {
    status: 200,
    body: {
      defaults: { task: { fr: { subject: 'Tâche', intro: '' }, en: { subject: 'Task', intro: '' }, ar: { subject: 'مهمة', intro: '' } } },
      overrides: {},
    },
  },
  'POST /admin/email/preview': { status: 200, body: { subject: 'Tâche : Préparer le rapport mensuel', html: '<p>aperçu</p>', text: 'aperçu' } },
}

test('appearance: live preview of unsaved changes, then save', async () => {
  const fetchMock = await openEmailTab({ ...DESIGN, 'PUT /admin/email/branding': { status: 200, body: { name: 'SDG Consulting', color: '#1d4ed8', footer: 'Alger', has_logo: false } } })
  expect(await screen.findByText('Tâche : Préparer le rapport mensuel')).toBeInTheDocument()
  expect(screen.getByTitle('Aperçu')).toHaveAttribute('sandbox', '') // email HTML runs nothing
  await userEvent.type(screen.getByLabelText('Nom affiché'), 'SDG Consulting')
  await userEvent.type(screen.getByLabelText('Couleur (code hexadécimal)'), '#1d4ed8')
  await userEvent.type(screen.getByLabelText('Ligne de pied de page'), 'Alger')
  await waitFor(() => {
    const last = calls(fetchMock, 'POST', '/admin/email/preview').at(-1)!
    expect(JSON.parse(String(last[1]!.body))).toMatchObject({ kind: 'task', lang: 'fr', branding: { name: 'SDG Consulting', color: '#1d4ed8', footer: 'Alger' } })
  })
  const appearance = screen.getByRole('region', { name: 'Apparence des e-mails' })
  await userEvent.click(within(appearance).getByRole('button', { name: 'Enregistrer' }))
  await waitFor(() => expect(body(fetchMock, 'PUT', '/admin/email/branding')).toEqual({ name: 'SDG Consulting', color: '#1d4ed8', footer: 'Alger' }))
})

test('wording per type and language, with defaults as placeholders', async () => {
  const fetchMock = await openEmailTab({ ...DESIGN, 'PUT /admin/email/texts': { status: 200, body: DESIGN['GET /admin/email/texts'].body } })
  const wording = await screen.findByRole('region', { name: 'Textes des e-mails' })
  const label = within(wording).getByLabelText("Libellé (début de l'objet)")
  expect(label).toHaveAttribute('placeholder', 'Tâche')
  await userEvent.type(label, 'Mission')
  await userEvent.type(within(wording).getByLabelText("Paragraphe d'introduction"), 'Bonjour')
  await userEvent.selectOptions(within(wording).getByLabelText('Langue'), 'ar')
  expect(within(wording).getByLabelText("Libellé (début de l'objet)")).toHaveAttribute('dir', 'rtl')
  await userEvent.click(within(wording).getByRole('button', { name: 'Enregistrer' }))
  await waitFor(() => expect(body(fetchMock, 'PUT', '/admin/email/texts')).toEqual({ task: { fr: { subject: 'Mission', intro: 'Bonjour' } } }))
})

test('send the previewed example to an address', async () => {
  const fetchMock = await openEmailTab({ ...DESIGN, 'POST /admin/email/test': { status: 204 } })
  const preview = await screen.findByRole('region', { name: 'Aperçu' })
  await userEvent.click(within(preview).getByRole('button', { name: 'Envoyer cet exemple' }))
  await waitFor(() => expect(body(fetchMock, 'POST', '/admin/email/test')).toEqual({ to: 'me@example.com', kind: 'task', lang: 'fr' }))
})
