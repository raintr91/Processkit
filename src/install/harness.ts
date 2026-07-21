import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { packageRoot, packageVersion } from '../config/project-root.js'
import { unmergeExtractRegistry } from './extract-registry.js'
import {
  canonicalGitignorePattern,
  removeGitignoreEntries,
  type OwnedGitignoreEntry,
} from './gitignore.js'
import { forgetInstall, recordInstall } from './ledger.js'
import { localMapsStatus, type LocalMapStatus } from './local-maps.js'
import {
  CONFIGURE_REPO_MAPS_REL,
  CROSS_REPO_INDEX_REL,
  isDnaConfigureRepoMapsSsot,
  isDnaCrossRepoIndexSsot,
} from './configure-repo-maps.js'

export type ProcesskitType = 'docs' | 'fe' | 'be'
export const PROCESSKIT_TOOL_API = 1
export const PROCESSKIT_HARNESS_API = 1
export const INSTALL_MANIFEST_PATH = '.processkit/install-manifest.json'
const NEVER_PRUNE = new Set([
  'platform-repos.json',
  '.cursor/extracts/extract-registry.json',
  // DNA SSOT routing rule — Processkit may install it for independence but must
  // never delete it on deinit (DNA or another toolkit may still rely on it).
  '.cursor/rules/cross-repo-index.mdc',
])

export const SKILLS_BY_TYPE: Record<ProcesskitType, string[]> = {
  docs: [
    'business-process-trace',
    'business-impact-review',
    'configure-repo-maps',
    'flow-trace',
  ],
  fe: ['business-impact-review', 'configure-repo-maps'],
  be: ['business-impact-review', 'configure-repo-maps'],
}

export interface ManagedFile {
  source: string
  sha256: string
  stale?: boolean
}

export interface InstallManifest {
  schemaVersion: 1
  package: '@platform/processkit'
  packageVersion: string
  type?: ProcesskitType
  types?: ProcesskitType[]
  toolApi: number
  harnessApi: number
  installedAt: string
  files: Record<string, ManagedFile>
  /** Exact `.gitignore` entries Processkit ensured, with shared-ownership. */
  gitignore?: OwnedGitignoreEntry[]
}

export interface GitignoreEntryStatus {
  pattern: string
  shared: boolean
  present: boolean
}

export interface HarnessInstallResult {
  written: string[]
  unchanged: string[]
  conflicts: string[]
  stale: string[]
}

export interface HarnessStatus {
  projectRoot: string
  packageVersion: string
  installed: boolean
  type: ProcesskitType | null
  types: ProcesskitType[]
  packageVersionInstalled: string | null
  toolApi: number | null
  harnessApi: number | null
  healthy: string[]
  missing: string[]
  modified: string[]
  stale: string[]
  gitignore: GitignoreEntryStatus[]
  /** Machine-local checkout maps; empty/missing → cross-repo needs /configure-repo-maps. */
  localMaps: LocalMapStatus[]
  compat: 'ok' | 'warn' | 'fail'
}

export interface PruneResult {
  removable: string[]
  modified: string[]
  removed: string[]
}

export interface HarnessUninstallResult {
  manifest: string
  dryRun: boolean
  wouldDelete: string[]
  deleted: string[]
  preservedModified: string[]
  missing: string[]
  manifestRemoved: boolean
  registry?: string
  /** Exclusive-owned ignore patterns removed (or planned in dry-run). */
  gitignoreRemoved: string[]
  /** Shared ignore patterns kept because other toolkits may rely on them. */
  gitignoreKept: string[]
}

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function walk(root: string): string[] {
  if (!existsSync(root)) return []
  const out: string[] = []
  for (const name of readdirSync(root)) {
    const file = path.join(root, name)
    if (statSync(file).isDirectory()) out.push(...walk(file))
    else out.push(file)
  }
  return out
}

function manifestFile(root: string): string {
  return path.join(root, ...INSTALL_MANIFEST_PATH.split('/'))
}

function pruneEmptyDirs(root: string, files: string[]): void {
  const candidates = new Set<string>()
  for (const file of files) {
    let directory = path.dirname(file)
    while (directory !== root && directory.startsWith(`${root}${path.sep}`)) {
      candidates.add(directory)
      directory = path.dirname(directory)
    }
  }
  for (const directory of [...candidates].sort((a, b) => b.length - a.length)) {
    try {
      if (readdirSync(directory).length === 0) rmSync(directory)
    } catch {
      // Directory is non-empty, missing, or not removable.
    }
  }
}

