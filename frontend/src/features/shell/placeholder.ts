// Placeholder data for parts of the shell not built yet (files, tasks, reminders).

export type FileKind = 'pdf' | 'spreadsheet' | 'document' | 'image' | 'other'
export type TaskStatus = 'pending' | 'in_progress' | 'finished'

export interface ChatFile {
  id: string
  name: string
  kind: FileKind
}

export const FILES: ChatFile[] = [
  { id: 'f1', name: 'rapport-mensuel.pdf', kind: 'pdf' },
  { id: 'f2', name: 'budget.xlsx', kind: 'spreadsheet' },
  { id: 'f3', name: 'notes.docx', kind: 'document' },
  { id: 'f4', name: 'schema.png', kind: 'image' },
  { id: 'f5', name: 'archive.zip', kind: 'other' },
]

export const TASK_COUNTS: Record<TaskStatus, number> = { pending: 3, in_progress: 2, finished: 5 }

export const REMINDERS = ['Envoyer le rapport — vendredi']
