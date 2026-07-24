import { copyFile, mkdir, readdir, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export const backupDatabase = async ({ db, databaseFile, backupDir, keep = 30 }) => {
  if (!existsSync(databaseFile)) return undefined
  await mkdir(backupDir, { recursive: true })
  try { db.exec('PRAGMA wal_checkpoint(FULL)') } catch { /* best effort */ }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = resolve(backupDir, `fleurstales-${stamp}.db`)
  await copyFile(databaseFile, target)
  const files = (await readdir(backupDir)).filter((file) => file.endsWith('.db')).sort()
  while (files.length > keep) {
    const oldest = files.shift()
    if (oldest) await unlink(resolve(backupDir, oldest))
  }
  return target
}
