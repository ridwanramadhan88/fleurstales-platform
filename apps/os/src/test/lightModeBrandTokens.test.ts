import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/shadcn.css', 'utf8')
const vectorExport = readFileSync('src/lib/vectorPdfExport.ts', 'utf8')

const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
const darkBlock = css.match(/\.dark\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''

describe('light-mode brand tokens', () => {
  it('uses botanical green for the light primary, focus, chart, and sidebar accents', () => {
    expect(rootBlock).toContain('--primary: 157 27% 35%')
    expect(rootBlock).toContain('--ring: 157 27% 35%')
    expect(rootBlock).toContain('--chart-1: 157 27% 35%')
    expect(rootBlock).toContain('--sidebar-primary: 157 27% 35%')
    expect(rootBlock).toContain('--sidebar-ring: 157 27% 35%')
  })

  it('keeps informational blue semantic and preserves the dark-mode primary', () => {
    expect(rootBlock).toContain('--info: 211 82% 48%')
    expect(darkBlock).toContain('--primary: 151 42% 52%')
    expect(darkBlock).toContain('--info: 205 78% 62%')
  })


  it('keeps warm light-mode surfaces visibly separated', () => {
    expect(rootBlock).toContain('--surface-page: 42 25% 96.5%')
    expect(rootBlock).toContain('--surface-card: 42 33% 99.5%')
    expect(rootBlock).toContain('--surface-panel: 90 17% 93.5%')
    expect(rootBlock).toContain('--border: 90 11% 82.5%')
    expect(rootBlock).toContain('--muted-foreground: 155 8% 40%')
    expect(rootBlock).toContain('--sidebar-background: 90 18% 93.5%')
    expect(rootBlock).toContain('--sidebar-accent: 151 25% 87.5%')
  })

  it('uses visible but restrained semantic surfaces in light mode', () => {
    expect(rootBlock).toContain('--surface-info: 204 62% 92%')
    expect(rootBlock).toContain('--surface-success: 150 34% 91.5%')
    expect(rootBlock).toContain('--surface-warning: 39 86% 92%')
    expect(rootBlock).toContain('--surface-error: 4 62% 93%')
  })

  it('keeps vector exports aligned with the light-mode charcoal palette', () => {
    expect(vectorExport).toContain("primary: '#2A2D32'")
    expect(vectorExport).toContain("primarySoft: '#F0F1F2'")
  })
})
