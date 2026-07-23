/**
 * Wire the Processkit MCP into supported agent configurations (Docskit pattern).
 *
 * Agents: claude | cursor | codex | opencode | hermes | gemini | antigravity | kiro | kilo
 *
 * Init always writes project-local configs under the destination repo root;
 * there is no location choice. Global cleanup for legacy Cursor wiring stays
 * in cursor-mcp.ts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { packageRoot } from '../config/project-root.js'
import { buildTomlTable, removeTomlTable, upsertTomlTable } from './toml.js'

export type AgentId =
  | 'claude'
  | 'cursor'
  | 'codex'
  | 'opencode'
  | 'hermes'
  | 'gemini'
  | 'antigravity'
  | 'kiro'
  | 'kilo'

export const AGENT_IDS: AgentId[] = [
  'claude',
  'cursor',
  'codex',
  'opencode',
  'hermes',
  'gemini',
  'antigravity',
  'kiro',
  'kilo',
]

export const AGENT_LABEL: Record<AgentId, string> = {
  claude: 'Claude Code',
  cursor: 'Cursor',
  codex: 'Codex CLI',
  opencode: 'opencode',
  hermes: 'Hermes Agent',
  gemini: 'Gemini CLI',
  antigravity: 'Antigravity IDE',
  kiro: 'Kiro',
  kilo: 'Kilo Code',
}

const AGENT_ALIASES: Record<string, AgentId> = {
  claude: 'claude',
  cursor: 'cursor',
  codex: 'codex',
  opencode: 'opencode',
  hermes: 'hermes',
  gemini: 'gemini',
  antigravity: 'antigravity',
  agy: 'antigravity',
  'google-antigravity': 'antigravity',
  kiro: 'kiro',
  kilo: 'kilo',
}

const MCP_NAME = 'processkit'

type StdioEntry = {
  type?: string
  command: string
  args: string[]
  env?: Record<string, string>
}

export function buildMcpEntry(projectRoot: string): StdioEntry {
  return {
    type: 'stdio',
    command: process.execPath,
    args: [path.join(packageRoot(), 'bin', 'processkit-mcp.mjs')],
    env: { PROCESSKIT_ROOT: path.resolve(projectRoot) },
  }
}

function mcpEntryForAgent(agent: AgentId, entry: StdioEntry): StdioEntry {
  if (agent === 'antigravity') {
    return { command: entry.command, args: entry.args, env: entry.env }
  }
  return entry
}

function xdgConfigHome(): string {
  const xdg = process.env.XDG_CONFIG_HOME?.trim()
  return xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config')
}

function hermesHome(): string {
  return process.env.HERMES_HOME
    ? path.resolve(process.env.HERMES_HOME)
    : path.join(os.homedir(), '.hermes')
}

function opencodeConfigPath(cwd: string): string {
  const jsonc = path.join(cwd, 'opencode.jsonc')
  const json = path.join(cwd, 'opencode.json')
  if (existsSync(jsonc)) return jsonc
  if (existsSync(json)) return json
  return jsonc
}

/** Project-local config file for an agent under the destination repo root. */
export function agentConfigPath(agent: AgentId, cwd: string): string {
  switch (agent) {
    case 'cursor':
      return path.join(cwd, '.cursor', 'mcp.json')
    case 'claude':
      return path.join(cwd, '.claude.json')
    case 'gemini':
      return path.join(cwd, '.gemini', 'settings.json')
    case 'kiro':
      return path.join(cwd, '.kiro', 'settings', 'mcp.json')
    case 'opencode':
      return opencodeConfigPath(cwd)
    case 'kilo':
      return path.join(cwd, '.kilocode', 'mcp.json')
    case 'codex':
      return path.join(cwd, '.codex', 'config.toml')
    case 'hermes':
      return path.join(cwd, '.hermes', 'config.yaml')
    case 'antigravity':
      return path.join(cwd, '.gemini', 'config', 'mcp_config.json')
  }
}

