import { ArrowLeft } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { Person, User } from '@/features/auth/api'
import { FileIcon } from '@/features/files/FileIcon'
import { STATUSES, type Task } from '@/features/tasks/api'
import { cn } from '@/lib/utils'

import { useMilestones, useProject, useProjects, useSaveProject, type ProjectInput, type ProjectStatus } from './api'

const field = 'min-h-11 rounded-md border border-border bg-background px-3'
const STATUS_COLOR = {
  active: 'bg-accent text-accent-foreground',
  on_hold: 'bg-amber-100 text-amber-800',
  finished: 'bg-green-100 text-green-800',
} as const

function ProjectForm({ initial, id, people, onDone }: { initial: ProjectInput; id?: string; people: Person[]; onDone: (id: string) => void }) {
  const { t } = useTranslation()
  const save = useSaveProject()
  const [form, setForm] = useState(initial)
  const set = (patch: Partial<ProjectInput>) => setForm((f) => ({ ...f, ...patch }))
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate({ id, input: form }, { onSuccess: (p) => onDone(p.id) })
  }
  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-3 rounded-md border border-border p-4">
      <label className="flex flex-col gap-1 text-sm">{t('projects.name')}
        <input required maxLength={160} value={form.name} onChange={(e) => set({ name: e.target.value })} className={field} dir="auto" />
      </label>
      <label className="flex flex-col gap-1 text-sm">{t('calendar.description')}
        <textarea rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} className={`${field} py-2`} dir="auto" />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">{t('projects.status')}
          <select value={form.status} onChange={(e) => set({ status: e.target.value as ProjectStatus })} className={field}>
            {(['active', 'on_hold', 'finished'] as const).map((s) => <option key={s} value={s}>{t(`projects.statuses.${s}`)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">{t('projects.start')}
          <input type="date" value={form.start_date ?? ''} onChange={(e) => set({ start_date: e.target.value || null })} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">{t('projects.due')}
          <input type="date" value={form.due_date ?? ''} onChange={(e) => set({ due_date: e.target.value || null })} className={field} />
        </label>
      </div>
      <fieldset className="flex flex-col rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-semibold">{t('projects.members')}</legend>
        {people.map((p) => (
          <label key={p.id} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5" checked={form.member_ids.includes(p.id)}
              onChange={(e) => set({ member_ids: e.target.checked ? [...form.member_ids, p.id] : form.member_ids.filter((x) => x !== p.id) })} />
            {p.display_name}
          </label>
        ))}
      </fieldset>
      {save.isError && <p role="alert" className="text-sm text-red-600">{t('projects.failed')}</p>}
      <Button type="submit" className="self-start" disabled={save.isPending}>{t('chat.save')}</Button>
    </form>
  )
}

function ProjectDetailView({ id, people, onBack, onOpenTask, onNewTask }: {
  id: string; people: Map<string, Person>; onBack: () => void; onOpenTask: (t: Task) => void; onNewTask: (projectId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const project = useProject(id).data
  const milestones = useMilestones(id)
  const [editing, setEditing] = useState(false)
  const [mTitle, setMTitle] = useState('')
  const [mDate, setMDate] = useState('')
  if (!project) return null
  const fmt = (d: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(`${d}T12:00`))
  const others = [...people.values()]

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onBack} aria-label={t('tasks.back')}><ArrowLeft className="size-5 rtl:-scale-x-100" aria-hidden /></Button>
        <h2 dir="auto" className="text-lg font-semibold">{project.name}</h2>
        <span className={cn('rounded px-2 py-0.5 text-xs', STATUS_COLOR[project.status])}>{t(`projects.statuses.${project.status}`)}</span>
        {project.due_date && <span className="text-sm text-muted-foreground">{t('projects.due')} {fmt(project.due_date)}</span>}
        <div className="ms-auto flex gap-2">
          <Button onClick={() => onNewTask(project.id)}>{t('tasks.new')}</Button>
          {project.can_edit && <Button variant="outline" onClick={() => setEditing((e) => !e)}>{t('chat.edit')}</Button>}
        </div>
      </header>
      {project.description && <p dir="auto" className="whitespace-pre-wrap text-sm">{project.description}</p>}
      {editing && <ProjectForm id={project.id} initial={project} people={others} onDone={() => setEditing(false)} />}
      <p className="text-sm text-muted-foreground">{t('projects.members')}: {project.member_ids.map((m) => people.get(m)?.display_name ?? '?').join(', ')}</p>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">{t('projects.milestones')}</h3>
        <ul className="flex flex-col gap-1">
          {project.milestones.map((m) => (
            <li key={m.id}>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="size-5" checked={m.done} disabled={!project.can_edit}
                  onChange={(e) => milestones.save.mutate({ ...m, done: e.target.checked })} />
                <span dir="auto" className={cn(m.done && 'line-through text-muted-foreground')}>{m.title}</span>
                <span className="text-muted-foreground">· {fmt(m.date)}</span>
              </label>
            </li>
          ))}
        </ul>
        {project.can_edit && (
          <form className="flex flex-wrap gap-2" onSubmit={(e) => {
            e.preventDefault()
            milestones.add.mutate({ title: mTitle.trim(), date: mDate, done: false }, { onSuccess: () => { setMTitle(''); setMDate('') } })
          }}>
            <input required aria-label={t('projects.milestoneTitle')} placeholder={t('projects.milestoneTitle')} value={mTitle}
              onChange={(e) => setMTitle(e.target.value)} className={`${field} flex-1`} dir="auto" />
            <input required type="date" aria-label={t('calendar.date')} value={mDate} onChange={(e) => setMDate(e.target.value)} className={field} />
            <Button type="submit" variant="outline">{t('projects.addMilestone')}</Button>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">{t('tabs.tasks')}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {STATUSES.map((s) => (
            <div key={s} className="flex flex-col gap-1 rounded-md bg-muted p-2">
              <h4 className="text-sm font-semibold">{t(`tasks.${s}`)} ({project.counts[s] ?? 0})</h4>
              {project.tasks.filter((task) => task.status === s).map((task) => (
                <button key={task.id} type="button" onClick={() => onOpenTask(task)} dir="auto"
                  className={cn('min-h-11 rounded-md border bg-background px-2 text-start text-sm', task.overdue ? 'border-red-500' : 'border-border')}>
                  {task.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">{t('tabs.files')}</h3>
        {project.files.length === 0 ? <p className="text-sm text-muted-foreground">{t('files.empty')}</p> : (
          <div className="flex flex-wrap gap-2">{project.files.map((f) => <FileIcon key={f.id} file={f} />)}</div>
        )}
      </section>
    </div>
  )
}

interface Props {
  me: User
  people: Map<string, Person>
  initialId?: string
  onOpenTask: (t: Task) => void
  onNewTask: (projectId: string) => void
}

export function ProjectsView({ me, people, initialId, onOpenTask, onNewTask }: Props) {
  const { t } = useTranslation()
  const projects = useProjects().data ?? []
  const [selected, setSelected] = useState<string | 'new' | null>(initialId ?? null)
  const others = [...people.values()].filter((p) => p.id !== me.id)

  return (
    <section aria-label={t('projects.title')} className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {selected && selected !== 'new' ? (
        <ProjectDetailView id={selected} people={people} onBack={() => setSelected(null)} onOpenTask={onOpenTask} onNewTask={onNewTask} />
      ) : (
        <>
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('projects.title')}</h2>
            <Button onClick={() => setSelected('new')}>{t('projects.new')}</Button>
          </header>
          {selected === 'new' && (
            <ProjectForm initial={{ name: '', description: '', status: 'active', start_date: null, due_date: null, member_ids: [] }}
              people={others} onDone={(id) => setSelected(id)} />
          )}
          {projects.length === 0 && selected !== 'new' && <p className="text-sm text-muted-foreground">{t('projects.empty')}</p>}
          <ul className="grid gap-2 md:grid-cols-2">
            {projects.map((p) => {
              const total = p.counts.pending + p.counts.in_progress + p.counts.finished
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => setSelected(p.id)} className="flex w-full flex-col gap-2 rounded-md border border-border p-3 text-start hover:bg-muted">
                    <span className="flex items-center gap-2">
                      <span dir="auto" className="flex-1 truncate font-medium">{p.name}</span>
                      <span className={cn('rounded px-2 py-0.5 text-xs', STATUS_COLOR[p.status])}>{t(`projects.statuses.${p.status}`)}</span>
                    </span>
                    <span className="h-2 overflow-hidden rounded bg-muted" aria-label={t('projects.progress', { done: p.counts.finished, total })}>
                      <span className="block h-full bg-accent" style={{ inlineSize: total ? `${(100 * p.counts.finished) / total}%` : 0 }} />
                    </span>
                    <span className="text-xs text-muted-foreground">{t('projects.progress', { done: p.counts.finished, total })} · {p.member_ids.length} {t('projects.membersCount')}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
