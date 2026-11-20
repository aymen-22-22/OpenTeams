/**
 * One WebSocket for the whole app. Reconnects automatically and resumes from the
 * last stored event id, so no message is lost while offline.
 */

export interface ServerEvent {
  id?: number // present on stored events (resumable)
  type: string
  conversation_id?: string
  user_id?: string
  status?: string
  data?: Record<string, unknown>
  code?: string
}

type Listener = (event: ServerEvent) => void
type CloseListener = (code: number) => void

const RECONNECT_MS = 3000
const UNAUTHORIZED = 4401

let socket: WebSocket | null = null
let lastEventId = 0
let retry: ReturnType<typeof setTimeout> | undefined
let running = false
let onOpenHook: (() => void) | null = null
const listeners = new Set<Listener>()
const closeListeners = new Set<CloseListener>()

function connect() {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  const resume = lastEventId ? `?last_event_id=${lastEventId}` : ''
  const ws = new WebSocket(`${scheme}://${location.host}/ws${resume}`)
  socket = ws
  ws.onopen = () => onOpenHook?.()
  ws.onmessage = (msg) => {
    const event = JSON.parse(msg.data) as ServerEvent
    if (event.id) lastEventId = Math.max(lastEventId, event.id)
    listeners.forEach((fn) => fn(event))
  }
  ws.onclose = (e) => {
    if (!running || socket !== ws) return
    closeListeners.forEach((fn) => fn(e.code))
    if (e.code !== UNAUTHORIZED) retry = setTimeout(connect, RECONNECT_MS)
  }
}

export const realtime = {
  start(onOpen?: () => void) {
    if (running) return
    running = true
    onOpenHook = onOpen ?? null
    connect()
  },
  stop() {
    running = false
    clearTimeout(retry)
    socket?.close()
    socket = null
    lastEventId = 0
  },
  send(event: Record<string, unknown>) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event))
  },
  subscribe(fn: Listener) {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  },
  onClose(fn: CloseListener) {
    closeListeners.add(fn)
    return () => void closeListeners.delete(fn)
  },
}