export function detectAgents(cwd = process.cwd()): AgentId[] {
  const found: AgentId[] = []

  if (
    existsSync(path.join(os.homedir(), '.claude.json')) ||
    existsSync(path.join(os.homedir(), '.claude')) ||
    existsSync(path.join(cwd, '.claude.json')) ||
    existsSync(path.join(cwd, '.mcp.json'))
  ) {
    found.push('claude')
  }
  if (existsSync(path.join(os.homedir(), '.cursor')) || existsSync(path.join(cwd, '.cursor'))) {
    found.push('cursor')
  }
  if (existsSync(path.join(os.homedir(), '.codex')) || existsSync(path.join(cwd, '.codex'))) {
    found.push('codex')
  }
  if (
    existsSync(path.join(xdgConfigHome(), 'opencode')) ||
    existsSync(path.join(cwd, 'opencode.jsonc')) ||
    existsSync(path.join(cwd, 'opencode.json'))
  ) {
    found.push('opencode')
  }
  if (existsSync(hermesHome()) || existsSync(path.join(cwd, '.hermes'))) {
    found.push('hermes')
  }
  if (
    existsSync(path.join(os.homedir(), '.gemini')) ||
    existsSync(path.join(cwd, '.gemini')) ||
    existsSync(path.join(cwd, 'GEMINI.md'))
  ) {
    found.push('gemini')
  }
  if (
    existsSync(path.join(os.homedir(), '.gemini', 'antigravity')) ||
    existsSync(path.join(os.homedir(), '.gemini', 'config')) ||
    existsSync(path.join(os.homedir(), '.antigravity-ide-server')) ||
    existsSync(path.join(cwd, '.gemini', 'antigravity'))
  ) {
    found.push('antigravity')
  }
  if (existsSync(path.join(os.homedir(), '.kiro')) || existsSync(path.join(cwd, '.kiro'))) {
    found.push('kiro')
  }
  if (
    existsSync(path.join(os.homedir(), '.kilocode')) ||
    existsSync(path.join(cwd, '.kilocode')) ||
    existsSync(path.join(cwd, '.kilo'))
  ) {
    found.push('kilo')
  }

  return found
}

export function parseTargets(raw: string | undefined, detected: AgentId[]): AgentId[] {
  const v = (raw ?? '').trim().toLowerCase()
  if (!v || v === 'auto') return detected.length ? detected : (['cursor'] as AgentId[])
  if (v === 'all') return [...AGENT_IDS]
  if (v === 'none') return []
  const out: AgentId[] = []
  for (const part of v.split(/[,\s]+/).filter(Boolean)) {
    const id = AGENT_ALIASES[part]
    if (!id) {
      throw new Error(`Unknown target "${part}". Known: ${AGENT_IDS.join(', ')}, agy, auto, all`)
    }
    if (!out.includes(id)) out.push(id)
  }
  return out
}

export function mergeMcpJson(file: string, entry: StdioEntry): string {
  mkdirSync(path.dirname(file), { recursive: true })
  let doc: { mcpServers?: Record<string, unknown> } = {}
  if (existsSync(file)) {
    const raw = readFileSync(file, 'utf8').trim()
    if (raw) {
      try {
        doc = JSON.parse(raw) as typeof doc
      } catch {
        doc = {}
      }
    }
  }
  doc.mcpServers ??= {}
  doc.mcpServers[MCP_NAME] = entry
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  return file
}

function mergeCodexToml(file: string, entry: StdioEntry): string {
  mkdirSync(path.dirname(file), { recursive: true })
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const block = buildTomlTable(`mcp_servers.${MCP_NAME}`, {
    command: entry.command,
    args: entry.args,
  })
  let { content } = upsertTomlTable(existing, `mcp_servers.${MCP_NAME}`, block)
  if (entry.env && Object.keys(entry.env).length) {
    const envHeader = `mcp_servers.${MCP_NAME}.env`
    const envBody = Object.entries(entry.env)
      .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
      .join('\n')
    const envBlock = `[${envHeader}]\n${envBody}`
    ;({ content } = upsertTomlTable(content, envHeader, envBlock))
  }
  writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
  return file
}

