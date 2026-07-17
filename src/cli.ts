import path from 'node:path'
import { packageRoot, packageVersion, resolveProjectRoot } from './config/project-root.js'
import { installCursorMcp } from './install/cursor-mcp.js'
import { installHarness, SKILLS_BY_TYPE, type ProcesskitType } from './install/harness.js'
import { mergeExtractRegistry } from './install/extract-registry.js'
import { seedProjectMaps } from './install/project-maps.js'
import { scopeUnifiedDiff, validateBusinessProcess, validateImpactReport } from './process/validate.js'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

function arg(name: string): string | undefined {
  const eq = process.argv.find((value) => value.startsWith(`${name}=`))
  if (eq) return eq.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function has(name: string): boolean {
  return process.argv.includes(name)
}

function usage(): never {
  console.log(`processkit ${packageVersion()}

  init --type=docs|fe|be [--target=cursor] [--project-root <path>] [--force] [--yes]
  process-validate --file <json|yaml> [--project-root <path>]
  impact-validate --file <json|yaml> [--project-root <path>]
  diff-scope --file <unified.diff>
  version

Owned skills:
  docs: ${SKILLS_BY_TYPE.docs.map((id) => `/${id}`).join(' ')}
  fe/be: /business-impact-review
`)
  process.exit(1)
}

function loadFile(file: string, root?: string): unknown {
  const absolute = path.resolve(resolveProjectRoot(root), file)
  const body = readFileSync(absolute, 'utf8')
  return absolute.endsWith('.json') ? JSON.parse(body) : parse(body)
}

async function main(): Promise<void> {
  const command = process.argv[2]
  if (!command || command === 'help' || command === '--help') usage()
  if (command === 'version' || command === '--version') {
    console.log(`processkit ${packageVersion()}`)
    console.log(`packageRoot ${packageRoot()}`)
    return
  }
  if (command === 'init') {
    const type = (arg('--type') ?? 'docs') as ProcesskitType
    if (!['docs', 'fe', 'be'].includes(type)) throw new Error('--type must be docs | fe | be')
    const root = resolveProjectRoot(arg('--project-root'))
    const target = arg('--target') ?? 'cursor'
    if (target === 'cursor' || target === 'all') {
      const mcp = installCursorMcp(root)
      console.log(`${mcp.written ? 'wrote' : 'unchanged'}: ${mcp.path}`)
    }
    const harness = installHarness({ projectRoot: root, type, force: has('--force') })
    for (const file of harness.written) console.log(`  wrote: ${file}`)
    for (const file of harness.unchanged) console.log(`  unchanged: ${file}`)
    for (const file of harness.conflicts) console.log(`  conflict: ${file}`)
    if (type === 'docs') console.log(`updated: ${mergeExtractRegistry(root)}`)
    const maps = seedProjectMaps(root, type)
    console.log(`updated: ${maps.platformRepos}`)
    if (maps.legacyRepos) console.log(`seeded/preserved: ${maps.legacyRepos}`)
    return
  }
  if (command === 'process-validate') {
    const file = arg('--file')
    if (!file) usage()
    const result = validateBusinessProcess(loadFile(file, arg('--project-root')) as never)
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.ok ? 0 : 1)
  }
  if (command === 'impact-validate') {
    const file = arg('--file')
    if (!file) usage()
    const result = validateImpactReport(
      loadFile(file, arg('--project-root')) as Record<string, unknown>,
    )
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.ok ? 0 : 1)
  }
  if (command === 'diff-scope') {
    const file = arg('--file')
    if (!file) usage()
    console.log(JSON.stringify(scopeUnifiedDiff(readFileSync(path.resolve(file), 'utf8')), null, 2))
    return
  }
  usage()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
