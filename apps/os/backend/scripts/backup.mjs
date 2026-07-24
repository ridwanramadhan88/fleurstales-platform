import { createConfig } from '../src/config.mjs'
import { openDatabase } from '../src/database/database.mjs'
import { backupDatabase } from '../src/database/backup.mjs'
const config = createConfig()
const db = openDatabase(config.databaseFile)
const target = await backupDatabase({ db, databaseFile: config.databaseFile, backupDir: config.backupDir })
db.close()
console.log(target ? `Backup created: ${target}` : 'No database exists yet.')
