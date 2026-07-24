import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { withTransaction } from './database.mjs'

export const runMigrations = (db, migrationsDir) => {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`)
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version))
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
  for (const file of files) {
    const version = file.replace(/\.sql$/, '')
    if (applied.has(version)) continue
    const sql = readFileSync(resolve(migrationsDir, file), 'utf8')
    withTransaction(db, () => {
      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString())
    })
  }
  return files.length
}
