import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('dropdown indicator spacing', () => {
  it('keeps native select arrows inset from rounded field edges', () => {
    const styles = read('src/shadcn.css')
    expect(styles).toContain('background-position: right 1rem center')
    expect(styles).toContain('padding-right: 2.75rem !important')
  })

  it('keeps shared Radix select arrows inset as well', () => {
    expect(read('src/components/ui/select.tsx')).toContain(
      'mr-1 size-4 shrink-0 opacity-50',
    )
  })
})
