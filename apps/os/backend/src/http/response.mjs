export const createCorsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Branch',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, POST, OPTIONS',
})

export const sendJson = (res, cors, status, value) => {
  res.writeHead(status, { ...cors, 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

export const readJsonBody = async (req, maxBytes = 10_000_000) => {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) throw Object.assign(new Error('Request body is too large.'), { statusCode: 413 })
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { throw Object.assign(new Error('Request body is not valid JSON.'), { statusCode: 400 }) }
}
