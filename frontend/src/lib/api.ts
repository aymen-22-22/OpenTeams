/** Small fetch wrapper: JSON, cookies, CSRF header and the backend error format. */

const BASE = '/api/v1'
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

export async function csrfToken(): Promise<string> {
  let token = readCookie('csrf_token')
  if (!token) {
    await fetch(`${BASE}/auth/csrf`, { credentials: 'include' })
    token = readCookie('csrf_token')
  }
  return token ?? ''
}

export async function api<T>(path: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (UNSAFE.has(method)) headers['X-CSRF-Token'] = await csrfToken()

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new ApiError(res.status, data?.error?.code ?? 'unknown', data?.error?.message ?? res.statusText)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}
