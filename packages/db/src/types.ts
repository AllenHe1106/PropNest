// Stub types matching the locked Postgres schema.
// Replace with `supabase gen types typescript --local` output once Supabase is initialized.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type OrgMemberRole = 'owner' | 'manager';
export type LeaseStatus = 'draft' | 'active' | 'expired' | 'terminated';
export type PaymentMethodType = 'stripe' | 'cash' | 'check' | 'bank_transfer' | 'other';
export type PaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded';
export type ChargeType = 'rent' | 'late_fee' | 'deposit' | 'utility' | 'other';
export type MaintenanceStatus = 'open' | 'in_progress' | 'pending_approval' | 'completed' | 'cancelled';
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'emergency';
export type DocumentEntityType = 'lease' | 'property' | 'unit' | 'maintenance_request';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgMemberRole;
  invited_at: string;
  accepted_at: string | null;
}

export interface Property {
  id: string;
  organization_id: string;
  name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  property_type: string | null;
  year_built: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Unit {
  id: string;
  property_id: string;
  unit_number: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_feet: number | null;
  rent_amount: number | null;
  is_available: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lease {
  id: string;
  unit_id: string;
  status: LeaseStatus;
  start_date: string;
  end_date: string | null;
  rent_amount: number;
  security_deposit: number | null;
  rent_due_day: number;
  grace_period_days: number;
  late_fee_type: string;
  late_fee_amount: number | null;
  signed_at: string | null;
  document_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaseTenant {
  id: string;
  lease_id: string;
  user_id: string;
  is_primary: boolean;
  invited_at: string;
  accepted_at: string | null;
}

export interface RentCharge {
  id: string;
  lease_id: string;
  charge_type: ChargeType;
  amount: number;
  due_date: string;
  description: string | null;
  is_waived: boolean;
  waived_by: string | null;
  waived_at: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  lease_id: string;
  rent_charge_id: string | null;
  paid_by: string;
  recorded_by: string | null;
  method: PaymentMethodType;
  status: PaymentStatus;
  amount: number;
  payment_date: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  receipt_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StripeAccount {
  id: string;
  organization_id: string;
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceRequest {
  id: string;
  unit_id: string;
  submitted_by: string;
  assigned_to: string | null;
  title: string;
  description: string;
  status: MaintenanceStatus;
  priority: MaintenancePriority;
  category: string | null;
  scheduled_date: string | null;
  completed_at: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceComment {
  id: string;
  request_id: string;
  author_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
}

export interface MaintenanceAttachment {
  id: string;
  request_id: string;
  uploaded_by: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number | null;
  created_at: string;
}

export interface Document {
  id: string;
  organization_id: string;
  entity_type: DocumentEntityType;
  entity_id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  organization_id: string;
  subject: string | null;
  created_at: string;
}

export interface ConversationParticipant {
  conversation_id: string;
  user_id: string;
  last_read_at: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  sent_at: string;
}

export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: Json | null;
  new_data: Json | null;
  performed_by: string;
  performed_at: string;
}
