import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

/**
 * Web push on this device.
 * - unavailable: the server has no push keys (nothing is shown)
 * - unsupported: this browser cannot (on iPhone: only once added to the home screen)
 * - denied: the user blocked notifications in the browser settings
 */
export type PushState = 'unavailable' | 'unsupported' | 'denied' | 'off' | 'on'

const PUSH_KEY = ['push-state']

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register('/sw.js')
  } catch {
    /* no service worker (e.g. private mode): the app works, without push */
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration()
  return registration ? registration.pushManager.getSubscription() : null
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

async function readState(): Promise<{ state: PushState; publicKey: string | null }> {
  const { public_key } = await api<{ public_key: string | null }>('/push/config')
  if (!public_key) return { state: 'unavailable', publicKey: null }
  if (!pushSupported()) return { state: 'unsupported', publicKey: public_key }
  if (Notification.permission === 'denied') return { state: 'denied', publicKey: public_key }
  return { state: (await currentSubscription()) ? 'on' : 'off', publicKey: public_key }
}

export async function enablePush(publicKey: string): Promise<void> {
  if ((await Notification.requestPermission()) !== 'granted') return
  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
  await api('/push/subscriptions', { method: 'POST', body: subscription.toJSON() })
}

/** Stop push on this device (also called at sign-out, so a shared device stops alerting). */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  const subscription = await currentSubscription()
  if (!subscription) return
  await api('/push/subscriptions', { method: 'DELETE', body: { endpoint: subscription.endpoint } }).catch(() => undefined)
  await subscription.unsubscribe()
}

export function usePushState() {
  return useQuery({ queryKey: PUSH_KEY, queryFn: readState, staleTime: 60_000 })
}

export function useTogglePush() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ on, publicKey }: { on: boolean; publicKey: string }) => (on ? enablePush(publicKey) : disablePush()),
    onSettled: () => qc.invalidateQueries({ queryKey: PUSH_KEY }),
  })
}

export function useTestPush() {
  return useMutation({ mutationFn: () => api<void>('/push/test', { method: 'POST' }) })
}
