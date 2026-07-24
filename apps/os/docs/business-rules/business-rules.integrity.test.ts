import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const gapLogPath = join(here, 'gap-log.md')
const pairingPath = join(here, 'gap-log.pairing.test.ts')
const markdownFiles = readdirSync(here)
  .filter((name) => name.endsWith('.md'))
  .map((name) => join(here, name))

const sectionNumbers = (text: string): Set<number> =>
  new Set([...text.matchAll(/^## §(\d+)\b/gm)].map((match) => Number(match[1])))

const referencedGapNumbers = (text: string): Set<number> =>
  new Set([...text.matchAll(/§(\d+)\b/g)].map((match) => Number(match[1])))

describe('business-rules documentation integrity', () => {
  it('ships the gap log and all expected numbered sections', () => {
    expect(statSync(gapLogPath).isFile()).toBe(true)
    const sections = sectionNumbers(readFileSync(gapLogPath, 'utf8'))
    expect([...sections].sort((a, b) => a - b)).toEqual(Array.from({ length: 28 }, (_, index) => index + 1))
  })

  it('does not reference missing business-rule Markdown files', () => {
    const missing: string[] = []
    for (const path of markdownFiles) {
      const text = readFileSync(path, 'utf8')
      for (const match of text.matchAll(/`([a-z0-9-]+\.md)`/gi)) {
        const target = resolve(here, match[1])
        try {
          if (!statSync(target).isFile()) missing.push(`${path}: ${match[1]}`)
        } catch {
          missing.push(`${path}: ${match[1]}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('keeps every numbered gap reference backed by a gap-log section', () => {
    const sections = sectionNumbers(readFileSync(gapLogPath, 'utf8'))
    const missing: string[] = []
    for (const path of markdownFiles) {
      const text = readFileSync(path, 'utf8')
      for (const number of referencedGapNumbers(text)) {
        if (!sections.has(number)) missing.push(`${path}: §${number}`)
      }
    }
    for (const number of referencedGapNumbers(readFileSync(pairingPath, 'utf8'))) {
      if (!sections.has(number)) missing.push(`${pairingPath}: §${number}`)
    }
    expect(missing).toEqual([])
  })

  it('keeps each pairing-suite gap mapped to the written log', () => {
    const gapSections = sectionNumbers(readFileSync(gapLogPath, 'utf8'))
    const pairingSections = new Set(
      [...readFileSync(pairingPath, 'utf8').matchAll(/describe\(['\"]§(\d+)\b/g)].map((match) => Number(match[1])),
    )
    expect([...pairingSections].every((number) => gapSections.has(number))).toBe(true)
  })
})
