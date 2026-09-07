export type BusinessStatus = 'pending_activation' | 'active' | 'paused' | 'suspended';
export type BranchStatus = 'active' | 'paused';
export type ProfileRole = 'owner' | 'manager' | 'cashier' | 'inventory_manager' | 'accountant' | 'sales_staff';
export type ProfileStatus = 'active' | 'paused' | 'suspended' | 'pending';
export type OwnerRequestStatus = 'pending' | 'approved' | 'rejected' | 'paused' | 'info_requested';
export type SupportTicketStatus = 'open' | 'in_progress' | 'waiting_for_user' | 'resolved' | 'closed';

export interface Business {
  id: string;
  owner_id: string;
  name: string;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  currency: string;
  tax_rate: number;
  status: BusinessStatus;
  activation_expires_at: string | null;
  branches_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  business_id: string;
  name: string;
  code: string | null;
  location: string | null;
  phone: string | null;
  manager_id: string | null;
  status: BranchStatus;
  is_main: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  business_id: string;
  full_name: string;
  phone: string | null;
  role: ProfileRole;
  status: ProfileStatus;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeatureRequest {
  id: string;
  business_id: string;
  feature: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_by: string | null;
  reason: string | null;
  admin_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  // joined for display, not a real column
  business_name?: string;
}

export interface OwnerRequest {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  business_name: string;
  message: string | null;
  status: OwnerRequestStatus;
  reference_code: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  business_id: string | null;
  branch_id: string | null;
  user_id: string | null;
  subject: string;
  category: string;
  description: string;
  status: SupportTicketStatus;
  created_at: string;
  updated_at: string;
}

export interface AdminAction {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  created_at: string;
}

export interface OtpStatusRow {
  id: string;
  attempts: number;
  max_attempts: number;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}
