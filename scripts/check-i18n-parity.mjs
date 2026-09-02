import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const normalize = (value) => value.replace(/\r\n/g, '\n').trim()

const sharedFiles = [
  'idTranslations.ts',
  'naturalTranslations.ts',
  'indonesianTranslations.ts',
  'reviewedTranslations.ts',
  'translateUiText.ts',
  'translateUiText.test.ts',
  'UiLanguageBridge.tsx',
]

const reportFirstDifference = (file, os, storefront) => {
  const osLines = os.split('\n')
  const storefrontLines = storefront.split('\n')
  const max = Math.max(osLines.length, storefrontLines.length)
  for (let index = 0; index < max; index += 1) {
    if (osLines[index] !== storefrontLines[index]) {
      console.error(`First difference at ${file}:${index + 1}`)
      console.error(`OS: ${JSON.stringify(osLines[index] ?? '<missing>')}`)
      console.error(`Storefront: ${JSON.stringify(storefrontLines[index] ?? '<missing>')}`)
      return
    }
  }
}

for (const file of sharedFiles) {
  const osPath = resolve(root, 'apps/os/src/i18n', file)
  const storefrontPath = resolve(root, 'apps/storefront/src/i18n', file)
  const os = normalize(readFileSync(osPath, 'utf8'))
  const storefront = normalize(readFileSync(storefrontPath, 'utf8'))

  if (os !== storefront) {
    console.error(`Indonesian i18n parity failed: OS and Storefront ${file} differ.`)
    reportFirstDifference(file, os, storefront)
    process.exit(1)
  }
}

console.log('Indonesian i18n parity check passed.')
