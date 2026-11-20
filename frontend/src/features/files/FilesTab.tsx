import { useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

import { filesKey, uploadFile, useFiles } from './api'
import { FileIcon } from './FileIcon'

interface Upload {
  id: number
  name: string
  progress: number
  errorCode?: string
}

const ERROR_VISIBLE_MS = 6000
const KNOWN_ERRORS = new Set(['type_not_allowed', 'too_large', 'rejected'])
let nextId = 0

export function FilesTab({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const files = useFiles(conversationId).data ?? []
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [dragging, setDragging] = useState(false)

  const update = (id: number, patch: Partial<Upload>) =>
    setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)))

  const start = (list: FileList | null) => {
    for (const file of Array.from(list ?? [])) {
      const id = nextId++
      setUploads((u) => [...u, { id, name: file.name, progress: 0 }])
      uploadFile(conversationId, file, (progress) => update(id, { progress }))
        .then(() => {
          setUploads((u) => u.filter((x) => x.id !== id))
          void qc.invalidateQueries({ queryKey: filesKey(conversationId) })
        })
        .catch((e: unknown) => {
          update(id, { errorCode: e instanceof ApiError ? e.code : 'upload_failed' })
          setTimeout(() => setUploads((u) => u.filter((x) => x.id !== id)), ERROR_VISIBLE_MS)
        })
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    start(e.dataTransfer.files)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn('flex min-h-full flex-col gap-4 rounded-md border-2 border-dashed border-transparent p-2', dragging && 'border-accent bg-muted')}
    >
      <div className="flex items-center gap-3">
        <Button onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" aria-hidden />
          {t('files.upload')}
        </Button>
        <span className="text-sm text-muted-foreground">{t('files.dropHint')}</span>
        <input ref={inputRef} type="file" multiple hidden aria-label={t('files.upload')}
          onChange={(e) => {
            start(e.target.files)
            e.target.value = ''
          }} />
      </div>

      {uploads.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={t('files.uploading')}>
          {uploads.map((u) => (
            <li key={u.id} className="flex flex-col gap-1 text-sm">
              <span dir="auto" className="truncate">{u.name}</span>
              {u.errorCode ? (
                <span role="alert" className="text-red-600">
                  {t(`files.errors.${KNOWN_ERRORS.has(u.errorCode) ? u.errorCode : 'upload_failed'}`)}
                </span>
              ) : (
                <progress value={u.progress} max={1} aria-label={u.name} className="h-2 w-full accent-[var(--accent)]" />
              )}
            </li>
          ))}
        </ul>
      )}

      {files.length === 0 && uploads.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('files.empty')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {files.map((f) => <FileIcon key={f.id} file={f} />)}
        </div>
      )}
    </div>
  )
}
