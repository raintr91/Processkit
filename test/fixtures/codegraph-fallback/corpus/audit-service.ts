export class AuditService {
  record(subjectId: string): string {
    return `audit:${subjectId}`
  }
}
