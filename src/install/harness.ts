import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { packageRoot, packageVersion } from '../config/project-root.js'

export type ProcesskitType = 'docs' | 'fe' | 'be'

export const SKILLS_BY_TYPE: Record<ProcesskitType, string[]> = {
  docs: ['business-process-trace', 'business-impact-review', 'flow-trace'],
  fe: ['business-impact-review'],
  be: ['business-impact-review'],
}

interface Manifest {
  schemaVersion: 1
  package: '@platform/processkit'
  packageVersion: string
  type: ProcesskitType
  toolApi: 1
  harnessApi: 1
  files: Record<string, { source: string; sha256: string }>
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

export function installHarness(opts: {
  projectRoot: string
  type: ProcesskitType
  force?: boolean
}): {
  written: string[]
  unchanged: string[]
  conflicts: string[]
} {
  const root = path.resolve(opts.projectRoot)
  const sourceRoot = path.join(packageRoot(), 'harness', opts.type)
  const previous: Manifest | null = existsSync(manifestFile(root))
    ? (JSON.parse(readFileSync(manifestFile(root), 'utf8')) as Manifest)
    : null
  const result = { written: [] as string[], unchanged: [] as string[], conflicts: [] as string[] }
  const files: Manifest['files'] = {}

  for (const source of walk(sourceRoot)) {
    const rel = path.relative(sourceRoot, source)
    if (rel === path.join('extracts', 'extract-registry.processkit.json')) continue
    const targetRel = path.join('.cursor', rel).split(path.sep).join('/')
    const target = path.join(root, targetRel)
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

  const manifest: Manifest = {
    schemaVersion: 1,
    package: '@platform/processkit',
    packageVersion: packageVersion(),
    type: opts.type,
    toolApi: 1,
    harnessApi: 1,
    files,
  }
  mkdirSync(path.dirname(manifestFile(root)), { recursive: true })
  writeFileSync(manifestFile(root), `${JSON.stringify(manifest, null, 2)}\n`)
  return result
}
