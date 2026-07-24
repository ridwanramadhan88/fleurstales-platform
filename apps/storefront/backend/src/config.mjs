import { resolve } from 'node:path'

export const createConfig = (overrides = {}) => ({
  port: Number(overrides.port ?? process.env.PORT ?? 8787),
  corsOrigin: String(overrides.corsOrigin ?? process.env.CORS_ORIGIN ?? '*'),
  databaseFile: resolve(String(overrides.databaseFile ?? process.env.FLEURSTALES_DB_FILE ?? './backend/database/fleurstales.db')),
  migrationsDir: resolve(String(overrides.migrationsDir ?? './backend/database/migrations')),
  usersFile: resolve(String(overrides.usersFile ?? process.env.FLEURSTALES_USERS_FILE ?? './backend/users.json')),
  uploadDir: resolve(String(overrides.uploadDir ?? process.env.FLEURSTALES_UPLOAD_DIR ?? './backend/uploads')),
  backupDir: resolve(String(overrides.backupDir ?? process.env.FLEURSTALES_BACKUP_DIR ?? './backend/data/backups')),
  legacyStateFile: resolve(String(overrides.legacyStateFile ?? process.env.FLEURSTALES_LEGACY_STATE_FILE ?? './backend/data/state.json')),
  sessionHours: Number(overrides.sessionHours ?? process.env.SESSION_HOURS ?? 12),
  publicBaseUrl: String(overrides.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, ''),
})
