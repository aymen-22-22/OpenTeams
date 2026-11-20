// Placeholder data for parts of the shell not built yet (messages, files, tasks).

export type FileKind = 'pdf' | 'spreadsheet' | 'document' | 'image' | 'other'
export type TaskStatus = 'pending' | 'in_progress' | 'finished'

export interface ChatFile {
  id: string
  name: string
  kind: FileKind
}

export interface Message {
  id: string
  mine: boolean
  text: string
}

export const MESSAGES: Message[] = [
  { id: 'm1', mine: false, text: 'Bonjour ! Le rapport est prêt.' },
  { id: 'm2', mine: true, text: 'Merci, je regarde ça.' },
]

export const FILES: ChatFile[] = [
  { id: 'f1', name: 'rapport-mensuel.pdf', kind: 'pdf' },
  { id: 'f2', name: 'budget.xlsx', kind: 'spreadsheet' },
  { id: 'f3', name: 'notes.docx', kind: 'document' },
  { id: 'f4', name: 'schema.png', kind: 'image' },
  { id: 'f5', name: 'archive.zip', kind: 'other' },
]

export const TASK_COUNTS: Record<TaskStatus, number> = { pending: 3, in_progress: 2, finished: 5 }

export const PINS = ['Réunion lundi 10h', 'Objectifs T4']

export const REMINDERS = ['Envoyer le rapport — vendredi']
