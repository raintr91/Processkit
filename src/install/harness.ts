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

export type ProcesskitType = 'docs' | 'fe' | 'be'
export const PROCESSKIT_TOOL_API = 1
export const PROCESSKIT_HARNESS_API = 1
const NEVER_PRUNE = new Set([
  'platform-repos.json',
  '.cursor/extracts/extract-registry.json',
])

export const SKILLS_BY_TYPE: Record<ProcesskitType, string[]> = {
  docs: ['business-process-trace', 'business-impact-review', 'flow-trace'],
  fe: ['business-impact-review'],
  be: ['business-impact-review'],
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
  type: ProcesskitType
  toolApi: number
  harnessApi: number
  installedAt: string
  files: Record<string, ManagedFile>
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
  packageVersionInstalled: string | null
  toolApi: number | null
  harnessApi: number | null
  healthy: string[]
  missing: string[]
  modified: string[]
  stale: string[]
  compat: 'ok' | 'warn' | 'fail'
}

export interface PruneResult {
  removable: string[]
  modified: string[]
  removed: string[]
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
  return path.join(root, '.processkit', 'install-manifest.json')
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
    !['docs', 'fe', 'be'].includes(data.type ?? '') ||
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
  return data as InstallManifest
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
      packageVersionInstalled: null,
      toolApi: null,
      harnessApi: null,
      healthy,
      missing,
      modified,
      stale,
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
    type: previous.type,
    packageVersionInstalled: previous.packageVersion,
    toolApi: previous.toolApi,
    harnessApi: previous.harnessApi,
    healthy,
    missing,
    modified,
    stale,
    compat: !apiCompatible
      ? 'fail'
      : previous.packageVersion === packageVersion()
        ? 'ok'
        : 'warn',
  }
}

export function installHarness(opts: {
  projectRoot: string
  type: ProcesskitType
  force?: boolean
}): HarnessInstallResult {
  const root = path.resolve(opts.projectRoot)
  const sourceRoot = path.join(packageRoot(), 'harness', opts.type)
  const previous = readManifest(root)
  assertCompatible(previous, manifestFile(root))
  const result: HarnessInstallResult = {
    written: [],
    unchanged: [],
    conflicts: [],
    stale: [],
  }
  const files: InstallManifest['files'] = {}
  const sources = walk(sourceRoot).map((source) => ({
    source,
    targetRel: path.join('.cursor', path.relative(sourceRoot, source)).split(path.sep).join('/'),
  }))
  sources.push({
    source: path.join(packageRoot(), 'schemas', 'missing-optional-event.schema.json'),
    targetRel: '.cursor/schemas/processkit/missing-optional-event.schema.json',
  })

  for (const { source, targetRel } of sources) {
    const rel = path.relative(sourceRoot, source)
    if (rel === path.join('extracts', 'extract-registry.processkit.json')) continue
    const target = containedTarget(root, targetRel)
    const content = readFileSync(source, 'utf8')
    files[targetRel] = {
      source: path.relative(packageRoot(), source).split(path.sep).join('/'),
      sha256: hash(content),
    }

    if (existsSync(target)) {
      const current = readFileSync(target, 'utf8')
      if (current === content) {
        result.unchanged.push(target)
        continue
      }
      const safeUpdate = previous?.files[targetRel]?.sha256 === hash(current)
      if (!opts.force && !safeUpdate) {
        result.conflicts.push(target)
        continue
      }
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
    type: opts.type,
    toolApi: PROCESSKIT_TOOL_API,
    harnessApi: PROCESSKIT_HARNESS_API,
    installedAt: new Date().toISOString(),
    files,
  }
  mkdirSync(path.dirname(manifestFile(root)), { recursive: true })
  writeFileSync(manifestFile(root), `${JSON.stringify(manifest, null, 2)}\n`)
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
