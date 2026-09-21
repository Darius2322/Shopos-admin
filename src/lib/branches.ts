import { db, newRecordBase, enqueueSync } from './db';
import { recordAuditEvent } from './audit';
import type { Branch } from './types';

export interface CreateBranchInput {
  businessId: string;
  name: string;
  code?: string;
  location?: string;
  phone?: string;
}

export async function createBranch(input: CreateBranchInput, userId?: string | null): Promise<Branch> {
  const branch: Branch = {
    ...newRecordBase(),
    businessId: input.businessId,
    name: input.name,
    code: input.code || null,
    location: input.location || null,
    phone: input.phone || null,
    managerId: null,
    status: 'active'
  } as Branch;
  await db.branches.add(branch);
  await enqueueSync('branches', branch.id, 'create');
  await recordAuditEvent({ businessId: input.businessId, branchId: branch.id, userId, action: 'branch_created', entityType: 'branch', entityId: branch.id, newValue: JSON.stringify({ name: branch.name, location: branch.location }) });
  return branch;
}

export async function assignBranchManager(branchId: string, managerId: string | null, actorUserId?: string | null) {
  const branch = await db.branches.get(branchId);
  if (!branch) return;
  await db.branches.put({ ...branch, managerId, updatedAt: new Date().toISOString(), syncStatus: 'pending' });
  await enqueueSync('branches', branchId, 'update');
  await recordAuditEvent({ businessId: branch.businessId, branchId, userId: actorUserId, action: 'branch_manager_assigned', entityType: 'branch', entityId: branchId, newValue: JSON.stringify({ managerId }) });
}

export async function setBranchStatus(branchId: string, status: 'active' | 'paused', actorUserId?: string | null) {
  const branch = await db.branches.get(branchId);
  if (!branch) return;
  await db.branches.put({ ...branch, status, updatedAt: new Date().toISOString(), syncStatus: 'pending' });
  await enqueueSync('branches', branchId, 'update');
  await recordAuditEvent({ businessId: branch.businessId, branchId, userId: actorUserId, action: status === 'paused' ? 'branch_paused' : 'branch_resumed', entityType: 'branch', entityId: branchId });
}
