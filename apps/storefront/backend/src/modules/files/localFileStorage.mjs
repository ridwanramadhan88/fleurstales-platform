import crypto from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'

const MAX_LOGO_BYTES = 1_000_000
const MIME_TO_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}
const EXT_TO_MIME = Object.fromEntries(Object.entries(MIME_TO_EXT).map(([mime, ext]) => [`.${ext}`, mime]))

const unsafeSvg = (text) => {
  const normalized = text.toLowerCase()
  return /<\s*(script|foreignobject|iframe|object|embed)\b/.test(normalized) ||
    /\son[a-z]+\s*=/.test(normalized) ||
    /(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|javascript:)/.test(normalized)
}

const parseDataUrl = (value) => {
  const match = /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([a-z0-9+/=\s]+)$/i.exec(String(value || ''))
  if (!match) return undefined
  const mimeType = match[1].toLowerCase()
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64')
  if (!MIME_TO_EXT[mimeType]) throw Object.assign(new Error('Unsupported store logo type.'), { statusCode: 400 })
  if (buffer.length > MAX_LOGO_BYTES) throw Object.assign(new Error('Store logo is larger than 1 MB.'), { statusCode: 400 })
  if (mimeType === 'image/svg+xml' && unsafeSvg(buffer.toString('utf8'))) {
    throw Object.assign(new Error('SVG contains unsupported content.'), { statusCode: 400 })
  }
  return { mimeType, buffer }
}

export class LocalFileStorage {
  constructor({ db, uploadDir, publicBaseUrl = '' }) {
    this.db = db
    this.uploadDir = uploadDir
    this.publicBaseUrl = publicBaseUrl
    this.insertFileStmt = db.prepare(`
      INSERT INTO uploaded_files
      (id, kind, original_name, stored_name, public_path, mime_type, size_bytes, uploaded_by, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    this.findByPublicPathStmt = db.prepare('SELECT * FROM uploaded_files WHERE public_path = ?')
    this.deleteRecordStmt = db.prepare('DELETE FROM uploaded_files WHERE public_path = ?')
  }

  baseUrl(req) {
    if (this.publicBaseUrl) return this.publicBaseUrl
    const forwarded = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim()
    const protocol = forwarded || (req?.socket?.encrypted ? 'https' : 'http')
    const host = req?.headers?.host || 'localhost:8787'
    return `${protocol}://${host}`
  }

  localPublicPath(value) {
    if (!value) return undefined
    try {
      const parsed = new URL(value, 'http://local.invalid')
      return parsed.pathname.startsWith('/uploads/') ? parsed.pathname : undefined
    } catch { return undefined }
  }

  async storeDataUrl(dataUrl, { kind = 'store-logo', actorId, req } = {}) {
    const parsed = parseDataUrl(dataUrl)
    if (!parsed) return undefined
    const id = crypto.randomUUID()
    const extension = MIME_TO_EXT[parsed.mimeType]
    const storedName = `${id}.${extension}`
    const kindDir = resolve(this.uploadDir, kind)
    await mkdir(kindDir, { recursive: true })
    const diskPath = resolve(kindDir, storedName)
    await writeFile(diskPath, parsed.buffer)
    const publicPath = `/uploads/${kind}/${storedName}`
    const uploadedAt = new Date().toISOString()
    this.insertFileStmt.run(id, kind, null, storedName, publicPath, parsed.mimeType, parsed.buffer.length, actorId || null, uploadedAt)
    return { id, publicPath, url: `${this.baseUrl(req)}${publicPath}`, mimeType: parsed.mimeType, sizeBytes: parsed.buffer.length }
  }

  async removeByValue(value) {
    const publicPath = this.localPublicPath(value)
    if (!publicPath) return
    const record = this.findByPublicPathStmt.get(publicPath)
    if (!record) return
    const relative = publicPath.replace(/^\/uploads\//, '')
    const diskPath = resolve(this.uploadDir, relative)
    if (diskPath.startsWith(`${resolve(this.uploadDir)}${sep}`) && existsSync(diskPath)) {
      try { await unlink(diskPath) } catch { /* best effort cleanup */ }
    }
    this.deleteRecordStmt.run(publicPath)
  }

  async normalizeStoreLogo(snapshot, previousSnapshot, actor, req) {
    const next = structuredClone(snapshot)
    const profile = next?.state?.settings?.storeProfile
    if (!profile || typeof profile !== 'object') return { snapshot: next }
    const currentValue = typeof profile.logoUrl === 'string' ? profile.logoUrl : ''
    const previousValue = typeof previousSnapshot?.state?.settings?.storeProfile?.logoUrl === 'string'
      ? previousSnapshot.state.settings.storeProfile.logoUrl
      : ''
    const stored = await this.storeDataUrl(currentValue, { actorId: actor?.employeeId, req })
    if (stored) profile.logoUrl = stored.url
    const nextValue = typeof profile.logoUrl === 'string' ? profile.logoUrl : ''
    return {
      snapshot: next,
      cleanupValue: previousValue && previousValue !== nextValue ? previousValue : undefined,
      createdValue: stored?.url,
    }
  }

  async readPublicFile(pathname) {
    if (!pathname.startsWith('/uploads/')) return undefined
    const relative = pathname.replace(/^\/uploads\//, '')
    const diskPath = resolve(this.uploadDir, relative)
    if (!diskPath.startsWith(`${resolve(this.uploadDir)}${sep}`) || !existsSync(diskPath)) return undefined
    const record = this.findByPublicPathStmt.get(pathname)
    const mimeType = record?.mime_type || EXT_TO_MIME[extname(diskPath).toLowerCase()] || 'application/octet-stream'
    return { body: await readFile(diskPath), mimeType }
  }
}
