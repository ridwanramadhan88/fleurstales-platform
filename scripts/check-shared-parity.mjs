#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const storefrontRoot = path.join(root, 'apps/storefront')
const osRoot = path.join(root, 'apps/os')
const sharedPaths = ['src/data/shared', 'shared-data']

const collectFiles = async (directory, prefix = '') => {
  const files = []
  for (const entry of await readdir(directory)) {
    const absolute = path.join(directory, entry)
    const relative = path.join(prefix, entry)
    if ((await stat(absolute)).isDirectory()) {
      files.push(...await collectFiles(absolute, relative))
    } else {
      files.push(relative)
    }
  }
  return files.sort()
}

const digest = async (absolute) =>
  createHash('sha256').update(await readFile(absolute)).digest('hex')

for (const sharedPath of sharedPaths) {
  const storefrontDirectory = path.join(storefrontRoot, sharedPath)
  const osDirectory = path.join(osRoot, sharedPath)
  const storefrontFiles = await collectFiles(storefrontDirectory)
  const osFiles = await collectFiles(osDirectory)

  if (JSON.stringify(storefrontFiles) !== JSON.stringify(osFiles)) {
    throw new Error(`${sharedPath} file lists differ between Storefront and OS.`)
  }

  for (const relative of storefrontFiles) {
    const storefrontHash = await digest(path.join(storefrontDirectory, relative))
    const osHash = await digest(path.join(osDirectory, relative))
    if (storefrontHash !== osHash) {
      throw new Error(`${sharedPath}/${relative} differs between Storefront and OS.`)
    }
  }
}

const canonicalSupabaseDirectory = path.join(root, 'supabase')
const canonicalSupabaseFiles = await collectFiles(canonicalSupabaseDirectory)
for (const applicationRoot of [storefrontRoot, osRoot]) {
  const applicationSupabaseDirectory = path.join(applicationRoot, 'supabase')
  const applicationSupabaseFiles = await collectFiles(applicationSupabaseDirectory)
  if (JSON.stringify(applicationSupabaseFiles) !== JSON.stringify(canonicalSupabaseFiles)) {
    throw new Error(`${path.relative(root, applicationSupabaseDirectory)} differs from the canonical Supabase file list.`)
  }
  for (const relative of canonicalSupabaseFiles) {
    const canonicalHash = await digest(path.join(canonicalSupabaseDirectory, relative))
    const applicationHash = await digest(path.join(applicationSupabaseDirectory, relative))
    if (applicationHash !== canonicalHash) {
      throw new Error(`${path.relative(root, applicationSupabaseDirectory)}/${relative} differs from canonical Supabase.`)
    }
  }
}

console.log('Shared data, fixtures, and Supabase contracts are byte-identical across both applications.')
