'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Check, Copy } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface CopyButtonProps {
  text: string
  label?: string
}

export function CopyButton({ text, label = 'texto' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current)
  }, [])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      clearTimeout(timeoutRef.current)
      setCopied(true)
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may not be available in some browsers
    }
  }, [text])

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={handleCopy}
      aria-label={copied ? 'Copiado' : `Copiar ${label}`}
    >
      {copied ? (
        <Check className="size-4 text-green-500" />
      ) : (
        <Copy className="size-4 text-muted-foreground" />
      )}
    </Button>
  )
}
