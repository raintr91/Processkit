import { readFileSync } from 'node:fs'

export const OPTIONAL_FALLBACK_SCHEMA_VERSION = '1.0.0' as const
export const OPTIONAL_FALLBACK_EVENT = 'processkit.missing-optional' as const
export const PROCESSKIT_PACKAGE = '@platform/processkit' as const

export type OptionalFallbackReason =
  | 'not-configured'
  | 'unavailable'
  | 'invocation-failed'

export type OptionalFallbackMode =
  | 'targeted-local-search'
  | 'model-analysis'

export interface ReadMetrics {
  fileReads: number
  contextBytes: number
}

export interface MissingOptionalEvent {
  schemaVersion: typeof OPTIONAL_FALLBACK_SCHEMA_VERSION
  event: typeof OPTIONAL_FALLBACK_EVENT
  package: typeof PROCESSKIT_PACKAGE
  runId: string
  optional: string
  reason: OptionalFallbackReason
  fallback: OptionalFallbackMode
  metrics: ReadMetrics
}

export interface MissingOptionalInput {
  runId: string
  optional: string
  reason: OptionalFallbackReason
  fallback: OptionalFallbackMode
  metrics: ReadMetrics
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0
}

export function validateMissingOptionalEvent(value: unknown): {
  ok: boolean
  errors: string[]
} {
  const errors: string[] = []
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, errors: ['event must be an object'] }
  }
  const event = value as Record<string, unknown>
  const allowed = new Set([
    'schemaVersion',
    'event',
    'package',
    'runId',
    'optional',
    'reason',
    'fallback',
    'metrics',
  ])
  for (const key of Object.keys(event)) {
    if (!allowed.has(key)) errors.push(`unexpected field: ${key}`)
  }
  if (event.schemaVersion !== OPTIONAL_FALLBACK_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${OPTIONAL_FALLBACK_SCHEMA_VERSION}`)
  }
  if (event.event !== OPTIONAL_FALLBACK_EVENT) {
    errors.push(`event must be ${OPTIONAL_FALLBACK_EVENT}`)
  }
  if (event.package !== PROCESSKIT_PACKAGE) {
    errors.push(`package must be ${PROCESSKIT_PACKAGE}`)
  }
  if (typeof event.runId !== 'string' || event.runId.length === 0) {
    errors.push('runId must be a non-empty string')
  }
  if (typeof event.optional !== 'string' || event.optional.length === 0) {
    errors.push('optional must be a non-empty string')
  }
  if (!['not-configured', 'unavailable', 'invocation-failed'].includes(String(event.reason))) {
    errors.push('reason is invalid')
  }
  if (!['targeted-local-search', 'model-analysis'].includes(String(event.fallback))) {
    errors.push('fallback is invalid')
  }
  if (typeof event.metrics !== 'object' || event.metrics === null || Array.isArray(event.metrics)) {
    errors.push('metrics must be an object')
  } else {
    const metrics = event.metrics as Record<string, unknown>
    if (!isNonNegativeInteger(metrics.fileReads)) {
      errors.push('metrics.fileReads must be a non-negative integer')
    }
    if (!isNonNegativeInteger(metrics.contextBytes)) {
      errors.push('metrics.contextBytes must be a non-negative integer')
    }
    for (const key of Object.keys(metrics)) {
      if (!['fileReads', 'contextBytes'].includes(key)) {
        errors.push(`unexpected metrics field: ${key}`)
      }
    }
  }
  return { ok: errors.length === 0, errors }
}

export class ReadMeasurement {
  #metrics: ReadMetrics = { fileReads: 0, contextBytes: 0 }

  read(file: string): Buffer {
    const content = readFileSync(file)
    this.#metrics.fileReads += 1
    this.#metrics.contextBytes += content.byteLength
    return content
  }

  readText(file: string): string {
    return this.read(file).toString('utf8')
  }

  snapshot(): ReadMetrics {
    return { ...this.#metrics }
  }
}

export class MissingOptionalEventEmitter {
  #emitted = new Set<string>()

  emit(input: MissingOptionalInput): MissingOptionalEvent | null {
    const key = `${input.runId}\0${input.optional}`
    if (this.#emitted.has(key)) return null
    const event: MissingOptionalEvent = {
      schemaVersion: OPTIONAL_FALLBACK_SCHEMA_VERSION,
      event: OPTIONAL_FALLBACK_EVENT,
      package: PROCESSKIT_PACKAGE,
      ...input,
      metrics: { ...input.metrics },
    }
    const result = validateMissingOptionalEvent(event)
    if (!result.ok) throw new Error(`Invalid missing-optional event: ${result.errors.join('; ')}`)
    this.#emitted.add(key)
    return event
  }
}
