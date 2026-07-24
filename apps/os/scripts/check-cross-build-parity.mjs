#!/usr/bin/env node
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const appRoot = process.cwd()
const fixturePath = path.join(appRoot, 'shared-data/fixtures/shared-data-bundle-v1.json')
const expectedPath = path.join(appRoot, 'shared-data/fixtures/phase11-parity-report.json')
const sourcePath = path.join(appRoot, 'src/data/shared/sharedDataParityQa.ts')

for (const requiredPath of [fixturePath, expectedPath, sourcePath]) {
  if (!existsSync(requiredPath)) throw new Error(`Phase 11 required file is missing: ${requiredPath}`)
}

const findFile = (directory, basename) => {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry)
    if (statSync(full).isDirectory()) {
      const nested = findFile(full, basename)
      if (nested) return nested
    } else if (entry === basename) {
      return full
    }
  }
  return null
}

const temp = await mkdtemp(path.join(tmpdir(), 'fleurstales-phase11-'))
try {
  const localTsc = path.join(appRoot, 'node_modules/.bin/tsc')
  const tsc = existsSync(localTsc) ? localTsc : 'tsc'
  const compile = spawnSync(tsc, [
    '--pretty', 'false',
    '--target', 'ES2022',
    '--module', 'commonjs',
    '--moduleResolution', 'node',
    '--esModuleInterop',
    '--skipLibCheck',
    '--lib', 'ES2022,DOM',
    '--outDir', temp,
    sourcePath,
  ], { cwd: appRoot, encoding: 'utf8' })

  if (compile.status !== 0) {
    process.stderr.write(compile.stdout || '')
    process.stderr.write(compile.stderr || '')
    throw new Error('Phase 11 dependency-free TypeScript compile failed.')
  }

  const compiledScenario = findFile(temp, 'sharedDataParityQa.js')
  if (!compiledScenario) throw new Error('Compiled Phase 11 scenario was not found.')
  const require = createRequire(import.meta.url)
  const { runSharedDataParityScenario } = require(compiledScenario)

  const envelope = JSON.parse(readFileSync(fixturePath, 'utf8'))
  const expected = JSON.parse(readFileSync(expectedPath, 'utf8'))
  const actual = await runSharedDataParityScenario(envelope.data)
  assert.deepEqual(actual, expected, 'Phase 11 deterministic shared-data scenario drifted from the locked expected report.')

  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(actual)}\n`)
  } else {
    console.log('Phase 11 cross-build parity scenario PASS')
    console.log(`Initial fingerprint: ${actual.initialFingerprint}`)
    console.log(`Final fingerprint:   ${actual.finalFingerprint}`)
    console.log(`Orders: ${actual.finalCounts.orders}; Customers: ${actual.finalCounts.customers}; authoritative total: ${actual.authoritativeMutation.totalIdr}`)
  }
} finally {
  rmSync(temp, { recursive: true, force: true })
}
