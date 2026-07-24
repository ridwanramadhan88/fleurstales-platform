import { createConfig } from '../src/config.mjs'
import { openDatabase } from '../src/database/database.mjs'
import { runMigrations } from '../src/database/migrations.mjs'
const config = createConfig()
const db = openDatabase(config.databaseFile)
const count = runMigrations(db, config.migrationsDir)
db.close()
console.log(`Database ready: ${config.databaseFile} (${count} migration files checked)`)
