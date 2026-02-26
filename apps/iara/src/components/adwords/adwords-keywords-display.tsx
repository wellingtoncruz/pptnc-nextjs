'use client'

import { CopyButton } from '@/components/social/copy-button'
import { Badge } from '@/components/ui/badge'

interface AdwordsKeywordsDisplayProps {
  keywords: string[]
}

export function AdwordsKeywordsDisplay({ keywords }: AdwordsKeywordsDisplayProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold">Keywords</h3>
        <CopyButton text={keywords.join('\n')} label="keywords" />
      </div>
      <div
        data-testid="adwords-keywords-container"
        className="flex flex-wrap gap-2"
      >
        {keywords.map((keyword, index) => (
          <Badge key={`${keyword}-${index}`} variant="secondary">
            {keyword}
          </Badge>
        ))}
      </div>
    </div>
  )
}
