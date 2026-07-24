import type { FC } from 'react'
import { useState } from 'react'
import { Flower2 } from 'lucide-react'

interface Props {
  logoUrl?: string
  alt: string
  className?: string
  iconClassName?: string
}

export const StoreBrandMark: FC<Props> = ({ logoUrl, alt, className = 'size-8', iconClassName = 'size-4' }) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const canShowImage = Boolean(logoUrl?.trim()) && failedUrl !== logoUrl

  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-foreground text-background ${className}`}>
      {canShowImage ? (
        <img src={logoUrl} alt={alt} className="h-full w-full object-cover" onError={() => setFailedUrl(logoUrl ?? null)} />
      ) : (
        <Flower2 className={iconClassName} aria-hidden="true" />
      )}
    </span>
  )
}
