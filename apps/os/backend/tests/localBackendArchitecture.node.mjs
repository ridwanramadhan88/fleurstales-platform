import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createApplication } from '../src/app.mjs'

const createTestApp = async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'fleurstales-backend-'))
  const app = createApplication({
    port: 0,
    databaseFile: resolve(root, 'database', 'fleurstales.db'),
    uploadDir: resolve(root, 'uploads'),
    backupDir: resolve(root, 'backups'),
    legacyStateFile: resolve(root, 'missing-state.json'),
    usersFile: resolve(process.cwd(), 'backend/users.json'),
    migrationsDir: resolve(process.cwd(), 'backend/database/migrations'),
  })
  const address = await app.listen(0)
  const port = typeof address === 'object' && address ? address.port : 0
  return { app, root, baseUrl: `http://127.0.0.1:${port}` }
}

const login = async (baseUrl) => {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner', pin: '123456' }),
  })
  assert.equal(response.status, 200)
  return (await response.json()).token
}

test('stores the operational snapshot in SQLite domain tables and local file storage', async () => {
  const { app, root, baseUrl } = await createTestApp()
  try {
    const token = await login(baseUrl)
    const snapshot = {
      version: 16,
      revision: 1,
      savedAt: '2026-07-14T00:00:00.000Z',
      state: {
        settings: {
          storeProfile: {
            storeName: 'Fleurstales',
            logoUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCIvPjwvc3ZnPg==',
          },
          branches: [{ id: 'kedamaian', name: 'Kedamaian', isActive: true }],
        },
        hr: { employees: [{ id: 'emp-local', branchId: 'kedamaian', systemRole: 'admin', status: 'active' }] },
        customers: { customers: [{ id: 'cust-local', name: 'Sari', phone: '0812' }] },
        orders: { orders: [{ id: 'order-local', orderNumber: 'ORD-LOCAL', customerId: 'cust-local', customerName: 'Sari', branch: 'kedamaian', status: 'confirmed', revision: 1, items: [{ id: 'line-local', quantity: 1, unitPriceIdr: 100_000 }] }] },
        catalog: { categories: [], products: [] },
        stock: { items: [], transfers: [], events: [], reservations: [] },
        finance: { transactions: [] },
        vouchers: { vouchers: [] },
        notifications: { notifications: [] },
        orderActivities: { activities: {} },
        auditLog: { events: [] },
        payroll: {},
      },
    }
    const save = await fetch(`${baseUrl}/state/operational-state`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(snapshot), expectedRevision: 0 }),
    })
    assert.equal(save.status, 200)
    const stored = await save.json()
    const storedSnapshot = JSON.parse(stored.value)
    assert.equal(stored.revision, 1)
    assert.match(storedSnapshot.state.settings.storeProfile.logoUrl, new RegExp(`^${baseUrl}/uploads/store-logo/`))

    const logo = await fetch(storedSnapshot.state.settings.storeProfile.logoUrl)
    assert.equal(logo.status, 200)
    assert.equal(logo.headers.get('content-type'), 'image/svg+xml')

    const health = await fetch(`${baseUrl}/health`).then((response) => response.json())
    assert.deepEqual(
      { orders: health.counts.orders, customers: health.counts.customers, employees: health.counts.employees },
      { orders: 1, customers: 1, employees: 1 },
    )
    assert.equal(Number(app.db.prepare('SELECT COUNT(*) AS count FROM order_items').get().count), 1)
    assert.ok(Number(app.db.prepare('SELECT COUNT(*) AS count FROM domain_slices').get().count) > 5)
  } finally {
    await app.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('keeps optimistic order revisions synchronized with the operational snapshot', async () => {
  const { app, root, baseUrl } = await createTestApp()
  try {
    const token = await login(baseUrl)
    const order = { id: 'order-1', orderNumber: 'ORD-1', customerName: 'Sari', branch: 'kedamaian', status: 'confirmed', revision: 1 }
    const snapshot = { version: 16, revision: 1, savedAt: new Date().toISOString(), state: { orders: { orders: [order] } } }
    const save = await fetch(`${baseUrl}/state/operational-state`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(snapshot), expectedRevision: 0 }),
    })
    assert.equal(save.status, 200)

    const update = await fetch(`${baseUrl}/orders/order-1`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 1, order: { ...order, status: 'processing' } }),
    })
    assert.equal(update.status, 200)
    assert.deepEqual(
      (({ revision, status }) => ({ revision, status }))(await update.json()),
      { revision: 2, status: 'processing' },
    )

    const stale = await fetch(`${baseUrl}/orders/order-1`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 1, order: { ...order, status: 'ready' } }),
    })
    assert.equal(stale.status, 409)

    const resource = await fetch(`${baseUrl}/state/operational-state`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json())
    const persisted = JSON.parse(resource.value)
    assert.equal(resource.revision, 2)
    assert.deepEqual(
      (({ status, revision }) => ({ status, revision }))(persisted.state.orders.orders[0]),
      { status: 'processing', revision: 2 },
    )
  } finally {
    await app.close()
    await rm(root, { recursive: true, force: true })
  }
})
