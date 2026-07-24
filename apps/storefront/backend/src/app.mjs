import http from 'node:http'
import { mkdirSync } from 'node:fs'
import { createConfig } from './config.mjs'
import { openDatabase } from './database/database.mjs'
import { runMigrations } from './database/migrations.mjs'
import { backupDatabase } from './database/backup.mjs'
import { seedUsersFromFile } from './database/seed.mjs'
import { importLegacyStateFile } from './database/legacyImport.mjs'
import { AuthRepository } from './modules/auth/authRepository.mjs'
import { AuthService } from './modules/auth/authService.mjs'
import { AuditRepository } from './modules/audit/auditRepository.mjs'
import { ResourceRepository } from './modules/resources/resourceRepository.mjs'
import { LocalFileStorage } from './modules/files/localFileStorage.mjs'
import { OperationalStateRepository } from './modules/operational-state/operationalStateRepository.mjs'
import { OperationalStateService } from './modules/operational-state/operationalStateService.mjs'
import { RealtimeEventBus } from './realtime/eventBus.mjs'
import { createCorsHeaders, readJsonBody, sendJson } from './http/response.mjs'

const now = () => new Date().toISOString()
const compatibilityWriteKeys = new Set(['orders', 'customers', 'notifications', 'order-activities', 'audit-log'])
const canReadAudit = (role) => ['owner', 'finance', 'hr'].includes(role)
const canWriteResource = (session, key) => {
  if (session.role === 'owner') return true
  if (key === 'operational-state') return ['admin', 'finance', 'hr', 'florist'].includes(session.role)
  return compatibilityWriteKeys.has(key)
}

