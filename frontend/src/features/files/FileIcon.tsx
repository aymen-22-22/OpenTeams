import { File, FileImage, FileSpreadsheet, FileText, FileType } from 'lucide-react'

import { downloadFile, type ChatFile } from './api'

const ICONS = {
  pdf: { Icon: FileType, color: 'text-red-600' },
  spreadsheet: { Icon: FileSpreadsheet, color: 'text-green-700' },
  document: { Icon: FileText, color: 'text-blue-600' },
  image: { Icon: FileImage, color: 'text-amber-600' },
  other: { Icon: File, color: 'text-muted-foreground' },
} as const

/** File tile: icon only. The name is exposed via tooltip and aria-label, never as visible text. */
export function FileIcon({ file }: { file: Pick<ChatFile, 'id' | 'name' | 'kind' | 'current_version'> }) {
  const { Icon, color } = ICONS[file.kind]
  const title = file.current_version > 1 ? `${file.name} (v${file.current_version})` : file.name
  return (
    <button
      type="button"
      title={title}
      aria-label={file.name}
      onClick={() => void downloadFile(file.id)}
      className="flex size-12 items-center justify-center rounded-md border border-border hover:bg-muted"
    >
      <Icon className={`size-6 ${color}`} aria-hidden />
    </button>
  )
}
