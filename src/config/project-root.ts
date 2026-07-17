import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export function packageRoot(): string {
  return pkgRoot
}

export function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')) as {
    version?: string
  }
  return pkg.version ?? '0.0.0'
}

export function resolveProjectRoot(explicit?: string): string {
  const root = path.resolve(explicit ?? process.env.PROCESSKIT_ROOT ?? process.cwd())
  if (!existsSync(root)) throw new Error(`Processkit project root not found: ${root}`)
  return root
}