export const createApplication = (overrides = {}) => {
  const config = createConfig(overrides)
  mkdirSync(config.uploadDir, { recursive: true })
  mkdirSync(config.backupDir, { recursive: true })
  const db = openDatabase(config.databaseFile)
  runMigrations(db, config.migrationsDir)

  const authRepository = new AuthRepository(db)
  seedUsersFromFile(authRepository, config.usersFile)
  const authService = new AuthService(authRepository, config.sessionHours)
  const auditRepository = new AuditRepository(db)
  const resourceRepository = new ResourceRepository(db)
  const fileStorage = new LocalFileStorage({ db, uploadDir: config.uploadDir, publicBaseUrl: config.publicBaseUrl })
  const operationalRepository = new OperationalStateRepository(db)
  const realtime = new RealtimeEventBus()
  const operationalService = new OperationalStateService({
    repository: operationalRepository,
    fileStorage,
    auditRepository,
    backup: () => backupDatabase({ db, databaseFile: config.databaseFile, backupDir: config.backupDir }),
  })

  importLegacyStateFile({
    legacyStateFile: config.legacyStateFile,
    operationalStateService: operationalService,
    resourceRepository,
    auditRepository,
  })

  const cors = createCorsHeaders(config.corsOrigin)

  const requestHandler = async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    try {
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }

      if (req.method === 'GET' && url.pathname === '/health') {
        const counts = Object.fromEntries([
          ['orders', 'orders'], ['customers', 'customers'], ['employees', 'employees'],
          ['products', 'products'], ['inventoryItems', 'inventory_items'], ['financeTransactions', 'finance_transactions'],
        ].map(([key, table]) => [key, Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count)]))
        return sendJson(res, cors, 200, {
          ok: true,
          time: now(),
          database: config.databaseFile,
          connectedDevices: realtime.connectedDevices,
          compatibilityResources: resourceRepository.count(),
          counts,
        })
      }

      if (req.method === 'GET' && url.pathname.startsWith('/uploads/')) {
        const file = await fileStorage.readPublicFile(url.pathname)
        if (!file) return sendJson(res, cors, 404, { error: 'FILE_NOT_FOUND' })
        res.writeHead(200, { ...cors, 'Content-Type': file.mimeType, 'Cache-Control': 'public, max-age=31536000, immutable' })
        return res.end(file.body)
      }

      if (req.method === 'POST' && url.pathname === '/auth/login') {
        const input = await readJsonBody(req)
        const result = authService.login(input.username, input.pin)
        if (!result) return sendJson(res, cors, 401, { error: 'INVALID_CREDENTIALS' })
        return sendJson(res, cors, 200, result)
      }

      const session = authService.getSessionFromRequest(req, url)
      if (!session) return sendJson(res, cors, 401, { error: 'UNAUTHORIZED' })

      if (req.method === 'POST' && url.pathname === '/auth/logout') {
        authService.logout(session.token)
        return sendJson(res, cors, 200, { ok: true })
      }
      if (req.method === 'GET' && url.pathname === '/auth/me') {
        return sendJson(res, cors, 200, {
          employeeId: session.employeeId,
          username: session.username,
          name: session.name,
          role: session.role,
          branchId: session.branchId,
        })
      }

      if (req.method === 'GET' && url.pathname === '/state/stream') {
        const key = url.searchParams.get('key') || undefined
        res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
        const remove = realtime.addStateClient({ res, key })
        res.write(`data: ${JSON.stringify({ type: 'connected', key, at: now() })}\n\n`)
        const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000)
        req.on('close', () => { clearInterval(heartbeat); remove() })
        return
      }

      if (req.method === 'GET' && url.pathname === '/orders/stream') {
        const branch = url.searchParams.get('branch') || 'All'
        res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
        const remove = realtime.addOrderClient({ res, branch })
        res.write(`data: ${JSON.stringify({ type: 'snapshot', orders: operationalService.listOrders(branch), at: now() })}\n\n`)
        const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000)
        req.on('close', () => { clearInterval(heartbeat); remove() })
        return
      }

      if (req.method === 'GET' && url.pathname === '/orders') {
        return sendJson(res, cors, 200, operationalService.listOrders(url.searchParams.get('branch') || 'All'))
      }

      const orderMatch = url.pathname.match(/^\/orders\/([^/]+)$/)
      if (orderMatch && req.method === 'PUT') {
        const input = await readJsonBody(req)
        const orderId = decodeURIComponent(orderMatch[1])
        const result = await operationalService.updateOrder({
          orderId,
          expectedRevision: Number(input.expectedRevision ?? 0),
          order: input.order,
          actor: session,
        })
        if (result.notFound) return sendJson(res, cors, 404, { error: 'ORDER_NOT_FOUND' })
        if (result.conflict) return sendJson(res, cors, 409, { error: 'REVISION_CONFLICT', current: result.current })
        realtime.emitOrder({ type: 'upsert', order: result.order }, result.order.branch)
        realtime.emitState({ type: 'resource.updated', key: 'operational-state', revision: result.resourceRevision, updatedAt: result.updatedAt })
        return sendJson(res, cors, 200, result.order)
      }

      const stateMatch = url.pathname.match(/^\/state\/([^/]+)$/)
      if (stateMatch) {
        const key = decodeURIComponent(stateMatch[1])
        if (req.method === 'GET') {
          const value = key === 'operational-state' ? operationalService.get() : resourceRepository.get(key)
          return sendJson(res, cors, 200, value)
        }
        if (!canWriteResource(session, key)) return sendJson(res, cors, 403, { error: 'FORBIDDEN' })
        if (req.method === 'PUT') {
          const input = await readJsonBody(req)
          if (key === 'operational-state') {
            const result = await operationalService.save({
              serializedSnapshot: input.value,
              expectedRevision: Number(input.expectedRevision ?? 0),
              actor: session,
              req,
            })
            if (result.conflict) return sendJson(res, cors, 409, { error: 'REVISION_CONFLICT', current: result.current })
            realtime.emitState({ type: 'resource.updated', key, revision: result.value.revision, updatedAt: result.value.updatedAt })
            realtime.emitOrder({ type: 'snapshot', orders: operationalService.listOrders('All') })
            return sendJson(res, cors, 200, result.value)
          }
          const result = resourceRepository.put(key, input.value, Number(input.expectedRevision ?? 0), session.employeeId)
          if (result.conflict) return sendJson(res, cors, 409, { error: 'REVISION_CONFLICT', current: result.current })
          auditRepository.append({ action: 'compatibility_resource.updated', entityType: 'compatibility_resource', entityId: key, actor: session, revision: result.value.revision })
          realtime.emitState({ type: 'resource.updated', key, revision: result.value.revision, updatedAt: result.value.updatedAt })
          return sendJson(res, cors, 200, result.value)
        }
        if (req.method === 'DELETE') {
          if (session.role !== 'owner') return sendJson(res, cors, 403, { error: 'OWNER_REQUIRED' })
          if (key === 'operational-state') await operationalService.remove(session)
          else resourceRepository.remove(key)
          realtime.emitState({ type: 'resource.deleted', key, updatedAt: now() })
          return sendJson(res, cors, 200, { ok: true })
        }
      }

      if (req.method === 'GET' && url.pathname === '/audit') {
        if (!canReadAudit(session.role)) return sendJson(res, cors, 403, { error: 'FORBIDDEN' })
        return sendJson(res, cors, 200, auditRepository.list(500))
      }

      return sendJson(res, cors, 404, { error: 'NOT_FOUND' })
    } catch (error) {
      const status = Number(error?.statusCode || 500)
      if (status >= 500) console.error(error)
      return sendJson(res, cors, status, { error: status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST', message: error instanceof Error ? error.message : 'Unexpected error.' })
    }
  }

  const server = http.createServer((req, res) => { void requestHandler(req, res) })
  return {
    config,
    db,
    server,
    services: { authService, operationalService, resourceRepository, auditRepository, fileStorage, realtime },
    listen(port = config.port) {
      return new Promise((resolve) => server.listen(port, () => resolve(server.address())))
    },
    close() {
      return new Promise((resolve, reject) => server.close((error) => {
        try { db.close() } catch { /* already closed */ }
        if (error) reject(error); else resolve()
      }))
    },
  }
}
