import * as esbuild from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { rimraf } from 'rimraf'
import stylePlugin from 'esbuild-style-plugin'
import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'

const args = process.argv.slice(2)
const isProd = args[0] === '--production'

await rimraf('dist')

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
  await injectPublicRuntimeConfig()
} else {
  const ctx = await esbuild.context(esbuildOpts)
  await ctx.watch()
  await injectPublicRuntimeConfig()
  const { hosts, port } = await ctx.serve()
  console.log(`Running on:`)
  hosts.forEach((host) => {
    console.log(`http://${host}:${port}`)
  })
}
