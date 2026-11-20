// Placeholder data for the Phase 1 shell. Replaced by API data in later phases.

export type Presence = 'online' | 'away' | 'offline'
export type FileKind = 'pdf' | 'spreadsheet' | 'document' | 'image' | 'other'
export type TaskStatus = 'pending' | 'in_progress' | 'finished'

export interface Person {
  id: string
  name: string
  presence: Presence
  aiActive: boolean
}

export interface ChatFile {
  id: string
  name: string
  kind: FileKind
}

export interface Message {
  id: string
  authorId: string
  text: string
}

export const PEOPLE: Person[] = [
  { id: 'u1', name: 'Amina Benali', presence: 'online', aiActive: true },
  { id: 'u2', name: 'Lucas Martin', presence: 'away', aiActive: false },
  { id: 'u3', name: 'Sara Haddad', presence: 'offline', aiActive: true },
  { id: 'u4', name: 'Karim Ziani', presence: 'online', aiActive: false },
]

export const ME = 'me'

export const MESSAGES: Message[] = [
  { id: 'm1', authorId: 'u1', text: 'Bonjour ! Le rapport est prêt.' },
  { id: 'm2', authorId: ME, text: 'Merci, je regarde ça.' },
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
