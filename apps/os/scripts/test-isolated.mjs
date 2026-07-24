import { readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const testFiles = []
const ignored = new Set(['node_modules', 'dist', '.git', 'coverage'])

const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }
    if (!['.ts', '.tsx'].includes(extname(entry.name))) continue
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      testFiles.push(relative(root, fullPath))
    }
  }
}

walk(join(root, 'src'))
walk(join(root, 'docs'))
testFiles.sort()

console.log(`Running ${testFiles.length} test files in isolated processes...`)
const failures = []
const startedAt = Date.now()

for (const [index, file] of testFiles.entries()) {
  const result = spawnSync(
    process.execPath,
    [
      './node_modules/vitest/vitest.mjs',
      'run',
      file,
      '--pool=forks',
      '--poolOptions.forks.singleFork=true',
      '--reporter=dot',
    ],
    { cwd: root, stdio: 'pipe', encoding: 'utf8', env: process.env },
  )

  if (result.status === 0) {
    console.log(`[${index + 1}/${testFiles.length}] PASS ${file}`)
  } else {
    console.error(`[${index + 1}/${testFiles.length}] FAIL ${file}`)
    if (result.stdout) console.error(result.stdout.trim())
    if (result.stderr) console.error(result.stderr.trim())
    failures.push(file)
  }
}

const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1)
if (failures.length) {
  console.error(`\n${failures.length} isolated test file(s) failed after ${durationSeconds}s:`)
  failures.forEach((file) => console.error(`- ${file}`))
  process.exit(1)
}

console.log(`\nAll ${testFiles.length} isolated test files passed in ${durationSeconds}s.`)
