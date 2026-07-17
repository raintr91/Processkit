import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveProjectRoot } from '../config/project-root.js'
import {
  scopeUnifiedDiff,
  validateBusinessProcess,
  validateImpactReport,
} from '../process/validate.js'

function text(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

function loadStructured(input: {
  json?: string
  file?: string
  projectRoot?: string
}): unknown {
  if (input.json) return JSON.parse(input.json)
  if (!input.file) throw new Error('Provide json or file')
  const root = resolveProjectRoot(input.projectRoot)
  const file = path.resolve(root, input.file)
  const body = readFileSync(file, 'utf8')
  return file.endsWith('.json') ? JSON.parse(body) : parse(body)
}

export function registerTools(server: McpServer): void {
  const structured = {
    json: z.string().optional().describe('Structured payload as JSON string'),
    file: z.string().optional().describe('JSON/YAML path relative to project root'),
    projectRoot: z.string().optional(),
  }

  server.tool(
    'business_process_validate',
    'Validate business-process steps, evidence, entrypoints and broken step references.',
    structured,
    async (input) => {
      try {
        return text(validateBusinessProcess(loadStructured(input) as never))
      } catch (error) {
        return text({ ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  )

  server.tool(
    'business_impact_validate',
    'Validate the required structure and evidence fields of a business impact review.',
    structured,
    async (input) => {
      try {
        return text(validateImpactReport(loadStructured(input) as Record<string, unknown>))
      } catch (error) {
        return text({ ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  )

  server.tool(
    'business_diff_scope',
    'Extract changed files, candidate symbols and risk hints from a unified diff. Does not replace caller/process tracing.',
    {
      diff: z.string().describe('Unified diff text'),
    },
    async ({ diff }) => text({ ok: true, ...scopeUnifiedDiff(diff) }),
  )
}
