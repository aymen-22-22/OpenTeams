import { Check, Copy, KeyRound, Pencil, Plus, Search, Shield, Trash2, UserPlus, Users, X } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal, ModalActions } from '@/components/ui/modal'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Role } from '@/features/auth/api'
import { LANGUAGE_NAMES, LANGUAGES } from '@/i18n'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

import { generatePassword, useAdminUsers, useCreateUser, useTeamActions, useTeams, useUpdateUser, type AdminUser } from './api'

const ROLES: Role[] = ['employee', 'manager', 'admin']
const ROLE_TONE = { admin: 'danger', manager: 'accent', employee: 'neutral' } as const
const KNOWN_ERRORS = new Set(['email_taken', 'self_change', 'team_exists'])

function errorKey(error: unknown) {
  const code = error instanceof ApiError ? error.code : ''
  return `admin.errors.${KNOWN_ERRORS.has(code) ? code : 'failed'}`
}

/** Password field with "generate" and "copy": the admin hands it over, the user changes it later. */
function PasswordField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* still visible and selectable */ }
  }
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <span className="flex gap-1.5">
        <input id={id} required minLength={12} maxLength={256} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-hint`}
          className="field min-w-0 flex-1 font-mono" dir="ltr" autoComplete="new-password" spellCheck={false} />
        <Button type="button" variant="outline" onClick={() => onChange(generatePassword())}>{t('admin.generate')}</Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => void copy()} disabled={!value}
          aria-label={copied ? t('bridge.copied') : t('admin.copyPassword')}>
          {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        </Button>
      </span>
      <span id={`${id}-hint`} className="text-xs text-muted-foreground">{t('admin.passwordHint')}</span>
    </div>
  )
}

function CreateUser({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const create = useCreateUser()
  const [form, setForm] = useState({ display_name: '', email: '', role: 'employee' as Role, locale: i18n.language, password: generatePassword() })
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate({ ...form, display_name: form.display_name.trim(), email: form.email.trim() })
  }

  if (create.isSuccess) {
    return (
      <Modal title={t('admin.created')} onClose={onClose} description={t('admin.createdHint')}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-muted p-4 text-sm">
          <dt className="text-muted-foreground">{t('login.email')}</dt><dd dir="ltr" className="font-medium">{create.data.email}</dd>
          <dt className="text-muted-foreground">{t('login.password')}</dt><dd dir="ltr" className="font-mono font-medium">{form.password}</dd>
          <dt className="text-muted-foreground">{t('admin.address')}</dt><dd dir="ltr" className="font-medium">{location.origin}</dd>
        </dl>
        <ModalActions><Button onClick={onClose}>{t('admin.done')}</Button></ModalActions>
      </Modal>
    )
  }
  return (
    <Modal title={t('admin.newUser')} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">{t('admin.name')}
          <input required autoFocus maxLength={120} value={form.display_name} onChange={(e) => set({ display_name: e.target.value })} className="field" dir="auto" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">{t('login.email')}
          <input required type="email" maxLength={320} value={form.email} onChange={(e) => set({ email: e.target.value })} className="field" dir="ltr" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">{t('admin.role')}
            <select value={form.role} onChange={(e) => set({ role: e.target.value as Role })} className="field">
              {ROLES.map((r) => <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">{t('app.language')}
            <select value={form.locale} onChange={(e) => set({ locale: e.target.value })} className="field">
              {LANGUAGES.map((l) => <option key={l} value={l}>{LANGUAGE_NAMES[l]}</option>)}
            </select>
          </label>
        </div>
        <PasswordField label={t('login.password')} value={form.password} onChange={(password) => set({ password })} />
        {create.isError && <p role="alert" className="text-sm text-danger">{t(errorKey(create.error))}</p>}
        <ModalActions>
          <Button type="button" variant="ghost" onClick={onClose}>{t('chat.cancel')}</Button>
          <Button type="submit" disabled={create.isPending}>{t('admin.createUser')}</Button>
        </ModalActions>
      </form>
    </Modal>
  )
}

function EditUser({ user, isMe, onClose }: { user: AdminUser; isMe: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const update = useUpdateUser()
  const [name, setName] = useState(user.display_name)
  const [role, setRole] = useState(user.role)
  const [password, setPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const roleId = useId()

  const save = (e: FormEvent) => {
    e.preventDefault()
    const changes = { ...(name.trim() !== user.display_name && { display_name: name.trim() }), ...(role !== user.role && { role }) }
    if (Object.keys(changes).length === 0) return onClose()
    update.mutate({ id: user.id, ...changes }, { onSuccess: onClose })
  }
  const resetPassword = () =>
    update.mutate({ id: user.id, new_password: password }, { onSuccess: () => { setSaved(password); setResetting(false) } })
  const toggleActive = () => update.mutate({ id: user.id, is_active: !user.is_active }, { onSuccess: onClose })

  return (
    <Modal title={user.display_name} description={user.email} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">{t('admin.name')}
          <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="field" dir="auto" />
        </label>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={roleId} className="text-sm font-medium">{t('admin.role')}</label>
          <select id={roleId} value={role} onChange={(e) => setRole(e.target.value as Role)} className="field" disabled={isMe}
            aria-describedby={isMe ? `${roleId}-hint` : undefined}>
            {ROLES.map((r) => <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>)}
          </select>
          {isMe && <span id={`${roleId}-hint`} className="text-xs text-muted-foreground">{t('admin.notSelf')}</span>}
        </div>

        <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4 text-muted-foreground" aria-hidden />{t('admin.resetPassword')}</h3>
          {saved && (
            <p role="status" className="rounded-lg bg-success-soft p-3 text-sm text-success">
              {t('admin.passwordReset')} <span dir="ltr" className="font-mono font-semibold">{saved}</span>
            </p>
          )}
          {resetting ? (
            <>
              <PasswordField label={t('admin.newPassword')} value={password} onChange={setPassword} />
              <div className="flex gap-2">
                <Button type="button" variant="outline" disabled={password.length < 12 || update.isPending} onClick={resetPassword}>{t('admin.setPassword')}</Button>
                <Button type="button" variant="ghost" onClick={() => setResetting(false)}>{t('chat.cancel')}</Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[13px] text-muted-foreground">{t('admin.resetHint')}</p>
              <Button type="button" variant="outline" className="self-start" onClick={() => { setPassword(generatePassword()); setResetting(true) }}>{t('admin.resetPassword')}</Button>
            </>
          )}
        </section>

        {update.isError && <p role="alert" className="text-sm text-danger">{t(errorKey(update.error))}</p>}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {!isMe && (
            <Button type="button" variant={user.is_active ? 'ghost' : 'subtle'} onClick={toggleActive} disabled={update.isPending}
              className={cn(user.is_active && 'text-danger hover:bg-danger-soft')}>
              {user.is_active ? t('admin.deactivate') : t('admin.reactivate')}
            </Button>
          )}
          <span className="ms-auto flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>{t('chat.cancel')}</Button>
            <Button type="submit" disabled={update.isPending}>{t('chat.save')}</Button>
          </span>
        </div>
        {!isMe && user.is_active && <p className="text-xs text-muted-foreground">{t('admin.deactivateHint')}</p>}
      </form>
    </Modal>
  )
}

function UsersPanel({ meId }: { meId: string }) {
  const { t } = useTranslation()
  const users = useAdminUsers().data
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const q = query.trim().toLowerCase()
  const shown = (users ?? []).filter((u) => !q || u.display_name.toLowerCase().includes(q) || u.email.includes(q))
  const active = (users ?? []).filter((u) => u.is_active).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full sm:w-auto sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('admin.searchUsers')}
            aria-label={t('admin.searchUsers')} className="field w-full ps-9" />
        </label>
        <span className="text-sm text-muted-foreground">{t('admin.activeCount', { count: active })}</span>
        <Button className="ms-auto" onClick={() => setCreating(true)}><UserPlus className="size-4" aria-hidden />{t('admin.newUser')}</Button>
      </div>
      <ul aria-label={t('admin.users')} className="card divide-y divide-border">
        {shown.map((u) => (
          <li key={u.id} className={cn('flex min-h-16 items-center gap-3 px-4 py-2.5', !u.is_active && 'opacity-60')}>
            <Avatar name={u.display_name} id={u.id} size="md" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2">
                <span dir="auto" className="truncate text-sm font-medium">{u.display_name}</span>
                {u.id === meId && <span className="text-xs text-muted-foreground">({t('tasks.me')})</span>}
                {/* Phones: role and status beside the name (the badges column is hidden) */}
                <span className="shrink-0 text-xs text-muted-foreground sm:hidden">
                  {t(`admin.roles.${u.role}`)}{!u.is_active && ` · ${t('admin.inactive')}`}
                </span>
              </span>
              <span dir="ltr" className="truncate text-start text-[13px] text-muted-foreground">{u.email}</span>
            </span>
            <span className="hidden items-center gap-1.5 sm:flex">
              {!u.is_active && <Badge tone="warning">{t('admin.inactive')}</Badge>}
              <Badge tone={ROLE_TONE[u.role]}>{u.role === 'admin' && <Shield className="size-3" aria-hidden />}{t(`admin.roles.${u.role}`)}</Badge>
            </span>
            <Button variant="ghost" size="icon" onClick={() => setEditing(u)} aria-label={t('admin.edit', { name: u.display_name })}>
              <Pencil className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
        {users && shown.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">{t('search.noResults')}</li>}
      </ul>
      {creating && <CreateUser onClose={() => setCreating(false)} />}
      {editing && <EditUser user={editing} isMe={editing.id === meId} onClose={() => setEditing(null)} />}
    </div>
  )
}

function TeamsPanel() {
  const { t } = useTranslation()
  const teams = useTeams().data ?? []
  const users = (useAdminUsers().data ?? []).filter((u) => u.is_active)
  const byId = new Map(users.map((u) => [u.id, u]))
  const actions = useTeamActions()
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const error = [actions.create, actions.rename, actions.remove, actions.addMember, actions.removeMember].find((m) => m.isError)?.error

  const create = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) actions.create.mutate(name.trim(), { onSuccess: () => setName('') })
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={create} className="flex gap-2 sm:max-w-md">
        <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('admin.teamName')}
          aria-label={t('admin.teamName')} className="field min-w-0 flex-1" dir="auto" />
        <Button type="submit" disabled={actions.create.isPending}><Plus className="size-4" aria-hidden />{t('admin.newTeam')}</Button>
      </form>
      {error !== undefined && <p role="alert" className="text-sm text-danger">{t(errorKey(error))}</p>}
      {teams.length === 0 && <EmptyState icon={Users} title={t('admin.noTeams')} hint={t('admin.noTeamsHint')} />}
      <div className="grid gap-4 lg:grid-cols-2">
        {teams.map((team) => {
          const outside = users.filter((u) => !team.member_ids.includes(u.id))
          return (
            <section key={team.id} aria-label={team.name} className="card flex flex-col gap-3 p-4">
              <header className="flex items-center gap-2">
                {renaming?.id === team.id ? (
                  <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); actions.rename.mutate(renaming, { onSuccess: () => setRenaming(null) }) }}>
                    <input autoFocus required maxLength={120} value={renaming.name} aria-label={t('admin.teamName')}
                      onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} className="field min-w-0 flex-1" dir="auto" />
                    <Button type="submit" size="icon" aria-label={t('chat.save')}><Check className="size-4" aria-hidden /></Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={t('chat.cancel')} onClick={() => setRenaming(null)}><X className="size-4" aria-hidden /></Button>
                  </form>
                ) : (
                  <>
                    <h3 dir="auto" className="min-w-0 flex-1 truncate font-semibold">{team.name}</h3>
                    <span className="text-xs text-muted-foreground">{t('admin.memberCount', { count: team.member_ids.length })}</span>
                    <Button variant="ghost" size="icon" aria-label={t('admin.renameTeam', { name: team.name })} onClick={() => setRenaming({ id: team.id, name: team.name })}>
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={t('admin.deleteTeam', { name: team.name })} onClick={() => setDeleting(team.id)}
                      className="text-muted-foreground hover:bg-danger-soft hover:text-danger">
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </>
                )}
              </header>
              {deleting === team.id && (
                <div role="group" aria-label={t('admin.deleteTeam', { name: team.name })} className="flex flex-wrap items-center gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger">
                  <span className="flex-1">{t('admin.deleteTeamConfirm')}</span>
                  <Button variant="danger" onClick={() => actions.remove.mutate(team.id, { onSuccess: () => setDeleting(null) })}>{t('admin.delete')}</Button>
                  <Button variant="ghost" onClick={() => setDeleting(null)}>{t('chat.cancel')}</Button>
                </div>
              )}
              <ul aria-label={t('admin.members')} className="flex flex-wrap gap-1.5">
                {team.member_ids.map((id) => {
                  const u = byId.get(id)
                  if (!u) return null
                  return (
                    <li key={id} className="flex min-h-9 items-center gap-1.5 rounded-full bg-muted ps-1 text-sm">
                      <Avatar name={u.display_name} id={u.id} size="xs" />
                      <span dir="auto">{u.display_name}</span>
                      <button type="button" aria-label={t('admin.removeMember', { name: u.display_name, team: team.name })}
                        onClick={() => actions.removeMember.mutate({ id: team.id, userId: id })}
                        className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-danger">
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  )
                })}
                {team.member_ids.length === 0 && <li className="text-sm text-muted-foreground">{t('admin.noMembers')}</li>}
              </ul>
              {outside.length > 0 && (
                <select value="" aria-label={t('admin.addMember', { team: team.name })} className="field"
                  onChange={(e) => e.target.value && actions.addMember.mutate({ id: team.id, userId: e.target.value })}>
                  <option value="">{t('admin.addMemberPlaceholder')}</option>
                  {outside.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                </select>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

/** Administration (admins only): accounts and teams. */
export function AdminView({ meId }: { meId: string }) {
  const { t, i18n } = useTranslation()
  return (
    <section aria-label={t('admin.title')} className="h-full overflow-y-auto">
      <div className="page flex animate-fade-in flex-col gap-5">
        <header>
          <h2 className="page-title">{t('admin.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('admin.hint')}</p>
        </header>
        <Tabs defaultValue="users" dir={i18n.dir()} className="flex flex-col gap-4">
          <TabsList>
            <TabsTrigger value="users">{t('admin.users')}</TabsTrigger>
            <TabsTrigger value="teams">{t('admin.teams')}</TabsTrigger>
          </TabsList>
          <TabsContent value="users"><UsersPanel meId={meId} /></TabsContent>
          <TabsContent value="teams"><TeamsPanel /></TabsContent>
        </Tabs>
      </div>
    </section>
  )
}
