import { touchActivity } from './activity';
import { create } from 'zustand';
import { supabase, backendConfigured } from './supabase';
import { db, enqueueSync, clearLocalBusinessDataIfSynced } from './db';
import { runSync } from './sync';
import { logSecurityEvent } from './security';
import type { Profile, Business, Branch } from './types';

/** One row per business the signed-in user has a membership in — powers
 * the business switcher. Derived from locally-synced `profiles` rows
 * (see phase1b migration: a user can always see their own membership rows
 * across every business, not just the currently active one), so this
 * works offline too. */
export interface MembershipOption {
  profileId: string;
  businessId: string;
  businessName: string;
  role: Profile['role'];
  status: Profile['status'];
}

interface AuthState {
  loading: boolean;
  syncingInitialData: boolean;
  userId: string | null;
  profile: Profile | null;
  business: Business | null;
  branches: Branch[];
  activeBranchId: string | null;
  canViewAllBranches: boolean;
  /** Every business this user belongs to, including the active one.
   * Length 1 for the overwhelming majority of users today — a second
   * entry only appears once someone is invited into a second business. */
  memberships: MembershipOption[];
  setActiveBranch: (branchId: string | null) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  bootstrap: () => Promise<void>;
  refresh: () => Promise<void>;
  activateWithCode: (code: string) => Promise<void>;
  /** Switches which business is "active" for this session. Requires
   * connectivity — the switch is validated and recorded server-side
   * (switch_active_business RPC) so that RLS write-policies, which read
   * the server's notion of "active business", agree with what the UI is
   * showing. Deliberately not attempted offline: doing it locally-only
   * would let the UI and the server's write scope disagree. */
  switchBusiness: (businessId: string) => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  loading: true,
  syncingInitialData: false,
  userId: null,
  profile: null,
  business: null,
  branches: [],
  activeBranchId: null,
  canViewAllBranches: false,
  memberships: [],

  async bootstrap() {
    set({ loading: true });
    try {
      if (backendConfigured()) {
        const { data } = await supabase!.auth.getSession();
        const userId = data.session?.user.id ?? null;
        if (userId) {
          // Try local data first so a returning user with cached data sees
          // something instantly, but a first-time sign-in on a fresh device
          // has nothing local yet — pull from Supabase before deciding the
          // account/business genuinely doesn't exist.
          await loadSessionData(userId, set);
          if (!get().business && navigator.onLine) {
            set({ syncingInitialData: true });
            try { await runSync(); } catch { /* handled by Sync Center */ }
            await loadSessionData(userId, set);
            set({ syncingInitialData: false });
          }
          const revoked = await checkForceLogout(get);
          if (revoked) {
            await get().signOut();
          } else {
            await checkActivationExpiry(get, set);
            await autoSelectBranch(get, set);
          }
        }
      }
    } finally {
      set({ loading: false });
    }
  },

