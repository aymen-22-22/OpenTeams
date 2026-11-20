// Placeholder data for parts of the shell not built yet (tasks, reminders).

export type TaskStatus = 'pending' | 'in_progress' | 'finished'

export const TASK_COUNTS: Record<TaskStatus, number> = { pending: 3, in_progress: 2, finished: 5 }

export const REMINDERS = ['Envoyer le rapport — vendredi']
