import { Check, Copy, Mail } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { useEmailAddress, useNewEmailAddress } from './api'

/** Side panel section: the address that posts emails into this conversation. */
export function EmailAddressSection({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation()
  const data = useEmailAddress(conversationId).data
  const create = useNewEmailAddress(conversationId)
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)

  if (!data) return null // bridge not configured, or still loading

  const copy = async () => {
    if (!data.address) return
    try {
      await navigator.clipboard.writeText(data.address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard refused: the address is still visible and selectable */
    }
  }

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="email-address-title">
      <h2 id="email-address-title" className="section-title">{t('bridge.title')}</h2>
      {data.address ? (
        <>
          <div className="flex items-center gap-1 rounded-lg bg-background p-1 ps-3 shadow-xs ring-1 ring-border">
            <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <code dir="ltr" className="min-w-0 flex-1 truncate text-[13px]" title={data.address}>{data.address}</code>
            <button type="button" onClick={() => void copy()} aria-label={copied ? t('bridge.copied') : t('bridge.copy')}
              className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground">
              {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            </button>
          </div>
          <p className="text-[13px] text-muted-foreground">{t('bridge.hint')}</p>
          {confirming ? (
            <div role="group" aria-label={t('bridge.replace')} className="flex flex-col gap-2 rounded-lg bg-warning-soft p-3 text-[13px] text-warning">
              <p>{t('bridge.replaceWarning')}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { create.mutate(); setConfirming(false) }}>{t('bridge.replaceConfirm')}</Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>{t('chat.cancel')}</Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" className="self-start" onClick={() => setConfirming(true)}>{t('bridge.replace')}</Button>
          )}
        </>
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground">{t('bridge.intro')}</p>
          <Button variant="outline" onClick={() => create.mutate()} disabled={create.isPending}>{t('bridge.create')}</Button>
        </>
      )}
    </section>
  )
}
