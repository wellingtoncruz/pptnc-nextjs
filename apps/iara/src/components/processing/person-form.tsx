'use client'

import type { UseFormReturn } from 'react-hook-form'
import { useWatch } from 'react-hook-form'

import { GuestAvatarUploader } from '@/components/processing/guest-avatar-uploader'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PersonFormProps {
  /** react-hook-form instance */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>
  /** Field path prefix (e.g., 'coHost' or 'guests.0') */
  prefix: string
  /** Label for this person (e.g., 'Co-host', 'Convidado 1') */
  label: string
  /** Whether all fields are required */
  required?: boolean
  /** Whether to show remove button */
  showRemove?: boolean
  /** Callback when remove is clicked */
  onRemove?: () => void
  /** Whether ALL fields are disabled (overrides nonLinkedinFieldsLocked). */
  disabled?: boolean
  /**
   * When true, only the LinkedIn field is editable; name/role/company are
   * locked until scraping fills them. The default `false` preserves the
   * legacy fully-editable behavior. (Story 24.7)
   */
  nonLinkedinFieldsLocked?: boolean
  /**
   * Avatar URL displayed discreetly beside the header (Story 24.7 polish).
   * When set, renders a 36x36 rounded thumbnail. Typically points to the
   * `/api/guests/[key]/avatar` proxy populated after scrape.
   */
  avatarUrl?: string | null
  /**
   * Names of fields that came back empty from the scrape and need manual
   * entry — name/role/company. Renders amber border + helper text on each.
   * (Story 24.7 polish)
   */
  missingFields?: ReadonlySet<'name' | 'role' | 'company'>
  /**
   * Fires when the producer uploads an avatar manually (file picker, drag-drop
   * or clipboard paste). Receives the proxy URL — caller persists it in the
   * same `enrichmentAvatars` map used by the scrape flow. (Story 24.7 polish)
   */
  onAvatarUploaded?: (proxyUrl: string) => void
}

/**
 * Reusable form for co-host or guest person data.
 *
 * Fields: name, role, company, linkedinUrl
 */
export function PersonForm({
  form,
  prefix,
  label,
  required = true,
  showRemove = false,
  onRemove,
  disabled = false,
  nonLinkedinFieldsLocked = false,
  avatarUrl,
  missingFields,
  onAvatarUploaded,
}: PersonFormProps) {
  const { register, formState: { errors }, control } = form
  // Live LinkedIn value so the uploader only appears when there's a URL to
  // associate the manual avatar with on the backend.
  const linkedinValue = useWatch({ control, name: `${prefix}.linkedin` }) as string | undefined

  // Name/role/company stay locked until scrape fills them OR producer flips
  // the locked state from the parent (Story 24.7). LinkedIn is always editable
  // unless `disabled` (global) is set, since it's the input that triggers scrape.
  const nonLinkedinDisabled = disabled || nonLinkedinFieldsLocked
  const linkedinDisabled = disabled

  // Highlight (amber) is suppressed while fields are locked to avoid drawing
  // attention before scrape resolves — only relevant after enrichment lands.
  const isMissing = (field: 'name' | 'role' | 'company'): boolean =>
    !nonLinkedinFieldsLocked && Boolean(missingFields?.has(field))

  const fieldHighlightClass = (field: 'name' | 'role' | 'company'): string =>
    isMissing(field) ? 'border-amber-500/60 focus-visible:ring-amber-500/40' : ''

  // Helper to get nested error
  const getError = (field: string): string | undefined => {
    const parts = `${prefix}.${field}`.split('.')
    let current: Record<string, unknown> | undefined = errors as Record<string, unknown>
    for (const part of parts) {
      if (!current) break
      current = current[part] as Record<string, unknown> | undefined
    }
    return (current as { message?: string } | undefined)?.message
  }

  const nameError = getError('name')
  const roleError = getError('role')
  const companyError = getError('company')
  const linkedinError = getError('linkedin')

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`Foto de ${label}`}
              width={36}
              height={36}
              className="size-9 rounded-full object-cover border border-border bg-muted"
            />
          ) : (
            // No avatar yet — show manual uploader ONLY after the scrape
            // round has finished (status === 'enriched' or 'manual', i.e.
            // nonLinkedinFieldsLocked is false). Avoids the button flashing
            // while BrightData is still working and a photo might arrive.
            onAvatarUploaded &&
            !nonLinkedinFieldsLocked &&
            linkedinValue?.trim() && (
              <GuestAvatarUploader
                linkedinUrl={linkedinValue.trim()}
                onUploaded={onAvatarUploaded}
              />
            )
          )}
          <h4 className="font-medium text-sm">{label}</h4>
        </div>
        {showRemove && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="text-xs text-destructive hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Remover
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${prefix}.name`}>
            Nome {required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={`${prefix}.name`}
            placeholder="Nome completo"
            {...register(`${prefix}.name`)}
            disabled={nonLinkedinDisabled}
            className={fieldHighlightClass('name')}
          />
          {nameError && (
            <p className="text-xs text-destructive">{nameError}</p>
          )}
          {isMissing('name') && !nameError && (
            <p className="text-xs text-amber-500">Preencha manualmente</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${prefix}.role`}>
            Cargo {required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={`${prefix}.role`}
            placeholder="Ex: CEO, CTO, Fundador"
            {...register(`${prefix}.role`)}
            disabled={nonLinkedinDisabled}
            className={fieldHighlightClass('role')}
          />
          {roleError && (
            <p className="text-xs text-destructive">{roleError}</p>
          )}
          {isMissing('role') && !roleError && (
            <p className="text-xs text-amber-500">Preencha manualmente</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${prefix}.company`}>
            Empresa
          </Label>
          <Input
            id={`${prefix}.company`}
            placeholder="Nome da empresa"
            {...register(`${prefix}.company`)}
            disabled={nonLinkedinDisabled}
            className={fieldHighlightClass('company')}
          />
          {companyError && (
            <p className="text-xs text-destructive">{companyError}</p>
          )}
          {isMissing('company') && !companyError && (
            <p className="text-xs text-amber-500">Preencha manualmente</p>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${prefix}.linkedin`}>
            LinkedIn {required && <span className="text-destructive">*</span>}
          </Label>
          <Input
            id={`${prefix}.linkedin`}
            placeholder="https://linkedin.com/in/..."
            type="url"
            disabled={linkedinDisabled}
            {...register(`${prefix}.linkedin`)}
          />
          {linkedinError && (
            <p className="text-xs text-destructive">{linkedinError}</p>
          )}
        </div>
      </div>
    </div>
  )
}