function containedTarget(root: string, targetKey: string): string {
  if (
    !targetKey ||
    targetKey.includes('\0') ||
    path.isAbsolute(targetKey) ||
    path.win32.isAbsolute(targetKey)
  ) {
    throw new Error(`Unsafe managed path in Processkit manifest: ${JSON.stringify(targetKey)}`)
  }
  const target = path.resolve(root, targetKey)
  const relative = path.relative(root, target)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Managed path escapes project root: ${JSON.stringify(targetKey)}`)
  }
  if (existsSync(root)) {
    const realRoot = realpathSync(root)
    let existing = target
    while (!existsSync(existing) && existing !== root) existing = path.dirname(existing)
    const realExisting = realpathSync(existing)
    const realRelative = path.relative(realRoot, realExisting)
    if (
      realRelative === '..' ||
      realRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(realRelative)
    ) {
      throw new Error(`Managed path escapes project root through a symlink: ${JSON.stringify(targetKey)}`)
    }
  }
  return target
}

function readManifest(root: string): InstallManifest | null {
  const file = manifestFile(root)
  if (!existsSync(file)) return null
  const data = JSON.parse(readFileSync(file, 'utf8')) as Partial<InstallManifest>
  if (
    data.schemaVersion !== 1 ||
    data.package !== '@platform/processkit' ||
    !(
      (Array.isArray(data.types) &&
        data.types.every((t) => typeof t === 'string' && ['docs', 'fe', 'be'].includes(t))) ||
      (typeof data.type === 'string' && ['docs', 'fe', 'be'].includes(data.type))
    ) ||
    typeof data.packageVersion !== 'string' ||
    typeof data.files !== 'object' ||
    data.files === null
  ) {
    throw new Error(`Invalid Processkit install manifest at ${file}`)
  }
  for (const [targetKey, meta] of Object.entries(data.files)) {
    containedTarget(root, targetKey)
    if (
      typeof meta !== 'object' ||
      meta === null ||
      typeof meta.source !== 'string' ||
      !/^[a-f0-9]{64}$/.test(meta.sha256)
    ) {
      throw new Error(`Invalid managed file entry ${JSON.stringify(targetKey)} at ${file}`)
    }
  }
  if (data.gitignore !== undefined) {
    if (!Array.isArray(data.gitignore)) {
      throw new Error(`Invalid Processkit install manifest gitignore at ${file}`)
    }
    for (const entry of data.gitignore) {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        typeof entry.pattern !== 'string' ||
        !entry.pattern.trim() ||
        /[\r\n]/.test(entry.pattern) ||
        (entry.shared !== undefined && typeof entry.shared !== 'boolean')
      ) {
        throw new Error(`Invalid Processkit install manifest gitignore entry at ${file}`)
      }
    }
  }
  if (!data.types && data.type) data.types = [data.type as ProcesskitType]
  return data as InstallManifest
}

function mergeManifestGitignore(
  previous: OwnedGitignoreEntry[] | undefined,
  next: OwnedGitignoreEntry[] | undefined,
): OwnedGitignoreEntry[] {
  const merged = new Map<string, OwnedGitignoreEntry>()
  for (const entry of [...(previous ?? []), ...(next ?? [])]) {
    const canonical = canonicalGitignorePattern(entry.pattern)
    if (!canonical) continue
    const existing = merged.get(canonical)
    merged.set(canonical, {
      pattern: entry.pattern,
      ...(entry.shared || existing?.shared ? { shared: true } : {}),
    })
  }
  return [...merged.values()]
}

function gitignoreStatus(root: string, manifest: InstallManifest | null): GitignoreEntryStatus[] {
  const entries = manifest?.gitignore ?? []
  if (!entries.length) return []
  const file = path.join(root, '.gitignore')
  const present = new Set<string>()
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) present.add(canonicalGitignorePattern(trimmed))
    }
  }
  return entries.map((entry) => ({
    pattern: entry.pattern,
    shared: Boolean(entry.shared),
    present: present.has(canonicalGitignorePattern(entry.pattern)),
  }))
}

function assertCompatible(manifest: InstallManifest | null, file: string): void {
  if (
    manifest &&
    (manifest.toolApi !== PROCESSKIT_TOOL_API ||
      manifest.harnessApi !== PROCESSKIT_HARNESS_API)
  ) {
    throw new Error(
      `Unsupported Processkit install manifest API at ${file}; upgrade Processkit or remove the manifest explicitly.`,
    )
  }
}

export function harnessStatus(projectRoot?: string): HarnessStatus {
  const root = path.resolve(projectRoot ?? process.cwd())
  const previous = readManifest(root)
  const healthy: string[] = []
  const missing: string[] = []
  const modified: string[] = []
  const stale: string[] = []

  if (!previous) {
    return {
      projectRoot: root,
      packageVersion: packageVersion(),
      installed: false,
      type: null,
      types: [],
      packageVersionInstalled: null,
      toolApi: null,
      harnessApi: null,
      healthy,
      missing,
      modified,
      stale,
      gitignore: [],
      localMaps: localMapsStatus(root),
      compat: 'warn',
    }
  }

  for (const [targetKey, meta] of Object.entries(previous.files)) {
    const target = containedTarget(root, targetKey)
    if (!existsSync(target)) {
      missing.push(target)
      continue
    }
    const currentHash = hash(readFileSync(target, 'utf8'))
    if (meta.stale && currentHash === meta.sha256) stale.push(target)
    else if (currentHash === meta.sha256) healthy.push(target)
    else modified.push(target)
  }

  const apiCompatible =
    previous.toolApi === PROCESSKIT_TOOL_API &&
    previous.harnessApi === PROCESSKIT_HARNESS_API
  return {
    projectRoot: root,
    packageVersion: packageVersion(),
    installed: true,
    type: previous.type ?? (previous.types?.[0] || null),
    types: previous.types ?? [],
    packageVersionInstalled: previous.packageVersion,
    toolApi: previous.toolApi,
    harnessApi: previous.harnessApi,
    healthy,
    missing,
    modified,
    stale,
    gitignore: gitignoreStatus(root, previous),
    localMaps: localMapsStatus(root),
    compat: !apiCompatible
      ? 'fail'
      : previous.packageVersion === packageVersion()
        ? 'ok'
        : 'warn',
  }
}

export function installHarness(opts: {
  projectRoot: string
  type?: ProcesskitType
  types?: ProcesskitType[]
  force?: boolean
  /** Exact ignore entries this init ensured; recorded for status/deinit. */
  gitignoreEntries?: OwnedGitignoreEntry[]
}): HarnessInstallResult {
  const root = path.resolve(opts.projectRoot)
  const previous = readManifest(root)
  assertCompatible(previous, manifestFile(root))
  const result: HarnessInstallResult = {
    written: [],
    unchanged: [],
    conflicts: [],
    stale: [],
  }
  const files: InstallManifest['files'] = {}
  const typesToInstall = opts.types ?? (opts.type ? [opts.type] : [])
  const sourceRoots = [
    path.join(packageRoot(), 'harness', 'common'),
    ...typesToInstall.map((t) => path.join(packageRoot(), 'harness', t)),
  ]
  const sources = sourceRoots.flatMap((sourceRoot) =>
    walk(sourceRoot).map((source) => ({
      source,
      targetRel: path.join('.cursor', path.relative(sourceRoot, source)).split(path.sep).join('/'),
    })),
  )
  sources.push({
    source: path.join(packageRoot(), 'schemas', 'missing-optional-event.schema.json'),
    targetRel: '.cursor/schemas/processkit/missing-optional-event.schema.json',
  })

  for (const { source, targetRel } of sources) {
    if (path.basename(source) === 'extract-registry.processkit.json') continue
    const target = containedTarget(root, targetRel)
    const content = readFileSync(source, 'utf8')
    const normalizedRel = targetRel.replaceAll('\\', '/')

    if (existsSync(target)) {
      const current = readFileSync(target, 'utf8')
      if (current === content) {
        files[targetRel] = {
          source: path.relative(packageRoot(), source).split(path.sep).join('/'),
          sha256: hash(content),
        }
        result.unchanged.push(target)
        continue
      }
      // DNA SSOT already installed — keep it; do not claim or conflict.
      if (
        (normalizedRel === CONFIGURE_REPO_MAPS_REL && isDnaConfigureRepoMapsSsot(current)) ||
        (normalizedRel === CROSS_REPO_INDEX_REL && isDnaCrossRepoIndexSsot(current))
      ) {
        result.unchanged.push(target)
        continue
      }
      const safeUpdate = previous?.files[targetRel]?.sha256 === hash(current)
      if (!opts.force && !safeUpdate) {
        result.conflicts.push(target)
        continue
      }
    }
    files[targetRel] = {
      source: path.relative(packageRoot(), source).split(path.sep).join('/'),
      sha256: hash(content),
    }
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
    result.written.push(target)
  }

  for (const [targetKey, meta] of Object.entries(previous?.files ?? {})) {
    if (files[targetKey]) continue
    files[targetKey] = { ...meta, stale: true }
    result.stale.push(containedTarget(root, targetKey))
  }

  const manifest: InstallManifest = {
    schemaVersion: 1,
    package: '@platform/processkit',
    packageVersion: packageVersion(),
    types: typesToInstall,
    type: typesToInstall[0],
    toolApi: PROCESSKIT_TOOL_API,
    harnessApi: PROCESSKIT_HARNESS_API,
    installedAt: new Date().toISOString(),
    files,
  }
  const gitignore = mergeManifestGitignore(previous?.gitignore, opts.gitignoreEntries)
  if (gitignore.length) manifest.gitignore = gitignore
  mkdirSync(path.dirname(manifestFile(root)), { recursive: true })
  writeFileSync(manifestFile(root), `${JSON.stringify(manifest, null, 2)}\n`)
  recordInstall(root)
  return result
}

export function pruneHarness(opts: {
  projectRoot?: string
  yes?: boolean
} = {}): PruneResult {
  const root = path.resolve(opts.projectRoot ?? process.cwd())
  const previous = readManifest(root)
  assertCompatible(previous, manifestFile(root))
  const result: PruneResult = { removable: [], modified: [], removed: [] }
  if (!previous) return result

  for (const [targetKey, meta] of Object.entries(previous.files)) {
    if (!meta.stale) continue
    if (NEVER_PRUNE.has(targetKey.replaceAll('\\', '/'))) continue
    const target = containedTarget(root, targetKey)
    if (!existsSync(target)) continue
    if (hash(readFileSync(target, 'utf8')) !== meta.sha256) {
      result.modified.push(target)
      continue
    }
    result.removable.push(target)
    if (opts.yes) {
      rmSync(target)
      result.removed.push(target)
      delete previous.files[targetKey]
    }
  }

  if (opts.yes && result.removed.length) {
    writeFileSync(manifestFile(root), `${JSON.stringify(previous, null, 2)}\n`)
  }
  return result
}

/**
 * Remove all Processkit-managed harness assets, preserving files changed after
 * install. Shared registry content is unmerged by Processkit-owned bundle key.
 */
export function uninstallHarness(opts: {
  projectRoot?: string
  yes?: boolean
} = {}): HarnessUninstallResult {
  const root = path.resolve(opts.projectRoot ?? process.cwd())
  const previous = readManifest(root)
  assertCompatible(previous, manifestFile(root))
  const dryRun = !opts.yes
  const result: HarnessUninstallResult = {
    manifest: manifestFile(root),
    dryRun,
    wouldDelete: [],
    deleted: [],
    preservedModified: [],
    missing: [],
    manifestRemoved: false,
    gitignoreRemoved: [],
    gitignoreKept: [],
  }
  if (!previous) {
    if (!dryRun) forgetInstall(root)
    return result
  }

  for (const [targetKey, meta] of Object.entries(previous.files)) {
    const normalizedKey = targetKey.replaceAll('\\', '/')
    if (NEVER_PRUNE.has(normalizedKey)) continue
    const target = containedTarget(root, targetKey)
    if (!existsSync(target)) {
      result.missing.push(target)
      continue
    }
    if (hash(readFileSync(target, 'utf8')) !== meta.sha256) {
      result.preservedModified.push(target)
      continue
    }
    if (dryRun) {
      result.wouldDelete.push(target)
    } else {
      rmSync(target)
      result.deleted.push(target)
    }
  }

  const registry = unmergeExtractRegistry(root, dryRun)
  if (registry) result.registry = registry

  // Shared ignore entries (e.g. `.cursor/`) may still be relied on by another
  // toolkit, so only exclusively-owned patterns are removed.
  const owned = previous.gitignore ?? []
  result.gitignoreKept = owned.filter((entry) => entry.shared).map((entry) => entry.pattern)
  const exclusive = owned.filter((entry) => !entry.shared).map((entry) => entry.pattern)
  if (exclusive.length) {
    if (dryRun) {
      const file = path.join(root, '.gitignore')
      const present = new Set<string>()
      if (existsSync(file)) {
        for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
          const trimmed = line.trim()
          if (trimmed && !trimmed.startsWith('#')) present.add(canonicalGitignorePattern(trimmed))
        }
      }
      result.gitignoreRemoved = exclusive.filter((pattern) =>
        present.has(canonicalGitignorePattern(pattern)),
      )
    } else {
      result.gitignoreRemoved = removeGitignoreEntries(root, exclusive).removed
    }
  }

  if (dryRun) {
    result.wouldDelete.push(manifestFile(root))
    return result
  }

  if (existsSync(manifestFile(root))) {
    rmSync(manifestFile(root))
    result.manifestRemoved = true
  }
  forgetInstall(root)
  pruneEmptyDirs(root, [...result.deleted, manifestFile(root)])
  return result
}