  async signIn(email, password) {
    if (!backendConfigured()) throw new Error('No backend configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
    const { data, error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) {
      await logSecurityEvent({ type: 'login_failed', detail: email });
      throw error;
    }
    if (!data.user) return;
    // Record the moment this device's session started, so a later
    // "force logout" (an owner/admin revoking a session) can be detected
    // by comparing against profiles.forceLogoutAt on future syncs.
    await db.appContext.put({ key: 'session', sessionStartedAt: new Date().toISOString() });
    // Pull down this account's business/branch/product data before ever
    // rendering the app — otherwise a first-time login on a new device
    // shows an empty business because nothing has synced locally yet.
    set({ syncingInitialData: true });
    try { await runSync(); } catch { /* surfaced in Sync Center */ }
    await loadSessionData(data.user.id, set);
    await checkActivationExpiry(get, set);
    await autoSelectBranch(get, set);
    set({ syncingInitialData: false });
    await logSecurityEvent({ businessId: get().business?.id, userId: data.user.id, type: 'login_success' });
    touchActivity('login', get().business?.id);

    // Remembers which shop last logged in on THIS device/browser, purely
    // for display — a business name isn't sensitive, and this is what
    // lets the login screen greet returning staff with "ShopOS · Sam's
    // Kiosk" instead of a generic screen that could belong to any shop.
    const loggedInBusiness = get().business;
    if (loggedInBusiness) {
      try {
        localStorage.setItem('shopos-last-business', JSON.stringify({ name: loggedInBusiness.name, logoUrl: loggedInBusiness.logoUrl ?? null }));
      } catch { /* localStorage unavailable — display falls back to generic */ }
    }

    // Record this login for next time — deliberately NOT re-applied to the
    // in-memory `profile` state above, so WelcomeToast can still correctly
    // tell "this is your first login" apart from "you've logged in before"
    // during the current session, using the value that was true when this
    // sign-in started.
    // Update by the resolved profile's own id, NOT data.user.id — those are
    // only the same value for someone with a single business membership.
    // Since phase1, a user with a second business has a profile row whose
    // id differs from their auth user id, and updating by data.user.id
    // would silently write to a Dexie key that doesn't exist for them.
    const profileId = get().profile?.id;
    if (profileId) {
      const nowIso = new Date().toISOString();
      await db.profiles.update(profileId, { lastLoginAt: nowIso, updatedAt: nowIso });
      await enqueueSync('profiles', profileId, 'update');
    }
  },

  async signOut() {
    touchActivity('logout', get().business?.id); // fire-and-forget, before the session ends
    if (backendConfigured()) await supabase!.auth.signOut();
    await db.appContext.delete('current');
    set({ userId: null, profile: null, business: null, branches: [], activeBranchId: null, memberships: [] });
    // Best-effort — see clearLocalBusinessDataIfSynced()'s own comment for
    // why this is skipped rather than forced when something is still
    // unsynced. Either way the auth session itself is already fully
    // ended above; this is about local storage hygiene on shared
    // devices, not the actual security boundary.
    await clearLocalBusinessDataIfSynced();
  },

  async setActiveBranch(branchId: string | null) {
    if (branchId === null) {
      if (!get().canViewAllBranches) throw new Error('Only owners and managers can view all branches at once');
      await db.appContext.put({ key: 'current', businessId: get().business?.id, allBranches: true, userId: get().userId ?? undefined });
      set({ activeBranchId: null });
      return;
    }
    const allowed = get().branches.some((b) => b.id === branchId);
    if (!allowed) throw new Error('You are not authorized to access that branch');
    await db.appContext.put({ key: 'current', businessId: get().business?.id, branchId, allBranches: false, userId: get().userId ?? undefined });
    set({ activeBranchId: branchId });
  },

  /** Re-pulls from Supabase and reloads session data — used when the user
   * lands on a screen with no data and taps a manual "Refresh" action. */
  async refresh() {
    const userId = get().userId;
    if (!userId) return;
    set({ syncingInitialData: true });
    try { await runSync(); } catch { /* surfaced in Sync Center */ }
    await loadSessionData(userId, set);
    await autoSelectBranch(get, set);
    set({ syncingInitialData: false });
  },

  /** Submits the OTP entered by the user for activation. On success,
   * refreshes local state so the app leaves the activation screen. */
  async activateWithCode(code: string) {
    if (!supabase) throw new Error('No backend configured');
    const businessId = get().business?.id;
    if (!businessId) throw new Error('No business to activate');
    const { data: ok, error: rpcError } = await supabase.rpc('activate_business', { p_business_id: businessId, p_code: code });
    // A wrong code now comes back as `false` (so the attempt counter persists).
    const error = rpcError ?? (ok === false ? { message: 'Incorrect code' } : null);
    if (error) {
      await logSecurityEvent({ businessId, userId: get().userId, type: 'otp_failed', detail: error.message });
      throw new Error(error.message);
    }
    await logSecurityEvent({ businessId, userId: get().userId, type: 'otp_success' });
    await get().refresh();
  },

  async switchBusiness(businessId) {
    const userId = get().userId;
    if (!userId) return;
    const target = get().memberships.find((m) => m.businessId === businessId);
    if (!target) throw new Error('You do not have access to that business');
    if (target.businessId === get().business?.id) return; // already active
    if (!navigator.onLine) {
      throw new Error('You need an internet connection to switch businesses');
    }
    if (!backendConfigured()) throw new Error('No backend configured');
    const { error } = await supabase!.rpc('switch_active_business', { p_business_id: businessId });
    if (error) throw new Error(error.message);
    // Switching businesses means the previously active branch no longer
    // applies — clear it before reloading, same as a fresh first login.
    await db.appContext.put({ key: 'current', businessId, allBranches: false, userId });
    set({ activeBranchId: null });
    await loadSessionData(userId, set);
    await autoSelectBranch(get, set);
  }
}));

/** A user can hold more than one profile row (one per business — see the
 * phase1 business_memberships migration). Picks which one is "active" for
 * this session: the membership matching the last business stored in
 * appContext if there is one, otherwise the sole membership if there's
 * only one, otherwise falls back to the first active membership. A true
 * "first time with 2+ businesses and nothing stored yet" case is rare
 * enough (only triggered once a user is invited into a second business)
 * that this fallback plus the business switcher UI is enough — it never
 * leaves someone stuck with zero access. */
async function resolveActiveProfile(userId: string): Promise<Profile | undefined> {
  const mine = await db.profiles.where('userId').equals(userId).toArray();
  if (mine.length === 0) return undefined;
  if (mine.length === 1) return mine[0];
  const ctx = await db.appContext.get('current');
  if (ctx?.businessId) {
    const match = mine.find((p) => p.businessId === ctx.businessId);
    if (match) return match;
  }
  return mine.find((p) => p.status === 'active') ?? mine[0];
}

