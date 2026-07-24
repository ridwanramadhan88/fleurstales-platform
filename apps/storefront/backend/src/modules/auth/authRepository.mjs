import crypto from 'node:crypto'

const nowIso = () => new Date().toISOString()
const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex')

const hashPin = (pin, salt = crypto.randomBytes(16).toString('hex')) => {
  const digest = crypto.scryptSync(String(pin), salt, 32).toString('hex')
  return `${salt}:${digest}`
}

const verifyPin = (pin, stored) => {
  const [salt, expected] = String(stored || '').split(':')
  if (!salt || !expected) return false
  const actual = crypto.scryptSync(String(pin), salt, 32).toString('hex')
  const a = Buffer.from(actual, 'hex')
  const b = Buffer.from(expected, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export class AuthRepository {
  constructor(db) {
    this.db = db
    this.findUserByUsernameStmt = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1')
    this.insertSessionStmt = db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    this.readSessionStmt = db.prepare(`
      SELECT s.expires_at, u.* FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND u.active = 1
    `)
    this.deleteSessionStmt = db.prepare('DELETE FROM sessions WHERE token_hash = ?')
    this.deleteExpiredStmt = db.prepare('DELETE FROM sessions WHERE expires_at < ?')
    this.upsertUserStmt = db.prepare(`
      INSERT INTO users (id, username, pin_hash, name, role, branch_id, position, hire_date, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        pin_hash = excluded.pin_hash,
        name = excluded.name,
        role = excluded.role,
        branch_id = excluded.branch_id,
        position = excluded.position,
        hire_date = excluded.hire_date,
        active = excluded.active,
        updated_at = excluded.updated_at
    `)
  }

  seedUsers(users) {
    const existingById = new Map(this.db.prepare('SELECT id, pin_hash FROM users').all().map((row) => [row.id, row.pin_hash]))
    const timestamp = nowIso()
    for (const user of users) {
      const pinHash = existingById.get(user.employeeId) || hashPin(user.pin)
      this.upsertUserStmt.run(
        user.employeeId,
        String(user.username || '').trim().toLowerCase(),
        pinHash,
        user.name,
        user.role,
        user.branchId || null,
        user.position || user.role,
        user.hireDate || '2024-01-01',
        user.active === false ? 0 : 1,
        timestamp,
        timestamp,
      )
    }
  }

  authenticate(username, pin) {
    const user = this.findUserByUsernameStmt.get(String(username || '').trim().toLowerCase())
    if (!user || !verifyPin(pin, user.pin_hash)) return undefined
    return user
  }

  createSession(userId, sessionHours) {
    const token = crypto.randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + sessionHours * 3_600_000).toISOString()
    this.insertSessionStmt.run(tokenHash(token), userId, expiresAt, nowIso())
    return { token, expiresAt }
  }

  readSession(token) {
    if (!token) return undefined
    this.deleteExpiredStmt.run(nowIso())
    const row = this.readSessionStmt.get(tokenHash(token))
    if (!row) return undefined
    return {
      token,
      employeeId: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      branchId: row.branch_id || undefined,
      position: row.position || row.role,
      hireDate: row.hire_date || '2024-01-01',
      expiresAt: row.expires_at,
    }
  }

  deleteSession(token) {
    if (token) this.deleteSessionStmt.run(tokenHash(token))
  }
}
