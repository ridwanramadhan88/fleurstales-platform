import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/shadcn.css', 'utf8')
const vectorExport = readFileSync('src/lib/vectorPdfExport.ts', 'utf8')

const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
const darkBlock = css.match(/\.dark\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''

describe('light-mode brand tokens', () => {
  it('uses charcoal for the light primary, focus, chart, and sidebar accents', () => {
    expect(rootBlock).toContain('--primary: 220 9% 17%')
    expect(rootBlock).toContain('--ring: 220 8% 42%')
    expect(rootBlock).toContain('--chart-1: 220 9% 22%')
    expect(rootBlock).toContain('--sidebar-primary: 220 9% 17%')
    expect(rootBlock).toContain('--sidebar-ring: 220 8% 42%')
  })

  it('keeps informational blue semantic and preserves the dark-mode primary', () => {
    expect(rootBlock).toContain('--info: 211 82% 48%')
    expect(darkBlock).toContain('--primary: 211 100% 45%')
    expect(darkBlock).toContain('--info: 205 78% 62%')
  })


  it('keeps light-mode surfaces visibly separated without changing the monochrome brand', () => {
    expect(rootBlock).toContain('--surface-page: 240 18% 94.2%')
    expect(rootBlock).toContain('--surface-card: 0 0% 100%')
    expect(rootBlock).toContain('--surface-panel: 240 13% 90.8%')
    expect(rootBlock).toContain('--border: 240 10% 84.5%')
    expect(rootBlock).toContain('--muted-foreground: 240 6% 36%')
    expect(rootBlock).toContain('--sidebar-background: 240 16% 92.8%')
    expect(rootBlock).toContain('--sidebar-accent: 240 11% 86.5%')
  })

  it('uses visible but restrained semantic surfaces in light mode', () => {
    expect(rootBlock).toContain('--surface-info: 211 62% 92.5%')
    expect(rootBlock).toContain('--surface-success: 142 38% 92.5%')
    expect(rootBlock).toContain('--surface-warning: 38 78% 92.5%')
    expect(rootBlock).toContain('--surface-error: 4 62% 93%')
  })

  it('keeps vector exports aligned with the light-mode charcoal palette', () => {
    expect(vectorExport).toContain("primary: '#2A2D32'")
    expect(vectorExport).toContain("primarySoft: '#F0F1F2'")
  })
})
