import { createConfig } from '../src/config.mjs'
import { openDatabase } from '../src/database/database.mjs'
import { runMigrations } from '../src/database/migrations.mjs'
import { seedUsersFromFile } from '../src/database/seed.mjs'
import { AuthRepository } from '../src/modules/auth/authRepository.mjs'
const config = createConfig()
const db = openDatabase(config.databaseFile)
runMigrations(db, config.migrationsDir)
const count = seedUsersFromFile(new AuthRepository(db), config.usersFile)
db.close()
console.log(`Seeded ${count} prototype accounts into ${config.databaseFile}`)
