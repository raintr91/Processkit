import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Shared `.gitignore` contract (Platform DNA semantics, vendored).
 *
 * Destination repos never hand-maintain Processkit ignore lines. Init merges
 * only the entries derived from the local targets this init actually wrote,
 * idempotently, preserving member content and the file's dominant EOL, and
 * recognizing equivalent patterns (`.cursor/` == `/.cursor/` == `.cursor`).
 */

export interface OwnedGitignoreEntry {
  pattern: string
  /**
   * Shared entries may be relied on by other toolkits (for example `.cursor/`
   * or `.claude.json`). They are ensured on init but kept on deinit so a
   * single toolkit removal never breaks another toolkit still using them.
   */
  shared?: boolean
}

export interface EnsureGitignoreResult {
  file: string
  /** Entries newly written by this call (trimmed source form). */
  added: string[]
  changed: boolean
}

export interface RemoveGitignoreResult {
  file?: string
  removed: string[]
  changed: boolean
}

/**
 * Canonical form so `.cursor/`, `/.cursor/` and `.cursor` compare equal.
 * Preserves negation (`!`) and glob text; only leading `./`, leading `/` and
 * trailing `/` are normalized because git treats those as equivalent anchors.
 */
export function canonicalGitignorePattern(pattern: string): string {
  let value = pattern.trim()
  if (!value) return ''
  let negated = false
  if (value.startsWith('!')) {
    negated = true
    value = value.slice(1)
  }
  value = value.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
  return `${negated ? '!' : ''}${value}`
}

function detectEol(content: string): '\r\n' | '\n' {
  return /\r\n/.test(content) ? '\r\n' : '\n'
}

function presentPatterns(content: string): Set<string> {
  const set = new Set<string>()
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    set.add(canonicalGitignorePattern(line))
  }
  return set
}

function gitignorePath(root: string): string {
  const file = path.join(path.resolve(root), '.gitignore')
  if (existsSync(file) && !lstatSync(file).isFile()) {
    throw new Error(`.gitignore is not a regular file: ${file}`)
  }
  return file
}

/**
 * Ensure every pattern is present exactly once. Creates the file when missing,
 * preserves existing member content and the file's dominant EOL, and never
 * duplicates an equivalent pattern.
 */
export function ensureGitignoreEntries(root: string, patterns: string[]): EnsureGitignoreResult {
  const file = gitignorePath(root)
  const existed = existsSync(file)
  const content = existed ? readFileSync(file, 'utf8') : ''
  const eol = existed ? detectEol(content) : '\n'
  const present = presentPatterns(content)

  const seen = new Set<string>()
  const added: string[] = []
  for (const pattern of patterns) {
    const canonical = canonicalGitignorePattern(pattern)
    if (!canonical || present.has(canonical) || seen.has(canonical)) continue
    seen.add(canonical)
    added.push(pattern.trim())
  }
  if (!added.length) return { file, added: [], changed: false }

  const prefix = content.length > 0 && !/\r?\n$/.test(content) ? eol : ''
  writeFileSync(file, `${content}${prefix}${added.join(eol)}${eol}`)
  return { file, added, changed: true }
}

/**
 * Remove the given patterns (matched by equivalence) while preserving unrelated
 * member lines and the file's dominant EOL. Missing files/patterns are a no-op.
 */
export function removeGitignoreEntries(root: string, patterns: string[]): RemoveGitignoreResult {
  const file = gitignorePath(root)
  if (!existsSync(file)) return { removed: [], changed: false }

  const content = readFileSync(file, 'utf8')
  const eol = detectEol(content)
  const drop = new Set(patterns.map(canonicalGitignorePattern).filter(Boolean))
  const hadTrailingNewline = /\r?\n$/.test(content)

  const removed: string[] = []
  const kept: string[] = []
  for (const raw of content.split(/\r?\n/)) {
    const trimmed = raw.trim()
    const canonical = trimmed && !trimmed.startsWith('#') ? canonicalGitignorePattern(trimmed) : ''
    if (canonical && drop.has(canonical)) {
      removed.push(trimmed)
      continue
    }
    kept.push(raw)
  }
  if (!removed.length) return { file, removed: [], changed: false }

  // split on the final empty element produced by a trailing newline
  if (hadTrailingNewline && kept[kept.length - 1] === '') kept.pop()
  const body = kept.join(eol)
  writeFileSync(file, body.length && hadTrailingNewline ? `${body}${eol}` : body)
  return { file, removed, changed: true }
}

/**
 * Single source of generated ignore targets for init/status/deinit.
 *
 * Entries are derived from the local files this init actually wrote (harness
 * always lands under `.cursor/`; agent MCP configs come from the agent
 * writers), never from a static per-agent table. Global paths outside the
 * repo are rejected, and Gemini/Antigravity collapse into one `.gemini/`
 * entry. `.processkit/` is the only entry Processkit owns exclusively; every
 * agent config location may be shared with other toolkits.
 */
export function generatedTargets(
  projectRoot: string,
  writtenFiles: string[],
): OwnedGitignoreEntry[] {
  const root = path.resolve(projectRoot)
  const entries: OwnedGitignoreEntry[] = [
    // Unanchored style matches Platform DNA / Codegenkit (`.cursor/` not `/.cursor/`).
    // Harness assets always land under .cursor/; other toolkits share the dir.
    { pattern: '.cursor/', shared: true },
    // Install state is exclusively Processkit-owned.
    { pattern: '.processkit/' },
    // Docskit folder
    { pattern: '.docskit/', shared: true },
  ]

  for (const written of writtenFiles) {
    // installAgents decorates secondary writes, e.g. ".../settings.json (permissions)".
    const file = written.replace(/ \(.*\)$/, '')
    const relative = path.relative(root, path.resolve(root, file))
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      // Never ignore paths outside the destination repo (global agent configs).
      continue
    }
    const posix = relative.split(path.sep).join('/')
    const top = posix.split('/')[0]!
    const pattern = posix.includes('/') ? `${top}/` : posix
    if (pattern === '.cursor/' || pattern === '.processkit/') continue
    entries.push({ pattern, shared: true })
  }

  const seen = new Set<string>()
  return entries.filter((entry) => {
    const canonical = canonicalGitignorePattern(entry.pattern)
    if (seen.has(canonical)) return false
    seen.add(canonical)
    return true
  })
}