function parseJsonLoose(raw: string): Record<string, unknown> {
  const stripped = raw.replace(/^\s*\/\/.*$/gm, '')
  if (!stripped.trim()) return {}
  return JSON.parse(stripped) as Record<string, unknown>
}

function mergeOpencodeConfig(file: string, entry: StdioEntry): string {
  mkdirSync(path.dirname(file), { recursive: true })
  let doc: Record<string, unknown> = { $schema: 'https://opencode.ai/config.json' }
  if (existsSync(file)) {
    const raw = readFileSync(file, 'utf8')
    if (raw.trim()) {
      try {
        doc = parseJsonLoose(raw)
      } catch {
        /* keep schema default */
      }
    }
  }
  doc.$schema ??= 'https://opencode.ai/config.json'
  const mcp = (doc.mcp as Record<string, unknown> | undefined) ?? {}
  mcp[MCP_NAME] = {
    type: 'local',
    command: [entry.command, ...entry.args],
    enabled: true,
    environment: entry.env,
  }
  doc.mcp = mcp
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  return file
}

function mergeHermesYaml(file: string, entry: StdioEntry): string {
  mkdirSync(path.dirname(file), { recursive: true })
  let doc: Record<string, unknown> = {}
  if (existsSync(file)) {
    const raw = readFileSync(file, 'utf8')
    if (raw.trim()) {
      try {
        doc = (parseYaml(raw) as Record<string, unknown>) ?? {}
      } catch {
        doc = {}
      }
    }
  }

  const servers = (doc.mcp_servers as Record<string, unknown> | undefined) ?? {}
  servers[MCP_NAME] = {
    command: entry.command,
    args: entry.args,
    env: entry.env,
    timeout: 120,
    connect_timeout: 60,
    enabled: true,
  }
  doc.mcp_servers = servers

  const toolsets = (doc.platform_toolsets as Record<string, unknown> | undefined) ?? {}
  const cli = Array.isArray(toolsets.cli) ? [...(toolsets.cli as unknown[])] : ['hermes-cli']
  const tool = `mcp-${MCP_NAME}`
  if (!cli.includes(tool)) cli.push(tool)
  toolsets.cli = cli
  doc.platform_toolsets = toolsets

  writeFileSync(file, stringifyYaml(doc), 'utf8')
  return file
}

function writeAgentConfig(agent: AgentId, cwd: string, entry: StdioEntry): string {
  const file = agentConfigPath(agent, cwd)
  const shaped = mcpEntryForAgent(agent, entry)

  switch (agent) {
    case 'codex':
      return mergeCodexToml(file, shaped)
    case 'opencode':
      return mergeOpencodeConfig(file, shaped)
    case 'hermes':
      return mergeHermesYaml(file, shaped)
    default:
      return mergeMcpJson(file, shaped)
  }
}

