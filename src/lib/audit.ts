import { db, enqueueSync } from './db';

export interface AuditEventInput {
  businessId: string;
  branchId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  previousValue?: string | null;
  newValue?: string | null;
}

/** Writes one audit-log entry. The `audit_log` table and its sync mapper
 * have existed since the very first schema, but nothing in the app ever
 * called this — every action item 28 asks to be auditable (logins,
 * password changes, stock changes, sale actions, receipt regeneration,
 * etc.) currently produces zero audit trail. This is the first real
 * caller; extending coverage to the rest of those actions is a separate,
 * larger pass across many files, not done yet. */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  const entry = {
    id: crypto.randomUUID(),
    businessId: input.businessId,
    branchId: input.branchId ?? null,
    userId: input.userId ?? null,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    previousValue: input.previousValue ?? null,
    newValue: input.newValue ?? null,
    createdAt: new Date().toISOString()
  };
  await db.auditLog.add(entry as any);
  await enqueueSync('auditLog', entry.id, 'create');
}
