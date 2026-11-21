import { File, FileImage, FileSpreadsheet, FileText, FileType } from 'lucide-react'

import { downloadFile, type ChatFile } from './api'

const ICONS = {
  pdf: { Icon: FileType, color: 'text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300' },
  spreadsheet: { Icon: FileSpreadsheet, color: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300' },
  document: { Icon: FileText, color: 'text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300' },
  image: { Icon: FileImage, color: 'text-amber-700 bg-amber-50 dark:bg-amber-950 dark:text-amber-300' },
  other: { Icon: File, color: 'text-muted-foreground bg-muted' },
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
      className={`flex size-12 items-center justify-center rounded-xl ring-1 ring-border transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-md ${color}`}
    >
      <Icon className="size-6" aria-hidden />
    </button>
  )
}
