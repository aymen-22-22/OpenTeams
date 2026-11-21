import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { ChatFile } from '@/features/files/api'
import type { Task, TaskCounts } from '@/features/tasks/api'
import { api } from '@/lib/api'

export type ProjectStatus = 'active' | 'on_hold' | 'finished'

export interface ProjectInput {
  name: string
  description: string
  status: ProjectStatus
  start_date: string | null
  due_date: string | null
  member_ids: string[]
}

export interface Project extends ProjectInput {
  id: string
  owner_id: string | null
  finished_at: string | null
  counts: TaskCounts
  can_edit: boolean
}

export interface Milestone {
  id: string
  title: string
  date: string
  done: boolean
}

export interface ProjectDetail extends Project {
  milestones: Milestone[]
  tasks: Task[]
  files: ChatFile[]
}

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: () => api<Project[]>('/projects') })
}

export function useProject(id: string) {
  return useQuery({ queryKey: ['projects', id], queryFn: () => api<ProjectDetail>(`/projects/${id}`), retry: false })
}

export function useSaveProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ProjectInput }) =>
      api<Project>(id ? `/projects/${id}` : '/projects', { method: id ? 'PUT' : 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] })
      void qc.invalidateQueries({ queryKey: ['calendar'] })
    },
  })
}

export function useMilestones(projectId: string) {
  const qc = useQueryClient()
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['projects', projectId] })
    void qc.invalidateQueries({ queryKey: ['calendar'] })
  }
  return {
    add: useMutation({
      mutationFn: (m: Omit<Milestone, 'id'>) => api<Milestone>(`/projects/${projectId}/milestones`, { method: 'POST', body: m }),
      onSuccess: refresh,
    }),
    save: useMutation({
      mutationFn: ({ id, ...m }: Milestone) => api<Milestone>(`/projects/milestones/${id}`, { method: 'PUT', body: m }),
      onSuccess: refresh,
    }),
  }
}
