import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { ME_KEY, PEOPLE_KEY, type Person, type Presence } from '@/features/auth/api'
import { keys, upsertMessage, type Message, type MessagesData } from '@/features/chat/api'
import { clearTyping, markTyping } from '@/features/chat/typing'
import { filesKey } from '@/features/files/api'
import { taskKeys } from '@/features/tasks/api'
import { realtime, type ServerEvent } from '@/lib/realtime'

/** Connects the socket while logged in and applies server events to the query cache. */
export function useRealtime(enabled: boolean) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!enabled) return

    const sendPresence = () => realtime.send({ type: 'presence.set', status: document.hidden ? 'away' : 'online' })

    const handle = (e: ServerEvent) => {
      const conv = e.conversation_id
      switch (e.type) {
        case 'presence.changed':
          qc.setQueryData<Person[]>(PEOPLE_KEY, (people) =>
            people?.map((p) => (p.id === e.user_id ? { ...p, presence: e.status as Presence } : p)),
          )
          break
        case 'message.created':
        case 'message.updated': {
          const message = e.data as unknown as Message
          qc.setQueryData<MessagesData>(keys.messages(message.conversation_id), (d) => upsertMessage(d, message))
          if (e.type === 'message.created') clearTyping(message.conversation_id)
          void qc.invalidateQueries({ queryKey: keys.conversations })
          break
        }
        case 'message.deleted':
          if (conv) void qc.invalidateQueries({ queryKey: keys.messages(conv) })
          if (conv) void qc.invalidateQueries({ queryKey: keys.pins(conv) })
          void qc.invalidateQueries({ queryKey: keys.conversations })
          break
        case 'conversation.read':
          void qc.invalidateQueries({ queryKey: keys.conversations })
          break
        case 'pin.added':
        case 'pin.removed':
          if (conv) void qc.invalidateQueries({ queryKey: keys.pins(conv) })
          break
        case 'file.created':
          if (conv) void qc.invalidateQueries({ queryKey: filesKey(conv) })
          break
        case 'task.created':
        case 'task.updated':
        case 'task.moved':
          void qc.invalidateQueries({ queryKey: taskKeys.all })
          break
        case 'typing':
          if (conv && e.data?.user_id) markTyping(conv, String(e.data.user_id))
          break
      }
    }

    const unsubscribe = realtime.subscribe(handle)
    const unClose = realtime.onClose((code) => {
      if (code === 4401) void qc.invalidateQueries({ queryKey: ME_KEY })
    })
    realtime.start(sendPresence)
    document.addEventListener('visibilitychange', sendPresence)
    return () => {
      unsubscribe()
      unClose()
      document.removeEventListener('visibilitychange', sendPresence)
      realtime.stop()
    }
  }, [enabled, qc])
}