async function loadMemberships(userId: string): Promise<MembershipOption[]> {
  const mine = await db.profiles.where('userId').equals(userId).toArray();
  const withBusiness = await Promise.all(
    mine.map(async (p) => ({ profile: p, business: await db.businesses.get(p.businessId) }))
  );
  return withBusiness
    .filter((w): w is { profile: Profile; business: Business } => !!w.business)
    .map((w) => ({
      profileId: w.profile.id,
      businessId: w.business.id,
      businessName: w.business.name,
      role: w.profile.role,
      status: w.profile.status
    }));
}

async function loadSessionData(userId: string, set: (s: Partial<AuthState>) => void) {
  const profile = await resolveActiveProfile(userId);
  const memberships = await loadMemberships(userId);
  const business = profile ? await db.businesses.get(profile.businessId) : undefined;
  const allBranches = business ? await db.branches.where('businessId').equals(business.id).toArray() : [];
  // Owners and managers see every branch in the business. Other roles are
  // limited to profile_branches — the join table for exactly this, now
  // actually synced (previously it had no Dexie table or sync mapper, so
  // this always fell through to "every branch" regardless of role; see
  // README "Branch assignment" for the fix).
  let branches = allBranches;
  if (profile && profile.role !== 'owner' && profile.role !== 'manager') {
    const assignments = await db.profileBranches.where('profileId').equals(profile.id).toArray();
    const assignedIds = new Set(assignments.map((a) => a.branchId));
    const assignedBranches = allBranches.filter((b) => assignedIds.has(b.id));
    // If assignment sync hasn't populated anything yet (e.g. an existing
    // employee from before this feature existed, or sync hasn't run),
    // fall back to every branch rather than stranding them with zero —
    // an over-broad default is safer than an under-broad one that locks
    // someone out of their own job.
    branches = assignedBranches.length > 0 ? assignedBranches : allBranches;
  }
  set({
    userId,
    profile: profile ?? null,
    business: business ?? null,
    branches,
    memberships,
    canViewAllBranches: profile ? profile.role === 'owner' || profile.role === 'manager' : false
  });
}

/** If no branch is selected yet (e.g. very first login), default to the
 * first authorized branch instead of leaving the user staring at an empty
 * screen with no indication they need to open the branch switcher. An
 * owner/manager who previously chose "All Branches" stays there instead of
 * being silently bounced back to a single branch on the next launch. */
async function autoSelectBranch(get: () => AuthState, set: (s: Partial<AuthState>) => void) {
  const state = get();
  if (state.activeBranchId) return; // a real branch is already active — nothing to do
  const ctx = await db.appContext.get('current');
  if (ctx?.allBranches && state.canViewAllBranches) {
    set({ activeBranchId: null });
    return;
  }
  if (ctx?.branchId && state.branches.some((b) => b.id === ctx.branchId)) {
    set({ activeBranchId: ctx.branchId });
    return;
  }
  const first = state.branches.find((b) => b.status === 'active') ?? state.branches[0];
  if (first) {
    await db.appContext.put({ key: 'current', businessId: state.business?.id, branchId: first.id, allBranches: false, userId: state.userId ?? undefined });
    set({ activeBranchId: first.id });
  }
}

/** An owner/admin can revoke a user's access by setting
 * profiles.forceLogoutAt to "now" (see UsersList). Every bootstrap checks
 * whether that revocation happened after this device's session started;
 * if so, the device signs itself out even though the Supabase JWT is
 * technically still valid — this is the practical approximation of true
 * session revocation without running a custom auth server. */
async function checkForceLogout(get: () => AuthState): Promise<boolean> {
  const profile = get().profile;
  if (!profile?.forceLogoutAt) return false;
  const session = await db.appContext.get('session');
  const sessionStartedAt = session?.sessionStartedAt;
  if (!sessionStartedAt) return false;
  return new Date(profile.forceLogoutAt).getTime() > new Date(sessionStartedAt).getTime();
}

/** Self-heals a business past its activation_expires_at to 'paused', so
 * expiry doesn't depend on the platform-wide pg_cron sweep (schema_part9)
 * having run yet — the moment anyone from an expired business opens the
 * app or signs in, this catches it immediately. check_and_apply_expiry()
 * only ever touches the caller's own business (see its definition), so
 * this is safe to call unconditionally on every login/bootstrap. */
async function checkActivationExpiry(get: () => AuthState, set: (s: Partial<AuthState>) => void) {
  if (!backendConfigured() || !navigator.onLine) return;
  const businessId = get().business?.id;
  if (!businessId) return;
  try {
    const { data: justPaused } = await supabase!.rpc('check_and_apply_expiry');
    if (justPaused) {
      const business = await db.businesses.get(businessId);
      if (business) {
        const updated = { ...business, status: 'paused' as const };
        await db.businesses.put(updated);
        set({ business: updated });
      }
    }
  } catch {
    // Non-critical — the platform-wide sweep (or the next successful
    // call of this) will still catch it. Never block sign-in on this.
  }
}
