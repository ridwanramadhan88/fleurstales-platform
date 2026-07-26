import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/shadcn.css', 'utf8')
const vectorExport = readFileSync('src/lib/vectorPdfExport.ts', 'utf8')

const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
const darkBlock = css.match(/\.dark\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''

describe('light-mode brand tokens', () => {
  it('uses Apple blue for the light primary, focus, chart, and sidebar accents', () => {
    expect(rootBlock).toContain('--primary: 211 100% 50%')
    expect(rootBlock).toContain('--ring: 211 100% 50%')
    expect(rootBlock).toContain('--chart-1: 211 100% 50%')
    expect(rootBlock).toContain('--sidebar-primary: 211 100% 50%')
    expect(rootBlock).toContain('--sidebar-ring: 211 100% 50%')
  })

  it('keeps informational blue semantic and preserves the dark-mode primary', () => {
    expect(rootBlock).toContain('--info: 211 100% 50%')
    expect(darkBlock).toContain('--primary: 211 100% 55%')
    expect(darkBlock).toContain('--info: 211 100% 65%')
  })


  it('keeps cool neutral light-mode surfaces visibly separated', () => {
    expect(rootBlock).toContain('--surface-page: 240 6% 96%')
    expect(rootBlock).toContain('--surface-card: 0 0% 100%')
    expect(rootBlock).toContain('--surface-panel: 240 5% 94%')
    expect(rootBlock).toContain('--border: 240 5% 84%')
    expect(rootBlock).toContain('--muted-foreground: 240 3% 44%')
    expect(rootBlock).toContain('--sidebar-background: 240 6% 95%')
    expect(rootBlock).toContain('--sidebar-accent: 211 100% 94.5%')
  })

  it('uses visible but restrained semantic surfaces in light mode', () => {
    expect(rootBlock).toContain('--surface-info: 211 100% 95.5%')
    expect(rootBlock).toContain('--surface-success: 135 54% 94%')
    expect(rootBlock).toContain('--surface-warning: 42 100% 95%')
    expect(rootBlock).toContain('--surface-error: 4 100% 96%')
  })

  it('keeps vector exports aligned with the light-mode charcoal palette', () => {
    expect(vectorExport).toContain("primary: '#2A2D32'")
    expect(vectorExport).toContain("primarySoft: '#F0F1F2'")
  })
})
