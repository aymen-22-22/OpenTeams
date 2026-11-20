import { useSyncExternalStore } from 'react'

/** Who is typing in each conversation. An entry disappears a few seconds after the last event. */

const TTL_MS = 4000
const typing = new Map<string, { userId: string; timer: ReturnType<typeof setTimeout> }>()
const subscribers = new Set<() => void>()

const notify = () => subscribers.forEach((fn) => fn())

export function clearTyping(conversationId: string) {
  const entry = typing.get(conversationId)
  if (!entry) return
  clearTimeout(entry.timer)
  typing.delete(conversationId)
  notify()
}

export function markTyping(conversationId: string, userId: string) {
  clearTimeout(typing.get(conversationId)?.timer)
  typing.set(conversationId, { userId, timer: setTimeout(() => clearTyping(conversationId), TTL_MS) })
  notify()
}

function subscribe(fn: () => void) {
  subscribers.add(fn)
  return () => void subscribers.delete(fn)
}

export function useTypingUser(conversationId: string): string | null {
  return useSyncExternalStore(subscribe, () => typing.get(conversationId)?.userId ?? null)
}
