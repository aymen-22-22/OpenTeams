import { CheckCircle2, ImagePlus, Palette, Send, Trash2, Type } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { LANGUAGE_NAMES } from '@/i18n'
import { ApiError } from '@/lib/api'

import {
  EMAIL_KINDS, useBranding, useLogo, usePreview, useSaveBranding, useSaveTexts, useTestKind, useTexts,
  type Branding, type BrandingOut, type EmailKind, type EmailText, type Lang, type Texts, type TextsOut,
} from './emailApi'

const LANGS: Lang[] = ['fr', 'en', 'ar']
const DEFAULT_COLOR = '#0F766E'
const PREVIEW_DELAY_MS = 350

function AppearanceCard({ branding, onChange, saved }: { branding: Branding; onChange: (b: Branding) => void; saved: BrandingOut }) {
  const { t } = useTranslation()
  const save = useSaveBranding()
  const logo = useLogo()
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<Branding>) => onChange({ ...branding, ...patch })
  const field = 'flex flex-col gap-1.5 text-sm font-medium'
  const logoError = logo.upload.error instanceof ApiError ? logo.upload.error.code : logo.upload.isError ? 'failed' : null

  return (
    <section className="card flex flex-col gap-4 p-5" aria-labelledby="appearance-title">
      <h3 id="appearance-title" className="flex items-center gap-2 font-semibold"><Palette className="size-5 text-accent" aria-hidden />{t('admin.design.appearance')}</h3>
      <label className={field}>{t('admin.design.name')}
        <input value={branding.name} onChange={(e) => set({ name: e.target.value })} placeholder="OpenTeams" maxLength={120} className="field" dir="auto" />
      </label>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="brand-color" className="text-sm font-medium">{t('admin.design.color')}</label>
        <span className="flex items-center gap-2">
          <input id="brand-color" type="color" value={branding.color || DEFAULT_COLOR} onChange={(e) => set({ color: e.target.value })}
            className="h-11 w-14 cursor-pointer rounded-lg border border-border-strong bg-background p-1" />
          <input value={branding.color} onChange={(e) => set({ color: e.target.value })} placeholder={DEFAULT_COLOR} maxLength={7}
            aria-label={t('admin.design.colorHex')} className="field w-32 font-mono" dir="ltr" pattern="#[0-9a-fA-F]{6}" />
          {branding.color && <Button variant="ghost" onClick={() => set({ color: '' })}>{t('admin.design.reset')}</Button>}
        </span>
      </div>
      <label className={field}>{t('admin.design.footer')}
        <textarea rows={2} value={branding.footer} onChange={(e) => set({ footer: e.target.value })} maxLength={500}
          placeholder={t('admin.design.footerPlaceholder')} className="field resize-y" dir="auto" />
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('admin.design.logo')}</span>
        <div className="flex flex-wrap items-center gap-2">
          {saved.has_logo && (
            <img src={`/api/v1/branding/logo?t=${logo.upload.submittedAt}`} alt={t('admin.design.logoAlt')}
              className="h-10 max-w-40 rounded-md border border-border bg-muted object-contain p-1" />
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden aria-label={t('admin.design.uploadLogo')}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) logo.upload.mutate(f); e.target.value = '' }} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={logo.upload.isPending}>
            <ImagePlus className="size-4" aria-hidden />{saved.has_logo ? t('admin.design.replaceLogo') : t('admin.design.uploadLogo')}
          </Button>
          {saved.has_logo && (
            <Button variant="ghost" onClick={() => logo.remove.mutate()} className="text-danger hover:bg-danger-soft">
              <Trash2 className="size-4" aria-hidden />{t('admin.design.removeLogo')}
            </Button>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{t('admin.design.logoHint')}</span>
        {logoError && <p role="alert" className="text-sm text-danger">{t(`admin.design.logoErrors.${['too_large', 'type_not_allowed'].includes(logoError) ? logoError : 'failed'}`)}</p>}
      </div>
      {save.isSuccess && <p role="status" className="flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="size-4" aria-hidden />{t('ai.settings.saved')}</p>}
      {save.isError && <p role="alert" className="text-sm text-danger">{t('admin.design.invalid')}</p>}
      <Button className="self-start" onClick={() => save.mutate(branding)} disabled={save.isPending}>{t('chat.save')}</Button>
    </section>
  )
}

function WordingCard({ texts, onChange, data, kind, lang, onKind, onLang }: {
  texts: Texts; onChange: (t: Texts) => void; data: TextsOut; kind: EmailKind; lang: Lang; onKind: (k: EmailKind) => void; onLang: (l: Lang) => void
}) {
  const { t } = useTranslation()
  const save = useSaveTexts()
  const current: EmailText = texts[kind]?.[lang] ?? { subject: '', intro: '' }
  const defaults = data.defaults[kind]?.[lang] ?? { subject: '', intro: '' }
  const set = (patch: Partial<EmailText>) =>
    onChange({ ...texts, [kind]: { ...texts[kind], [lang]: { ...current, ...patch } } })

  return (
    <section className="card flex flex-col gap-4 p-5" aria-labelledby="wording-title">
      <h3 id="wording-title" className="flex items-center gap-2 font-semibold"><Type className="size-5 text-accent" aria-hidden />{t('admin.design.wording')}</h3>
      <p className="text-[13px] text-muted-foreground">{t('admin.design.wordingHint')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">{t('admin.design.kind')}
          <select value={kind} onChange={(e) => onKind(e.target.value as EmailKind)} className="field">
            {EMAIL_KINDS.map((k) => <option key={k} value={k}>{t(`admin.design.kinds.${k}`)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">{t('app.language')}
          <select value={lang} onChange={(e) => onLang(e.target.value as Lang)} className="field">
            {LANGS.map((l) => <option key={l} value={l}>{LANGUAGE_NAMES[l]}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email-subject" className="text-sm font-medium">{kind === 'digest' ? t('admin.design.subject') : t('admin.design.label')}</label>
        <input id="email-subject" value={current.subject} onChange={(e) => set({ subject: e.target.value })} placeholder={defaults.subject} maxLength={150}
          className="field" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} aria-describedby="email-subject-hint" />
        <span id="email-subject-hint" className="text-xs text-muted-foreground">{kind === 'digest' ? t('admin.design.subjectHint') : t('admin.design.labelHint')}</span>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">{t('admin.design.intro')}
        <textarea rows={3} value={current.intro} onChange={(e) => set({ intro: e.target.value })} placeholder={defaults.intro || t('admin.design.introPlaceholder')}
          maxLength={1000} className="field resize-y" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => save.mutate(texts)} disabled={save.isPending}>{t('chat.save')}</Button>
        {(current.subject || current.intro) && <Button variant="ghost" onClick={() => set({ subject: '', intro: '' })}>{t('admin.design.useDefault')}</Button>}
        {save.isSuccess && <span role="status" className="flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="size-4" aria-hidden />{t('ai.settings.saved')}</span>}
        {save.isError && <span role="alert" className="text-sm text-danger">{t('admin.errors.failed')}</span>}
      </div>
    </section>
  )
}

function PreviewCard({ kind, lang, branding, texts, meEmail }: { kind: EmailKind; lang: Lang; branding: Branding; texts: Texts; meEmail: string }) {
  const { t } = useTranslation()
  const preview = usePreview()
  const test = useTestKind()
  const [to, setTo] = useState(meEmail)
  const { mutate } = preview
  useEffect(() => {
    const id = setTimeout(() => mutate({ kind, lang, branding, texts }), PREVIEW_DELAY_MS)
    return () => clearTimeout(id)
  }, [kind, lang, branding, texts, mutate])

  return (
    <section className="card flex flex-col gap-3 p-5 lg:sticky lg:top-4" aria-labelledby="preview-title">
      <h3 id="preview-title" className="font-semibold">{t('admin.design.preview')}</h3>
      <p className="truncate rounded-lg bg-muted px-3 py-2 text-sm" dir="auto">
        <span className="text-muted-foreground">{t('admin.design.subject')} : </span>{preview.data?.subject ?? '…'}
      </p>
      {/* Sandboxed: the email HTML runs nothing and cannot reach the app. */}
      <iframe title={t('admin.design.preview')} sandbox="" srcDoc={preview.data?.html ?? ''}
        className="h-[34rem] w-full rounded-lg border border-border bg-[#f5f5f5]" />
      <p className="text-xs text-muted-foreground">{t('admin.design.previewHint')}</p>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); test.mutate({ to, kind, lang }) }}>
        <input type="email" required value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('admin.smtp.testTo')} className="field min-w-0 flex-1" dir="ltr" />
        <Button type="submit" variant="outline" disabled={test.isPending}><Send className="size-4" aria-hidden />{t('admin.design.sendExample')}</Button>
      </form>
      {test.isSuccess && <p role="status" className="text-sm text-success">{t('admin.smtp.testSent', { to })}</p>}
      {test.isError && <p role="alert" className="text-sm text-danger">{t('admin.smtp.failedConnect')}</p>}
    </section>
  )
}

/** Branding, wording per email type and language, with a live preview of unsaved changes. */
export function EmailDesign({ meEmail }: { meEmail: string }) {
  const { i18n } = useTranslation()
  const savedBranding = useBranding().data
  const savedTexts = useTexts().data
  if (!savedBranding || !savedTexts) return null
  return <EmailDesignForm savedBranding={savedBranding} savedTexts={savedTexts} meEmail={meEmail} initialLang={(['fr', 'en', 'ar'].includes(i18n.language) ? i18n.language : 'fr') as Lang} />
}

function EmailDesignForm({ savedBranding, savedTexts, meEmail, initialLang }: { savedBranding: BrandingOut; savedTexts: TextsOut; meEmail: string; initialLang: Lang }) {
  const [branding, setBranding] = useState<Branding>({ name: savedBranding.name, color: savedBranding.color, footer: savedBranding.footer })
  const [texts, setTexts] = useState<Texts>(savedTexts.overrides)
  const [kind, setKind] = useState<EmailKind>('task')
  const [lang, setLang] = useState<Lang>(initialLang)
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="flex flex-col gap-4">
        <AppearanceCard branding={branding} onChange={setBranding} saved={savedBranding} />
        <WordingCard texts={texts} onChange={setTexts} data={savedTexts} kind={kind} lang={lang} onKind={setKind} onLang={setLang} />
      </div>
      <PreviewCard kind={kind} lang={lang} branding={branding} texts={texts} meEmail={meEmail} />
    </div>
  )
}
