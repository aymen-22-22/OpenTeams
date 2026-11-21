import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Person, User } from '@/features/auth/api'
import { cn } from '@/lib/utils'

import { useApprovers, useRequestAction, useRequests, useSubmitRequest, type AppRequest, type Box, type LeaveType, type RequestKind } from './api'

const field = 'min-h-11 rounded-md border border-border bg-background px-3'

export const REQUEST_STATUS_COLOR = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  cancelled: 'bg-muted text-muted-foreground',
} as const

function RequestForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const approvers = useApprovers().data ?? []
  const submit = useSubmitRequest()
  const [kind, setKind] = useState<RequestKind>('leave')
  const [title, setTitle] = useState('')
  const [approver, setApprover] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [leaveType, setLeaveType] = useState<LeaveType>('paid')
  const [amount, setAmount] = useState('')
  const [comment, setComment] = useState('')

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit.mutate(
      {
        kind, title: title.trim(), comment, approver_id: approver || approvers[0]?.id,
        ...(kind === 'leave' ? { start_date: start, end_date: end, leave_type: leaveType } : {}),
        ...(kind === 'expense' ? { amount } : {}),
      },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg flex-col gap-3 rounded-md border border-border p-4">
      <h3 className="font-semibold">{t('requests.new')}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">{t('requests.kind')}
          <select value={kind} onChange={(e) => setKind(e.target.value as RequestKind)} className={field}>
            {(['leave', 'equipment', 'expense', 'other'] as const).map((k) => <option key={k} value={k}>{t(`requests.kinds.${k}`)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">{t('requests.approver')}
          <select required value={approver || approvers[0]?.id || ''} onChange={(e) => setApprover(e.target.value)} className={field}>
            {approvers.map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">{t('tasks.title')}
        <input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={field} dir="auto" />
      </label>
      {kind === 'leave' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">{t('requests.from')}
            <input type="date" required value={start} onChange={(e) => setStart(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">{t('requests.to')}
            <input type="date" required min={start} value={end} onChange={(e) => setEnd(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">{t('requests.leaveType')}
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)} className={field}>
              {(['paid', 'unpaid', 'sick', 'other'] as const).map((l) => <option key={l} value={l}>{t(`requests.leaveTypes.${l}`)}</option>)}
            </select>
          </label>
        </div>
      )}
      {kind === 'expense' && (
        <label className="flex flex-col gap-1 text-sm">{t('requests.amount')}
          <input type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} dir="ltr" />
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm">{t('requests.comment')}
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} className={`${field} py-2`} dir="auto" />
      </label>
      {approvers.length === 0 && <p className="text-sm text-muted-foreground">{t('requests.noApprover')}</p>}
      {submit.isError && <p role="alert" className="text-sm text-red-600">{t('requests.failed')}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>{t('chat.cancel')}</Button>
        <Button type="submit" disabled={submit.isPending || approvers.length === 0}>{t('requests.submit')}</Button>
      </div>
    </form>
  )
}

function RequestCard({ request, box, people }: { request: AppRequest; box: Box; people: Map<string, Person> }) {
  const { t, i18n } = useTranslation()
  const act = useRequestAction()
  const [comment, setComment] = useState('')
  const d = request.details
  const fmt = (iso: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(`${iso}T12:00`))
  const name = (id: string | null) => people.get(id ?? '')?.display_name ?? '?'

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span dir="auto" className="font-medium">{request.title}</span>
        <span className="text-xs text-muted-foreground">{t(`requests.kinds.${request.kind}`)}</span>
        <span className={cn('ms-auto rounded px-2 py-0.5 text-xs', REQUEST_STATUS_COLOR[request.status])}>{t(`requests.statuses.${request.status}`)}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        {box === 'to_approve' ? t('requests.by', { name: name(request.requester_id) }) : t('requests.to_approver', { name: name(request.approver_id) })}
        {d.start_date && d.end_date && ` · ${fmt(d.start_date)} → ${fmt(d.end_date)} · ${t(`requests.leaveTypes.${d.leave_type}`)}`}
        {d.amount && ` · ${new Intl.NumberFormat(i18n.language, { style: 'currency', currency: d.currency ?? 'EUR' }).format(Number(d.amount))}`}
      </p>
      {request.comment && <p dir="auto" className="text-sm">{request.comment}</p>}
      {request.decision_comment && <p dir="auto" className="text-sm italic">« {request.decision_comment} »</p>}
      {request.status === 'pending' && box === 'to_approve' && (
        <div className="flex flex-wrap gap-2">
          <input aria-label={t('requests.decisionComment')} placeholder={t('requests.decisionComment')} value={comment}
            onChange={(e) => setComment(e.target.value)} className={`${field} flex-1`} dir="auto" />
          <Button onClick={() => act.mutate({ id: request.id, action: 'approve', comment })}>{t('requests.approve')}</Button>
          <Button variant="outline" onClick={() => act.mutate({ id: request.id, action: 'reject', comment })}>{t('requests.reject')}</Button>
        </div>
      )}
      {request.status === 'pending' && box === 'mine' && (
        <Button variant="ghost" className="self-start" onClick={() => act.mutate({ id: request.id, action: 'cancel' })}>{t('requests.cancel')}</Button>
      )}
    </li>
  )
}

function RequestList({ box, people }: { box: Box; people: Map<string, Person> }) {
  const { t } = useTranslation()
  const list = useRequests(box).data ?? []
  if (list.length === 0) return <p className="text-sm text-muted-foreground">{t('requests.empty')}</p>
  return <ul className="flex flex-col gap-2">{list.map((r) => <RequestCard key={r.id} request={r} box={box} people={people} />)}</ul>
}

export function RequestsView({ me, people }: { me: User; people: Map<string, Person> }) {
  const { t } = useTranslation()
  const [creating, setCreating] = useState(false)
  const approver = me.role !== 'employee'
  return (
    <section aria-label={t('requests.title')} className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('requests.title')}</h2>
        {!creating && <Button onClick={() => setCreating(true)}>{t('requests.new')}</Button>}
      </header>
      {creating && <RequestForm onDone={() => setCreating(false)} />}
      <Tabs defaultValue={approver ? 'to_approve' : 'mine'} className="flex flex-col">
        <TabsList>
          {approver && <TabsTrigger value="to_approve">{t('requests.toApprove')}</TabsTrigger>}
          <TabsTrigger value="mine">{t('requests.mine')}</TabsTrigger>
        </TabsList>
        {approver && <TabsContent value="to_approve"><RequestList box="to_approve" people={people} /></TabsContent>}
        <TabsContent value="mine"><RequestList box="mine" people={people} /></TabsContent>
      </Tabs>
    </section>
  )
}