function mergeClaudePermissions(cwd: string): string | null {
  const settings = path.join(cwd, '.claude', 'settings.json')
  mkdirSync(path.dirname(settings), { recursive: true })
  let doc: { permissions?: { allow?: string[] } } = {}
  if (existsSync(settings)) {
    try {
      doc = JSON.parse(readFileSync(settings, 'utf8')) as typeof doc
    } catch {
      doc = {}
    }
  }
  doc.permissions ??= {}
  doc.permissions.allow ??= []
  const wild = `mcp__${MCP_NAME}__*`
  if (!doc.permissions.allow.includes(wild)) {
    doc.permissions.allow.push(wild)
    writeFileSync(settings, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
    return settings
  }
  return null
}

export interface InstallAgentsOptions {
  projectRoot: string
  /** Explicit agent list (wizard result or parsed --target). */
  agents: AgentId[]
}

export interface InstallAgentsResult {
  targets: AgentId[]
  written: Array<{ agent: AgentId; path: string }>
  skipped: string[]
}

/** Write the Processkit MCP entry into each selected agent's project-local config. */
export function installAgents(opts: InstallAgentsOptions): InstallAgentsResult {
  const cwd = path.resolve(opts.projectRoot)
  const entry = buildMcpEntry(cwd)
  const written: InstallAgentsResult['written'] = []
  const skipped: string[] = []

  for (const agent of opts.agents) {
    written.push({ agent, path: writeAgentConfig(agent, cwd, entry) })
    if (agent === 'claude') {
      const perm = mergeClaudePermissions(cwd)
      if (perm) written.push({ agent: 'claude', path: `${perm} (permissions)` })
    }
    const skills = syncAgentSkills(agent, cwd)
    if (skills) written.push({ agent, path: `${skills} (skills)` })
  }

  if (!opts.agents.length) skipped.push('no targets selected')

  return { targets: opts.agents, written, skipped }
}

function removeMcpJson(file: string, dryRun: boolean): boolean {
  if (!existsSync(file)) return false
  const raw = readFileSync(file, 'utf8').trim()
  if (!raw) return false
  let doc: { mcpServers?: Record<string, unknown> }
  try {
    doc = JSON.parse(raw) as typeof doc
  } catch {
    return false
  }
  if (!doc.mcpServers || !(MCP_NAME in doc.mcpServers)) return false
  if (!dryRun) {
    delete doc.mcpServers[MCP_NAME]
    writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  }
  return true
}

function removeCodexToml(file: string, dryRun: boolean): boolean {
  if (!existsSync(file)) return false
  const existing = readFileSync(file, 'utf8')
  const server = removeTomlTable(existing, `mcp_servers.${MCP_NAME}`)
  const env = removeTomlTable(server.content, `mcp_servers.${MCP_NAME}.env`)
  const removed = server.removed || env.removed
  if (removed && !dryRun) {
    const content = env.content
    writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
  }
  return removed
}

function removeOpencodeConfig(file: string, dryRun: boolean): boolean {
  if (!existsSync(file)) return false
  const raw = readFileSync(file, 'utf8')
  if (!raw.trim()) return false
  let doc: Record<string, unknown>
  try {
    doc = parseJsonLoose(raw)
  } catch {
    return false
  }
  const mcp = doc.mcp as Record<string, unknown> | undefined
  if (!mcp || !(MCP_NAME in mcp)) return false
  if (!dryRun) {
    delete mcp[MCP_NAME]
    doc.mcp = mcp
    writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  }
  return true
}

function removeHermesYaml(file: string, dryRun: boolean): boolean {
  if (!existsSync(file)) return false
  const raw = readFileSync(file, 'utf8')
  if (!raw.trim()) return false
  let doc: Record<string, unknown>
  try {
    doc = (parseYaml(raw) as Record<string, unknown>) ?? {}
  } catch {
    return false
  }
  const servers = doc.mcp_servers as Record<string, unknown> | undefined
  const toolsets = doc.platform_toolsets as Record<string, unknown> | undefined
  const tool = `mcp-${MCP_NAME}`
  const cli = toolsets && Array.isArray(toolsets.cli) ? (toolsets.cli as unknown[]) : []
  const hasServer = Boolean(servers && MCP_NAME in servers)
  const hasTool = cli.includes(tool)
  if (!hasServer && !hasTool) return false
  if (!dryRun) {
    if (hasServer) delete servers![MCP_NAME]
    if (hasTool) toolsets!.cli = cli.filter((x) => x !== tool)
    writeFileSync(file, stringifyYaml(doc), 'utf8')
  }
  return true
}

function removeClaudePermissions(cwd: string, dryRun: boolean): string | null {
  const settings = path.join(cwd, '.claude', 'settings.json')
  if (!existsSync(settings)) return null
  let doc: { permissions?: { allow?: string[] } }
  try {
    doc = JSON.parse(readFileSync(settings, 'utf8')) as typeof doc
  } catch {
    return null
  }
  const allow = doc.permissions?.allow
  const wild = `mcp__${MCP_NAME}__*`
  if (!allow || !allow.includes(wild)) return null
  if (!dryRun) {
    doc.permissions!.allow = allow.filter((a) => a !== wild)
    writeFileSync(settings, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  }
  return settings
}

function syncAgentSkills(agent: AgentId, cwd: string): string | null {
  if (agent === 'antigravity' || agent === 'gemini') {
    const file = path.join(cwd, '.agents', 'skills.json')
    let current: { entries?: { path: string }[], inherits?: { path: string }[], exclude?: string[] } = {}
    if (existsSync(file)) {
      try {
        current = JSON.parse(readFileSync(file, 'utf8')) as typeof current
      } catch {
        current = {}
      }
    }
    current.entries ??= []
    const skillsPath = path.join('.cursor', 'skills').replaceAll('\\', '/')
    if (!current.entries.some((e) => e.path === skillsPath)) {
      current.entries.push({ path: skillsPath })
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
      return '.agents/skills.json'
    }
  }
  return null
}

function unsyncAgentSkills(agent: AgentId, cwd: string, dryRun: boolean): string | null {
  if (agent === 'antigravity' || agent === 'gemini') {
    const file = path.join(cwd, '.agents', 'skills.json')
    if (!existsSync(file)) return null
    let current: { entries?: { path: string }[], inherits?: { path: string }[], exclude?: string[] } = {}
    try {
      current = JSON.parse(readFileSync(file, 'utf8')) as typeof current
    } catch {
      return null
    }
    if (!current.entries) return null
    const skillsPath = path.join('.cursor', 'skills').replaceAll('\\', '/')
    const filtered = current.entries.filter((e) => e.path !== skillsPath)
    if (filtered.length < current.entries.length) {
      if (!dryRun) {
        current.entries = filtered
        if (current.entries.length === 0 && (!current.inherits || current.inherits.length === 0) && (!current.exclude || current.exclude.length === 0)) {
          rmSync(file, { force: true })
        } else {
          writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
        }
      }
      return '.agents/skills.json'
    }
  }
  return null
}

function removeAgentConfig(agent: AgentId, cwd: string, dryRun: boolean): string | null {
  const file = agentConfigPath(agent, cwd)
  let removed: boolean
  switch (agent) {
    case 'codex':
      removed = removeCodexToml(file, dryRun)
      break
    case 'opencode':
      removed = removeOpencodeConfig(file, dryRun)
      break
    case 'hermes':
      removed = removeHermesYaml(file, dryRun)
      break
    default:
      removed = removeMcpJson(file, dryRun)
  }
  return removed ? file : null
}

export interface UninstallAgentsOptions {
  projectRoot?: string
  /** csv | auto | all — defaults to all so every agent wired at init is unwired. */
  target?: string
  yes?: boolean
}

export interface UninstallAgentsResult {
  targets: AgentId[]
  dryRun: boolean
  removed: string[]
  absent: string[]
}

/** Reverse of installAgents — strip the processkit entry from local agent configs. */
export function uninstallAgents(opts: UninstallAgentsOptions = {}): UninstallAgentsResult {
  const dryRun = !opts.yes
  const cwd = path.resolve(opts.projectRoot ?? process.cwd())
  const targets = parseTargets(opts.target ?? 'all', detectAgents(cwd))
  const removed: string[] = []
  const absent: string[] = []

  for (const agent of targets) {
    const file = removeAgentConfig(agent, cwd, dryRun)
    if (file) {
      removed.push(`${agent}: ${file}`)
      if (agent === 'claude') {
        const perm = removeClaudePermissions(cwd, dryRun)
        if (perm) removed.push(`claude: ${perm} (permissions)`)
      }
      const skills = unsyncAgentSkills(agent, cwd, dryRun)
      if (skills) removed.push(`${agent}: ${skills} (skills)`)
    } else {
      absent.push(`${agent}: no ${MCP_NAME} entry`)
    }
  }

  return { targets, dryRun, removed, absent }
}
