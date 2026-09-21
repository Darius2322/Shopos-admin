import { db, enqueueSync } from './db';
import type { Notice, NoticeCategory, Role } from './types';

export interface CreateNoticeInput {
  businessId: string;
  createdBy: string;
  title: string;
  body: string;
  category: NoticeCategory;
  branchId?: string | null;   // null = whole business
  targetRole?: Role | null;   // null = all roles
  targetUserId?: string | null; // null = not aimed at one person
  pinned?: boolean;
  scheduledFor?: string | null; // null = publish immediately
  expiresAt?: string | null;
}

export async function createNotice(input: CreateNoticeInput): Promise<Notice> {
  const now = new Date().toISOString();
  const notice: Notice = {
    id: crypto.randomUUID(),
    businessId: input.businessId,
    branchId: input.branchId ?? null,
    targetRole: input.targetRole ?? null,
    targetUserId: input.targetUserId ?? null,
    createdBy: input.createdBy,
    title: input.title,
    body: input.body,
    category: input.category,
    pinned: input.pinned ?? false,
    publishedAt: now,
    scheduledFor: input.scheduledFor ?? null,
    expiresAt: input.expiresAt ?? null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending'
  };
  await db.notices.add(notice);
  await enqueueSync('notices', notice.id, 'create');
  return notice;
}

export interface UpdateNoticeInput {
  title: string;
  body: string;
  category: NoticeCategory;
  branchId?: string | null;
  targetRole?: Role | null;
  scheduledFor?: string | null;
  expiresAt?: string | null;
}

export async function updateNotice(id: string, input: UpdateNoticeInput) {
  const notice = await db.notices.get(id);
  if (!notice) return;
  await db.notices.put({
    ...notice,
    title: input.title, body: input.body, category: input.category,
    branchId: input.branchId ?? null, targetRole: input.targetRole ?? null,
    scheduledFor: input.scheduledFor ?? null, expiresAt: input.expiresAt ?? null,
    updatedAt: new Date().toISOString(), syncStatus: 'pending'
  });
  await enqueueSync('notices', id, 'update');
}

export async function archiveNotice(id: string) {
  const notice = await db.notices.get(id);
  if (!notice) return;
  await db.notices.put({ ...notice, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), syncStatus: 'pending' });
  await enqueueSync('notices', id, 'update');
}

export async function togglePin(id: string, pinned: boolean) {
  const notice = await db.notices.get(id);
  if (!notice) return;
  await db.notices.put({ ...notice, pinned, updatedAt: new Date().toISOString(), syncStatus: 'pending' });
  await enqueueSync('notices', id, 'update');
}

export async function acknowledgeNotice(noticeId: string, userId: string) {
  const existing = await db.noticeAcknowledgements.where({ noticeId, userId }).first();
  if (existing) return;
  const record = { id: crypto.randomUUID(), noticeId, userId, acknowledgedAt: new Date().toISOString() };
  await db.noticeAcknowledgements.add(record as any);
  await enqueueSync('noticeAcknowledgements', record.id, 'create');
}

/** Whether a notice is currently visible per its own scheduling/expiry —
 * separate from RLS, which controls WHO can see it; this controls WHEN. */
export function isNoticeLive(notice: Notice): boolean {
  const now = new Date().toISOString();
  if (notice.archivedAt) return false;
  if (notice.scheduledFor && notice.scheduledFor > now) return false;
  if (notice.expiresAt && notice.expiresAt < now) return false;
  return true;
}

/** A notice that's scheduled for the future — created, but not live yet.
 * Distinct from isNoticeLive's false case, which also covers archived and
 * expired; a manager reviewing their own drafts wants to tell these apart. */
export function isNoticeScheduled(notice: Notice): boolean {
  const now = new Date().toISOString();
  return !notice.archivedAt && !!notice.scheduledFor && notice.scheduledFor > now;
}

