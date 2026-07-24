import { withTransaction } from '../../database/database.mjs'
import { clearOperationalMaterialization, materializeOperationalSnapshot } from './materializer.mjs'

const parseJson = (value, fallback) => {
  try { return JSON.parse(value) } catch { return fallback }
}

export class OperationalStateRepository {
  constructor(db) {
    this.db = db
    this.readMetaStmt = db.prepare('SELECT * FROM operational_state_meta WHERE id = 1')
    this.readSlicesStmt = db.prepare('SELECT slice_key, data_json FROM domain_slices ORDER BY slice_key')
    this.upsertMetaStmt = db.prepare(`
      INSERT INTO operational_state_meta
      (id, schema_version, snapshot_revision, resource_revision, saved_at, updated_by)
      VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        schema_version = excluded.schema_version,
        snapshot_revision = excluded.snapshot_revision,
        resource_revision = excluded.resource_revision,
        saved_at = excluded.saved_at,
        updated_by = excluded.updated_by
    `)
  }

  readSnapshot() {
    const meta = this.readMetaStmt.get()
    if (!meta) return undefined
    const state = {}
    for (const row of this.readSlicesStmt.all()) state[row.slice_key] = parseJson(row.data_json, {})
    return {
      version: Number(meta.schema_version),
      revision: Number(meta.snapshot_revision),
      savedAt: meta.saved_at,
      state,
    }
  }

  getResource() {
    const meta = this.readMetaStmt.get()
    if (!meta) return { value: null, revision: 0, updatedAt: null }
    const snapshot = this.readSnapshot()
    return {
      value: JSON.stringify(snapshot),
      revision: Number(meta.resource_revision),
      updatedAt: meta.saved_at,
      updatedBy: meta.updated_by,
    }
  }

  save(snapshot, expectedResourceRevision, actorId) {
    return withTransaction(this.db, () => {
      const current = this.readMetaStmt.get()
      const currentResourceRevision = Number(current?.resource_revision || 0)
      if (Number(expectedResourceRevision) !== currentResourceRevision) {
        return { conflict: true, current: this.getResource() }
      }
      const savedAt = typeof snapshot.savedAt === 'string' ? snapshot.savedAt : new Date().toISOString()
      const nextResourceRevision = currentResourceRevision + 1
      materializeOperationalSnapshot(this.db, snapshot)
      this.upsertMetaStmt.run(
        Number(snapshot.version || 1),
        Number(snapshot.revision || Number(current?.snapshot_revision || 0) + 1),
        nextResourceRevision,
        savedAt,
        actorId || null,
      )
      return {
        conflict: false,
        value: {
          value: JSON.stringify(snapshot),
          revision: nextResourceRevision,
          updatedAt: savedAt,
          updatedBy: actorId,
        },
      }
    })
  }

  remove() {
    withTransaction(this.db, () => {
      clearOperationalMaterialization(this.db)
      this.db.prepare('DELETE FROM operational_state_meta').run()
    })
  }

  listOrders(branch) {
    const rows = branch && branch !== 'All'
      ? this.db.prepare('SELECT data_json FROM orders WHERE branch_id = ? ORDER BY updated_at DESC, order_number DESC').all(branch)
      : this.db.prepare('SELECT data_json FROM orders ORDER BY updated_at DESC, order_number DESC').all()
    return rows.map((row) => parseJson(row.data_json, {}))
  }

  updateOrder(orderId, expectedRevision, order, actorId) {
    return withTransaction(this.db, () => {
      const snapshot = this.readSnapshot()
      if (!snapshot) return { notFound: true }
      const ordersSlice = snapshot.state?.orders && typeof snapshot.state.orders === 'object' ? snapshot.state.orders : {}
      const orders = Array.isArray(ordersSlice.orders) ? ordersSlice.orders : []
      const index = orders.findIndex((item) => String(item?.id ?? item?.orderNumber) === String(orderId))
      if (index < 0) return { notFound: true }
      const current = orders[index]
      const currentRevision = Number(current?.revision || 0)
      if (Number(expectedRevision) !== currentRevision) return { conflict: true, current }
      const confirmed = {
        ...order,
        id: current.id ?? order.id,
        orderNumber: current.orderNumber ?? order.orderNumber,
        revision: currentRevision + 1,
        updatedAt: new Date().toISOString(),
      }
      const nextOrders = [...orders]
      nextOrders[index] = confirmed
      snapshot.state.orders = { ...ordersSlice, orders: nextOrders }
      snapshot.revision = Number(snapshot.revision || 0) + 1
      snapshot.savedAt = confirmed.updatedAt
      materializeOperationalSnapshot(this.db, snapshot)
      const meta = this.readMetaStmt.get()
      const nextResourceRevision = Number(meta?.resource_revision || 0) + 1
      this.upsertMetaStmt.run(
        Number(snapshot.version || meta?.schema_version || 1),
        Number(snapshot.revision),
        nextResourceRevision,
        snapshot.savedAt,
        actorId || null,
      )
      return { conflict: false, order: confirmed, resourceRevision: nextResourceRevision, updatedAt: snapshot.savedAt }
    })
  }
}
