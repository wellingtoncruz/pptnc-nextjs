'use client'

import { useEffect, useMemo, useState } from 'react'

import { Textarea } from '@/components/ui/textarea'
import { SaveStatusIndicator } from '@/components/settings/save-status-indicator'
import { CopyButton } from './copy-button'
import { useAutoSave } from '@/hooks/use-auto-save'
import { parseHashtags } from './parse-hashtags'
import type { SocialPost } from '@/types/social'

interface SocialPostEditorProps {
  videoId: string
  networkId: string
  post: SocialPost
  onPostUpdated: (post: SocialPost) => void
}

export function SocialPostEditor({ videoId, networkId, post, onPostUpdated }: SocialPostEditorProps) {
  const [editCta, setEditCta] = useState(post.cta)
  const [editBody, setEditBody] = useState(post.body)
  const [editHashtags, setEditHashtags] = useState(post.hashtags.join(' '))

  // Sync local state when post changes externally (e.g., after reprocessing)
  // Use derived string for hashtags to avoid unnecessary resets from array reference changes
  const hashtagsJoined = post.hashtags.join(' ')
  useEffect(() => {
    setEditCta(post.cta)
    setEditBody(post.body)
    setEditHashtags(hashtagsJoined)
  }, [post.cta, post.body, hashtagsJoined])

  const combinedValue = useMemo(() => ({
    cta: editCta,
    body: editBody,
    hashtags: parseHashtags(editHashtags),
  }), [editCta, editBody, editHashtags])

  const { saveStatus } = useAutoSave(
    combinedValue,
    async (value) => {
      // Prevent saving empty CTA or body (AC edge case: "deve impedir")
      if (!value.cta.trim() || !value.body.trim()) return
      const response = await fetch(
        `/api/videos/${videoId}/social-posts/${networkId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        }
      )
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error?.message || 'Erro ao salvar post')
      }
      onPostUpdated({ ...post, ...value, processedBy: 'manual' })
    },
    1500
  )

  const parsedHashtags = useMemo(
    () => parseHashtags(editHashtags),
    [editHashtags]
  )

  const hashtagsText = useMemo(
    () => parsedHashtags.join(' '),
    [parsedHashtags]
  )

  return (
    <div data-testid="social-post-editor" className="space-y-5">
      {/* CTA */}
      <div className="space-y-1.5">
        <label htmlFor={`cta-${networkId}`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Call to Action
        </label>
        <div className="flex items-start gap-2">
          <Textarea
            id={`cta-${networkId}`}
            value={editCta}
            onChange={(e) => setEditCta(e.target.value)}
            className="min-h-[56px] resize-none font-medium"
            rows={2}
            placeholder="Call to Action"
          />
          <CopyButton text={editCta} label="CTA" />
        </div>
      </div>

      {/* Body */}
      <div className="space-y-1.5">
        <label htmlFor={`body-${networkId}`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Corpo do post
        </label>
        <div className="flex items-start gap-2">
          <Textarea
            id={`body-${networkId}`}
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            className="min-h-[120px] resize-none"
            placeholder="Corpo do post"
          />
          <CopyButton text={editBody} label="corpo" />
        </div>
      </div>

      {/* Hashtags */}
      <div className="space-y-1.5">
        <label htmlFor={`hashtags-${networkId}`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Hashtags
        </label>
        <div className="flex items-start gap-2">
          <Textarea
            id={`hashtags-${networkId}`}
            value={editHashtags}
            onChange={(e) => setEditHashtags(e.target.value)}
            className="min-h-[60px] resize-none text-sm text-muted-foreground"
            placeholder="#hashtag1 #hashtag2"
          />
          <CopyButton text={hashtagsText} label="hashtags" />
        </div>
        {parsedHashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1" data-testid="hashtag-pills">
            {parsedHashtags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <SaveStatusIndicator status={saveStatus} />
    </div>
  )
}
