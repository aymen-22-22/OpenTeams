import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { PEOPLE_KEY, type Person, type Presence } from '@/features/auth/api'

interface PresenceChanged {
  type: 'presence.changed'
  user_id: string
  status: Presence
}

const RECONNECT_MS = 3000
const UNAUTHORIZED = 4401

/** Opens /ws while logged in: keeps people's presence live and reports away when the tab is hidden. */
export function usePresenceSocket(enabled: boolean) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!enabled) return
    let ws: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let stopped = false

    const sendStatus = () => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'presence.set', status: document.hidden ? 'away' : 'online' }))
      }
    }

    const connect = () => {
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${scheme}://${location.host}/ws`)
      ws.onopen = sendStatus
      ws.onmessage = (msg) => {
        const event = JSON.parse(msg.data) as PresenceChanged
        if (event.type !== 'presence.changed') return
        qc.setQueryData<Person[]>(PEOPLE_KEY, (people) =>
          people?.map((p) => (p.id === event.user_id ? { ...p, presence: event.status } : p)),
        )
      }
      ws.onclose = (e) => {
        if (stopped) return
        if (e.code === UNAUTHORIZED) void qc.invalidateQueries({ queryKey: ['me'] })
        else retry = setTimeout(connect, RECONNECT_MS)
      }
    }

    connect()
    document.addEventListener('visibilitychange', sendStatus)
    return () => {
      stopped = true
      clearTimeout(retry)
      document.removeEventListener('visibilitychange', sendStatus)
      ws?.close()
    }
  }, [enabled, qc])
}
