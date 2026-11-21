import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type RequestKind = 'leave' | 'equipment' | 'expense' | 'other'
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type LeaveType = 'paid' | 'unpaid' | 'sick' | 'other'

export interface AppRequest {
  id: string
  requester_id: string
  approver_id: string | null
  kind: RequestKind
  title: string
  comment: string
  details: { start_date?: string; end_date?: string; leave_type?: LeaveType; amount?: string; currency?: string }
  status: RequestStatus
  decided_at: string | null
  decision_comment: string
  created_at: string
  steps: { actor_id: string | null; action: string; comment: string; created_at: string }[]
}

export interface RequestInput {
  kind: RequestKind
  title: string
  comment: string
  approver_id: string
  start_date?: string
  end_date?: string
  leave_type?: LeaveType
  amount?: string
}

export type Box = 'mine' | 'to_approve'

export function useRequests(box: Box) {
  return useQuery({ queryKey: ['requests', box], queryFn: () => api<AppRequest[]>(`/requests?box=${box}`) })
}

export function useApprovers() {
  return useQuery({ queryKey: ['requests', 'approvers'], queryFn: () => api<{ id: string; display_name: string }[]>('/requests/approvers') })
}

export function useSubmitRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RequestInput) => api<AppRequest>('/requests', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  })
}

export function useRequestAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action, comment }: { id: string; action: 'approve' | 'reject' | 'cancel'; comment?: string }) =>
      api<AppRequest>(`/requests/${id}/${action}`, { method: 'POST', body: action === 'cancel' ? undefined : { comment: comment ?? '' } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['requests'] })
      void qc.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}
