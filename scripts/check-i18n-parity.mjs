import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const normalize = (value) => value.replace(/\r\n/g, '\n').trim()

const sharedFiles = [
  'naturalTranslations.ts',
  'translateUiText.ts',
  'UiLanguageBridge.tsx',
]

for (const file of sharedFiles) {
  const osPath = resolve(root, 'apps/os/src/i18n', file)
  const storefrontPath = resolve(root, 'apps/storefront/src/i18n', file)
  const os = normalize(readFileSync(osPath, 'utf8'))
  const storefront = normalize(readFileSync(storefrontPath, 'utf8'))

  if (os !== storefront) {
    console.error(`Indonesian i18n parity failed: OS and Storefront ${file} differ.`)
    process.exit(1)
  }
}

console.log('Indonesian i18n parity check passed.')
