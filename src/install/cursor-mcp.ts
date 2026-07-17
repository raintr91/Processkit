import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { packageRoot } from '../config/project-root.js'

export function installCursorMcp(projectRoot: string): {
  path: string
  written: boolean
} {
  const root = path.resolve(projectRoot)
  const file = path.join(root, '.cursor', 'mcp.json')
  mkdirSync(path.dirname(file), { recursive: true })
  let config: { mcpServers?: Record<string, unknown> } = { mcpServers: {} }
  if (existsSync(file)) {
    try {
      config = JSON.parse(readFileSync(file, 'utf8')) as typeof config
    } catch {
      config = { mcpServers: {} }
    }
  }
  if (!config.mcpServers) config.mcpServers = {}
  const entry = {
    type: 'stdio',
    command: process.execPath,
    args: [path.join(packageRoot(), 'bin', 'processkit-mcp.mjs')],
    env: { PROCESSKIT_ROOT: root },
  }
  if (JSON.stringify(config.mcpServers.processkit) === JSON.stringify(entry)) {
    return { path: file, written: false }
  }
  config.mcpServers.processkit = entry
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)
  return { path: file, written: true }
}
