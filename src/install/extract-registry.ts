import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { packageRoot } from '../config/project-root.js'

export function mergeExtractRegistry(projectRoot: string): string {
  const root = path.resolve(projectRoot)
  const source = path.join(
    packageRoot(),
    'harness',
    'docs',
    'extracts',
    'extract-registry.processkit.json',
  )
  const target = path.join(root, '.cursor', 'extracts', 'extract-registry.json')
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
