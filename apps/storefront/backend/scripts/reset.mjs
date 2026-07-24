import { rm } from 'node:fs/promises'
import { createConfig } from '../src/config.mjs'
const config = createConfig()
await rm(config.databaseFile, { force: true })
await rm(`${config.databaseFile}-wal`, { force: true })
await rm(`${config.databaseFile}-shm`, { force: true })
await rm(config.uploadDir, { recursive: true, force: true })
console.log('Local prototype database and uploads removed. Run npm run db:migrate && npm run db:seed.')
