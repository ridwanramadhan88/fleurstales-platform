import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'

export const seedUsersFromFile = (authRepository, usersFile) => {
  if (!existsSync(usersFile)) return 0
  const users = JSON.parse(readFileSync(usersFile, 'utf8'))
  if (!Array.isArray(users)) throw new Error('backend/users.json must contain an array.')
  authRepository.seedUsers(users)
  return users.length
}
