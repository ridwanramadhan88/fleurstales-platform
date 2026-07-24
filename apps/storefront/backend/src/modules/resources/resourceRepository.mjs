export class ResourceRepository {
  constructor(db) {
    this.db = db
    this.readStmt = db.prepare('SELECT value, revision, updated_at AS updatedAt, updated_by AS updatedBy FROM compatibility_resources WHERE resource_key = ?')
    this.upsertStmt = db.prepare(`
      INSERT INTO compatibility_resources (resource_key, value, revision, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(resource_key) DO UPDATE SET
        value = excluded.value,
        revision = excluded.revision,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `)
    this.deleteStmt = db.prepare('DELETE FROM compatibility_resources WHERE resource_key = ?')
  }

  get(key) { return this.readStmt.get(key) || { value: null, revision: 0, updatedAt: null } }

  put(key, value, expectedRevision, actorId) {
    const current = this.get(key)
    if (Number(expectedRevision) !== Number(current.revision || 0)) return { conflict: true, current }
    const next = { value: String(value ?? ''), revision: Number(current.revision || 0) + 1, updatedAt: new Date().toISOString(), updatedBy: actorId }
    this.upsertStmt.run(key, next.value, next.revision, next.updatedAt, next.updatedBy)
    return { conflict: false, value: next }
  }

  remove(key) { this.deleteStmt.run(key) }
  count() { return Number(this.db.prepare('SELECT COUNT(*) AS count FROM compatibility_resources').get().count) }
}
