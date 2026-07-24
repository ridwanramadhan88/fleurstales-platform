import crypto from 'node:crypto'

export class AuditRepository {
  constructor(db) {
    this.db = db
    this.insertStmt = db.prepare(`
      INSERT INTO server_audit_events
      (id, action, entity_type, entity_id, actor_id, actor_role, branch_id, occurred_at, revision, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
  }

  append({ action, entityType, entityId, actor, revision, metadata }) {
    const event = {
      id: crypto.randomUUID(),
      action,
      entityType,
      entityId: entityId || null,
      actorId: actor?.employeeId || null,
      actorRole: actor?.role || null,
      branchId: actor?.branchId || null,
      occurredAt: new Date().toISOString(),
      revision: revision ?? null,
      metadata: metadata || null,
    }
    this.insertStmt.run(
      event.id,
      event.action,
      event.entityType,
      event.entityId,
      event.actorId,
      event.actorRole,
      event.branchId,
      event.occurredAt,
      event.revision,
      event.metadata ? JSON.stringify(event.metadata) : null,
    )
    return event
  }

  list(limit = 500) {
    return this.db.prepare(`
      SELECT id, action, entity_type AS entityType, entity_id AS entityId,
             actor_id AS actorId, actor_role AS actorRole, branch_id AS branchId,
             occurred_at AS occurredAt, revision, metadata_json AS metadataJson
      FROM server_audit_events ORDER BY occurred_at DESC LIMIT ?
    `).all(limit).map((row) => ({
      ...row,
      metadata: row.metadataJson ? JSON.parse(row.metadataJson) : undefined,
      metadataJson: undefined,
    }))
  }
}
