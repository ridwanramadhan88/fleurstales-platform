import { createApplication } from './src/app.mjs'

const app = createApplication()
await app.listen()
console.log(`Fleurstales local backend listening on http://localhost:${app.config.port}`)
console.log(`SQLite database: ${app.config.databaseFile}`)
console.log(`Local uploads: ${app.config.uploadDir}`)

const shutdown = async () => {
  try { await app.close() } finally { process.exit(0) }
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
