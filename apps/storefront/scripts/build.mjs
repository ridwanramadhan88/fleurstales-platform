import * as esbuild from 'esbuild'
import { createServer } from 'node:http'
import { cp, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { rimraf } from 'rimraf'
import stylePlugin from 'esbuild-style-plugin'
import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'

const args = process.argv.slice(2)
const isProd = args[0] === '--production'

await rimraf('dist')

const copyPublicAssets = () => cp('public', 'dist', { recursive: true, force: true })

const injectPublicRuntimeConfig = async () => {
  const config = Object.fromEntries(Object.entries({
    supabaseUrl: process.env.FLEURSTALES_SUPABASE_URL?.trim(),
    supabasePublishableKey: process.env.FLEURSTALES_SUPABASE_PUBLISHABLE_KEY?.trim(),
  }).filter(([, value]) => Boolean(value)))

  if (Object.keys(config).length === 0) return

  const indexPath = join(process.cwd(), 'dist/index.html')
  const marker = 'window.__FLEURSTALES_CONFIG__ = window.__FLEURSTALES_CONFIG__ || {};'
  const serialized = JSON.stringify(config).replaceAll('<', '\\u003c')
  const html = await readFile(indexPath, 'utf8')
  if (!html.includes(marker)) throw new Error('Runtime configuration marker is missing from index.html.')
  await writeFile(indexPath, html.replace(
    marker,
    `window.__FLEURSTALES_CONFIG__ = Object.assign({}, window.__FLEURSTALES_CONFIG__ || {}, ${serialized});`,
  ))
}

/**
 * @type {esbuild.BuildOptions}
 */
const esbuildOpts = {
  color: true,
  entryPoints: ['src/main.tsx', 'index.html'],
  outdir: 'dist',
  publicPath: '/',
  entryNames: '[name]',
  write: true,
  bundle: true,
  format: 'iife',
  sourcemap: isProd ? false : 'linked',
  minify: isProd,
  treeShaking: true,
  jsx: 'automatic',
  loader: {
    '.html': 'copy',
    '.png': 'file',
    '.jpg': 'file',
    '.jpeg': 'file',
    '.svg': 'file',
    '.woff2': 'file',
  },
  plugins: [
    stylePlugin({
      postcss: {
        plugins: [tailwindcss, autoprefixer],
      },
    }),
  ],
}

if (isProd) {
  await esbuild.build(esbuildOpts)
  await copyPublicAssets()
  await injectPublicRuntimeConfig()
} else {
  const ctx = await esbuild.context(esbuildOpts)
  await ctx.watch()
  await copyPublicAssets()
  await injectPublicRuntimeConfig()

  const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.woff2': 'font/woff2',
  }

  const distRoot = join(process.cwd(), 'dist')
  const indexFile = join(distRoot, 'index.html')

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      const pathname = decodeURIComponent(url.pathname)
      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
      let file = join(distRoot, relativePath)

      try {
        const fileStat = await stat(file)
        if (!fileStat.isFile()) file = indexFile
      } catch {
        file = indexFile
      }

      const data = await readFile(file)
      res.writeHead(200, {
        'Content-Type': mime[extname(file)] || 'application/octet-stream',
      })
      res.end(req.method === 'HEAD' ? undefined : data)
    } catch (error) {
      console.error('Local frontend request failed:', error)
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Local frontend server error')
    }
  })

  server.listen(0, () => {
    const address = server.address()
    console.log(`Running on:`)
    console.log(`http://localhost:${address.port}`)
  })
}
