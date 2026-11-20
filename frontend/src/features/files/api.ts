import { useQuery } from '@tanstack/react-query'

import { api, ApiError, csrfToken } from '@/lib/api'

export type FileKind = 'pdf' | 'spreadsheet' | 'document' | 'image' | 'other'

export interface ChatFile {
  id: string
  conversation_id: string
  name: string
  kind: FileKind
  size: number
  current_version: number
  updated_at: string
}

export const filesKey = (conversationId: string) => ['files', conversationId] as const

export function useFiles(conversationId: string | undefined) {
  return useQuery({
    queryKey: filesKey(conversationId ?? ''),
    queryFn: () => api<ChatFile[]>(`/conversations/${conversationId}/files`),
    enabled: Boolean(conversationId),
  })
}

/** Upload the raw file (streamed by the browser). XHR is used only for progress events. */
export async function uploadFile(conversationId: string, file: File, onProgress: (ratio: number) => void) {
  const token = await csrfToken()
  return new Promise<ChatFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/v1/conversations/${conversationId}/files`)
    xhr.withCredentials = true
    xhr.setRequestHeader('X-CSRF-Token', token)
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name))
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      const data = JSON.parse(xhr.responseText || 'null')
      if (xhr.status === 201) resolve(data as ChatFile)
      else reject(new ApiError(xhr.status, data?.error?.code ?? 'upload_failed', data?.error?.message ?? ''))
    }
    xhr.onerror = () => reject(new ApiError(0, 'network', 'Network error'))
    xhr.send(file)
  })
}

export async function downloadFile(fileId: string) {
  const { url } = await api<{ url: string }>(`/files/${fileId}/download-url`)
  window.location.assign(url) // served as an attachment: the page stays open
}
