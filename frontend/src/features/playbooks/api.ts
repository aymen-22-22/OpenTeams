import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export const KINDS = ['task_summary', 'weekly_report', 'monthly_report', 'monday_summary'] as const
export type Kind = (typeof KINDS)[number]
export type Frequency = 'daily' | 'weekly' | 'monthly'
export type RunStatus = 'awaiting_approval' | 'delivered' | 'rejected' | 'failed'

export interface PlaybookInput {
  name: string
  kind: Kind
  enabled: boolean
  frequency: Frequency
  weekday: number
  day_of_month: number
  hour: number
  scope_user_ids: string[]
  recipient_ids: string[]
  deliver_in_app: boolean
  deliver_email: boolean
  approval_required: boolean
  use_ai: boolean
  instructions: string
}

export interface Playbook extends PlaybookInput {
  id: string
  owner_id: string
  next_run_at: string
}

export interface Run {
  id: string
  playbook_id: string
  trigger: 'schedule' | 'manual'
  status: RunStatus
  period_start: string
  period_end: string
  inputs: { counts?: Record<string, number>; ai?: boolean }
  recipient_ids: string[]
  tokens: number
  cost: number
  duration_ms: number
  attempts: number
  error: string | null
  created_at: string
}

export interface Report {
  run: Run
  playbook_name: string
  is_owner: boolean
  reports: Record<string, string>
}

const keys = {
  list: ['playbooks'] as const,
  runs: (id: string) => ['playbooks', 'runs', id] as const,
  report: (runId: string) => ['playbooks', 'report', runId] as const,
}

export const DEFAULT_PLAYBOOK: PlaybookInput = {
  name: '', kind: 'weekly_report', enabled: true, frequency: 'weekly', weekday: 0, day_of_month: 1, hour: 8,
  scope_user_ids: [], recipient_ids: [], deliver_in_app: true, deliver_email: false,
  approval_required: false, use_ai: false, instructions: '',
}

export function usePlaybooks() {
  return useQuery({ queryKey: keys.list, queryFn: () => api<Playbook[]>('/playbooks') })
}

export function useSavePlaybook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: PlaybookInput }) =>
      api<Playbook>(id ? `/playbooks/${id}` : '/playbooks', { method: id ? 'PUT' : 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.list }),
  })
}

export function useDeletePlaybook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/playbooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.list }),
  })
}

export function usePreview() {
  return useMutation({
    mutationFn: (id: string) => api<{ reports: Record<string, string> }>(`/playbooks/${id}/preview`, { method: 'POST' }),
  })
}

export function useRunNow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<Run>(`/playbooks/${id}/run`, { method: 'POST' }),
    onSuccess: (run) => qc.invalidateQueries({ queryKey: keys.runs(run.playbook_id) }),
  })
}

export function useRuns(id: string) {
  return useQuery({ queryKey: keys.runs(id), queryFn: () => api<Run[]>(`/playbooks/${id}/runs`) })
}

export function useReport(runId: string) {
  return useQuery({ queryKey: keys.report(runId), queryFn: () => api<Report>(`/playbooks/runs/${runId}`), retry: false })
}

export function useDecide(runId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (decision: 'approve' | 'reject') => api<Run>(`/playbooks/runs/${runId}/${decision}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['playbooks'] }),
  })
}
