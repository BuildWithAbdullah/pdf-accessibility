// The set of text files this repository tracks.
//
// A verifier that counts files has to agree with git about which files exist,
// or the number it prints moves depending on whether anybody has run
// `npm install`. That is not hypothetical: it happened on another repository
// on this account, where a count included package-lock.json and so differed
// between a fresh clone and a working copy.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ALWAYS_IGNORED = new Set(['.git', 'node_modules'])
const TEXT = /\.(mjs|js|json|md|yml|yaml|txt)$/

function readIgnore (root) {
  let lines = []
  try {
    lines = readFileSync(join(root, '.gitignore'), 'utf8').split('\n')
  } catch {
    return []
  }
  return lines
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.replace(/\/$/, ''))
}

function ignored (patterns, relativePath) {
  const parts = relativePath.split(sep)
  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      const expression = new RegExp('^' + pattern.split('*').map(escape).join('[^/]*') + '$')
      if (parts.some((part) => expression.test(part))) return true
      continue
    }
    if (parts.includes(pattern)) return true
    if (relativePath === pattern || relativePath.startsWith(pattern + sep)) return true
  }
  return false
}

function escape (text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function trackedFiles (root, { textOnly = true } = {}) {
  const patterns = readIgnore(root)
  const out = []
  const walk = (directory) => {
    for (const entry of readdirSync(directory).sort()) {
      if (ALWAYS_IGNORED.has(entry)) continue
      const full = join(directory, entry)
      const rel = relative(root, full)
      if (ignored(patterns, rel)) continue
      const stats = statSync(full)
      if (stats.isDirectory()) { walk(full); continue }
      if (textOnly && !TEXT.test(entry)) continue
      out.push(rel.split(sep).join('/'))
    }
  }
  walk(root)
  return out
}
