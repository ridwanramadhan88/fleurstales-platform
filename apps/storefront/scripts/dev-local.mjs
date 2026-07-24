import { spawn } from 'node:child_process'

const REQUIRED_NODE_MAJOR = 22
const BACKEND_URL = process.env.FLEURSTALES_API_URL || 'http://localhost:8787'
const HEALTH_URL = `${BACKEND_URL.replace(/\/$/, '')}/health`

const nodeMajor = Number(process.versions.node.split('.')[0])
if (!Number.isFinite(nodeMajor) || nodeMajor < REQUIRED_NODE_MAJOR) {
  console.error(`Fleurstales local development requires Node.js ${REQUIRED_NODE_MAJOR}+ (current: ${process.versions.node}).`)
  process.exit(1)
}

const children = new Set()
let shuttingDown = false

const stopAll = () => {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
}

const spawnChild = (args) => {
  const child = spawn(process.execPath, args, {
    stdio: 'inherit',
    env: process.env,
  })
  children.add(child)
  child.once('exit', () => children.delete(child))
  return child
}

const backendIsHealthy = async () => {
  try {
    const response = await fetch(HEALTH_URL)
    if (!response.ok) return false
    const payload = await response.json().catch(() => null)
    return Boolean(payload && payload.ok === true)
  } catch {
    return false
  }
}

const waitForBackend = async (backend) => {
  let backendExit
  backend.once('exit', (code, signal) => {
    backendExit = { code, signal }
  })

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (backendExit) {
      throw new Error(`Local backend stopped before startup completed (code: ${backendExit.code ?? 'none'}, signal: ${backendExit.signal ?? 'none'}).`)
    }
    if (await backendIsHealthy()) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Local backend did not become ready at ${HEALTH_URL}.`)
}

process.on('SIGINT', stopAll)
process.on('SIGTERM', stopAll)

try {
  let backend
  if (await backendIsHealthy()) {
    console.log(`Existing local API detected at ${BACKEND_URL}. Starting frontend...`)
  } else {
    backend = spawnChild(['backend/server.mjs'])
    await waitForBackend(backend)
    console.log('Local API ready. Starting frontend...')
  }

  const frontend = spawnChild(['scripts/build.mjs'])
  const managedProcesses = backend ? [['backend', backend], ['frontend', frontend]] : [['frontend', frontend]]

  for (const [name, child] of managedProcesses) {
    child.on('exit', (code, signal) => {
      if (shuttingDown) return
      console.error(`${name} process stopped unexpectedly (code: ${code ?? 'none'}, signal: ${signal ?? 'none'}).`)
      process.exitCode = code && code !== 0 ? code : 1
      stopAll()
    })
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  stopAll()
  process.exit(1)
}
