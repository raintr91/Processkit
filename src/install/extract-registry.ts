import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { packageRoot } from '../config/project-root.js'

function registryPaths(projectRoot: string): { source: string; target: string } {
  const root = path.resolve(projectRoot)
  return {
    source: path.join(
      packageRoot(),
      'harness',
      'docs',
      'extracts',
      'extract-registry.processkit.json',
    ),
    target: path.join(root, '.cursor', 'extracts', 'extract-registry.json'),
  }
}

export function mergeExtractRegistry(projectRoot: string): string {
  const { source, target } = registryPaths(projectRoot)
  const owned = JSON.parse(readFileSync(source, 'utf8')) as {
    version: number
    bundles: Record<string, string[]>
  }
  const current = existsSync(target)
    ? (JSON.parse(readFileSync(target, 'utf8')) as {
        version: number
        bundles: Record<string, string[]>
      })
    : { version: 1, bundles: {} }
  current.bundles = { ...current.bundles, ...owned.bundles }
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, `${JSON.stringify(current, null, 2)}\n`)
  return target
}

/** Remove only Processkit-owned bundle keys from the shared extract registry. */
export function unmergeExtractRegistry(
  projectRoot: string,
  dryRun = true,
): string | undefined {
  const { source, target } = registryPaths(projectRoot)
  if (!existsSync(source) || !existsSync(target)) return undefined
  const owned = JSON.parse(readFileSync(source, 'utf8')) as {
    bundles?: Record<string, string[]>
  }
  const current = JSON.parse(readFileSync(target, 'utf8')) as {
    version?: number
    bundles?: Record<string, string[]>
    [key: string]: unknown
  }
  const bundles = current.bundles ?? {}
  const present = Object.keys(owned.bundles ?? {}).filter((key) => key in bundles)
  if (!present.length) return undefined
  if (dryRun) {
    return `${target} (would remove ${present.length} Processkit bundle key(s))`
  }
  for (const key of present) delete bundles[key]
  current.bundles = bundles
  if (Object.keys(bundles).length === 0 && Object.keys(current).every((key) => {
    return key === 'version' || key === 'bundles'
  })) {
    unlinkSync(target)
    return `${target} (removed; no bundles left)`
  }
  writeFileSync(target, `${JSON.stringify(current, null, 2)}\n`)
  return `${target} (removed ${present.length} Processkit bundle key(s))`
}
