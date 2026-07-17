export const PROCESS_STEP_TYPES = [
  'page',
  'api',
  'call',
  'persist',
  'job',
  'event',
  'listener',
  'command',
  'mail',
  'webhook',
  'schedule',
] as const

export interface ProcessStep {
  id: string
  type: string
  system?: string
  route?: string
  symbol?: string
  input?: unknown
  output?: unknown
  async?: boolean
  evidence?: string
  next?: string[]
  verified?: boolean
}

export interface ProcessDocument {
  title?: string
  entrypoints?: string[]
  steps?: ProcessStep[]
  gaps?: unknown[]
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  summary: Record<string, unknown>
}

export function validateBusinessProcess(doc: ProcessDocument): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const steps = Array.isArray(doc.steps) ? doc.steps : []
  const ids = new Set<string>()

  if (!doc.title) warnings.push('title is missing')
  if (!steps.length) errors.push('steps must contain at least one process step')

  for (const [index, step] of steps.entries()) {
    const at = `steps[${index}]`
    if (!step?.id) errors.push(`${at}.id is required`)
    else if (ids.has(step.id)) errors.push(`${at}.id duplicates "${step.id}"`)
    else ids.add(step.id)

    if (!PROCESS_STEP_TYPES.includes(step?.type as (typeof PROCESS_STEP_TYPES)[number])) {
      errors.push(`${at}.type "${step?.type ?? ''}" is not supported`)
    }
    if (!step?.system) warnings.push(`${at}.system is missing`)
    if (!step?.evidence) {
      if (step?.verified === false) warnings.push(`${at} is explicitly unverified`)
      else errors.push(`${at}.evidence is required; set verified=false for an unresolved hop`)
    }
    if (!step?.route && !step?.symbol && !['persist', 'mail'].includes(step?.type)) {
      warnings.push(`${at} should record route or symbol`)
    }
  }

  for (const [index, step] of steps.entries()) {
    for (const next of step.next ?? []) {
      if (!ids.has(next)) errors.push(`steps[${index}].next references missing step "${next}"`)
    }
  }
  for (const entrypoint of doc.entrypoints ?? []) {
    if (!ids.has(entrypoint)) errors.push(`entrypoints references missing step "${entrypoint}"`)
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      steps: steps.length,
      verified: steps.filter((step) => step.verified !== false && Boolean(step.evidence)).length,
      unverified: steps.filter((step) => step.verified === false || !step.evidence).length,
      gaps: Array.isArray(doc.gaps) ? doc.gaps.length : 0,
    },
  }
}

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info']
const RISK_CLASSES = [
  'authz-idor',
  'request-bag',
  'trust-boundary',
  'over-broad-parse',
  'null-empty',
  'error-collapsing',
  'hardcode-magic',
  'async-context',
  'business-rule',
  'data-transaction',
  'contract-compatibility',
]

export function validateImpactReport(report: Record<string, unknown>): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const required = [
    'summary',
    'changedSymbols',
    'horizontalCallers',
    'verticalPaths',
    'findings',
    'residualRisks',
    'testPlan',
  ]
  for (const key of required) {
    if (report[key] == null) errors.push(`${key} is required`)
  }

  const findings = Array.isArray(report.findings)
    ? (report.findings as Array<Record<string, unknown>>)
    : []
  for (const [index, finding] of findings.entries()) {
    const severity = String(finding.severity ?? '').toLowerCase()
    if (!SEVERITIES.includes(severity)) {
      errors.push(`findings[${index}].severity must be ${SEVERITIES.join('|')}`)
    }
    const riskClass = String(finding.class ?? '')
    if (!RISK_CLASSES.includes(riskClass)) {
      warnings.push(`findings[${index}].class "${riskClass}" is not a canonical risk class`)
    }
    for (const key of ['evidence', 'impact', 'verify']) {
      if (!finding[key]) errors.push(`findings[${index}].${key} is required`)
    }
  }

  if (!Array.isArray(report.changedSymbols) || report.changedSymbols.length === 0) {
    warnings.push('changedSymbols is empty; state explicitly when reviewing a conceptual change')
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      findings: findings.length,
      severe: findings.filter((f) =>
        ['critical', 'high'].includes(String(f.severity ?? '').toLowerCase()),
      ).length,
      canonicalRiskClasses: RISK_CLASSES,
    },
  }
}

export function scopeUnifiedDiff(diff: string): {
  files: string[]
  candidateSymbols: string[]
  riskHints: string[]
} {
  const files = new Set<string>()
  const symbols = new Set<string>()
  const riskHints = new Set<string>()

  for (const line of diff.split(/\r?\n/)) {
    const file = line.match(/^\+\+\+ b\/(.+)$/)?.[1]
    if (file) files.add(file)
    if (!line.startsWith('+') && !line.startsWith('-')) continue
    const symbol = line.match(
      /\b(?:function|class|interface|trait)\s+([A-Za-z_$][\w$]*)|\b([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/,
    )
    const name = symbol?.[1] ?? symbol?.[2]
    if (name) symbols.add(name)
    if (/(auth|tenant|store_id|hotel_id|ownership|permission)/i.test(line)) {
      riskHints.add('authz-idor')
    }
    if (/\b(dispatch|queue|job|event|listener|schedule|retry)\b/i.test(line)) {
      riskHints.add('async-context')
    }
    if (/\b(request->all|\.all\(\)|merge\(|whereIn|normalize|parse)\b/i.test(line)) {
      riskHints.add('request-bag')
    }
    if (/\b(status|404|422|500|exception|catch)\b/i.test(line)) {
      riskHints.add('error-collapsing')
    }
  }
  return {
    files: [...files].sort(),
    candidateSymbols: [...symbols].sort(),
    riskHints: [...riskHints].sort(),
  }
}
