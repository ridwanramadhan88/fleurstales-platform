import type { FC, FormEvent } from 'react'
import { useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { StorefrontContainer } from './StorefrontContainer'

interface Props {
  open: boolean
  value: string
  resultCount: number
  onChange: (value: string) => void
  onSubmit: () => void
  onClose: () => void
}

export const StorefrontSearchPanel: FC<Props> = ({
  open,
  value,
  resultCount,
  onChange,
  onSubmit,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <div
      className={`storefront-search-layer ${open ? 'storefront-search-layer--open' : ''}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        className="storefront-search-backdrop"
        onClick={onClose}
        aria-label="Close search"
        tabIndex={open ? 0 : -1}
      />

      <div className="storefront-search-panel" role="dialog" aria-modal="true" aria-label="Search products">
        <StorefrontContainer>
          <form className="storefront-search-form" onSubmit={handleSubmit}>
            <Search className="storefront-search-form__icon" strokeWidth={1.8} aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className="storefront-search-form__input"
              placeholder="Search flowers"
              aria-label="Search flowers"
              tabIndex={open ? 0 : -1}
            />
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="storefront-search-form__clear tap-scale"
                aria-label="Clear search"
              >
                <X className="size-4" strokeWidth={1.8} />
              </button>
            )}
            <button
              type="submit"
              className="storefront-search-form__submit tap-scale"
              tabIndex={open ? 0 : -1}
            >
              Search
            </button>
          </form>
          {value.trim().length > 0 && (
            <p className="storefront-search-panel__support">
              {resultCount} {resultCount === 1 ? 'product' : 'products'} found
            </p>
          )}
        </StorefrontContainer>
      </div>
    </div>
  )
}
