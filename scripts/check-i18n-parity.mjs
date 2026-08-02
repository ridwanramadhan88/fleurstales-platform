import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const osPath = resolve(root, 'apps/os/src/i18n/naturalTranslations.ts')
const storefrontPath = resolve(root, 'apps/storefront/src/i18n/naturalTranslations.ts')

const normalize = (value) => value.replace(/\r\n/g, '\n').trim()
const os = normalize(readFileSync(osPath, 'utf8'))
const storefront = normalize(readFileSync(storefrontPath, 'utf8'))

if (os !== storefront) {
  console.error('Indonesian translation parity failed: OS and Storefront dictionaries differ.')
  process.exit(1)
}

console.log('Indonesian translation parity check passed.')
