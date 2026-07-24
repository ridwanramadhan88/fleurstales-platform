import { useEffect, useState, type FC } from 'react'
import { Check, Copy } from 'lucide-react'

interface StorefrontCopyButtonProps {
  value: string
  label?: string
  className?: string
}

export const StorefrontCopyButton: FC<StorefrontCopyButtonProps> = ({
  value,
  label = 'Copy',
  className = '',
}) => {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timeout = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timeout)
  }, [copied])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-black/10 bg-white/72 px-3 sf-type-1 font-medium text-black/72 transition hover:border-black/16 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00813f]/25 ${className}`.trim()}
      aria-label={`Copy ${label.toLowerCase()}`}
    >
      {copied ? <Check className="size-3.5 text-[#00813f]" strokeWidth={2.35} /> : <Copy className="size-3.5" strokeWidth={1.95} />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  )
}

export default StorefrontCopyButton
