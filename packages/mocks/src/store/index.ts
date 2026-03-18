import type {
  Organization,
  Profile,
  OrganizationMember,
  Property,
  Unit,
  Lease,
  LeaseTenant,
  RentCharge,
  Payment,
  StripeAccount,
  MaintenanceRequest,
  MaintenanceComment,
  MaintenanceAttachment,
  Document,
  Conversation,
  ConversationParticipant,
  Message,
} from '@propnest/db';

// ---------- Mock-only types ----------

export interface MockUser {
  id: string;
  email: string;
  password: string;
  role: 'tenant' | 'landlord' | 'manager';
  user_metadata?: Record<string, unknown>;
}

export interface MockSession {
  access_token: string;
  refresh_token: string;
  user_id: string;
  expires_at: number;
}

export interface MockUpload {
  bucket: string;
  path: string;
  mime_type: string;
  data: Uint8Array | string;
  created_at: string;
}

export interface MockPaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'succeeded' | 'canceled';
  client_secret: string;
  transfer_data?: { destination: string; amount?: number };
  metadata?: Record<string, string>;
}

export interface MockStripeConnectAccount {
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}

// ---------- Seed data ----------

export interface SeedData {
  users?: MockUser[];
  sessions?: MockSession[];
  organizations?: Organization[];
  profiles?: Profile[];
  organizationMembers?: OrganizationMember[];
  properties?: Property[];
  units?: Unit[];
  leases?: Lease[];
  leaseTenants?: LeaseTenant[];
  rentCharges?: RentCharge[];
  payments?: Payment[];
  stripeAccounts?: StripeAccount[];
  maintenanceRequests?: MaintenanceRequest[];
  maintenanceComments?: MaintenanceComment[];
  maintenanceAttachments?: MaintenanceAttachment[];
  documents?: Document[];
  conversations?: Conversation[];
  conversationParticipants?: ConversationParticipant[];
  messages?: Message[];
  uploads?: MockUpload[];
  stripePaymentIntents?: MockPaymentIntent[];
  stripeConnectAccounts?: MockStripeConnectAccount[];
}

// ---------- MockStore ----------

export interface MockStore {
  users: Map<string, MockUser>;
  sessions: Map<string, MockSession>;
  organizations: Map<string, Organization>;
  profiles: Map<string, Profile>;
  organizationMembers: Map<string, OrganizationMember>;
  properties: Map<string, Property>;
  units: Map<string, Unit>;
  leases: Map<string, Lease>;
  leaseTenants: Map<string, LeaseTenant>;
  rentCharges: Map<string, RentCharge>;
  payments: Map<string, Payment>;
  stripeAccounts: Map<string, StripeAccount>;
  maintenanceRequests: Map<string, MaintenanceRequest>;
  maintenanceComments: Map<string, MaintenanceComment>;
  maintenanceAttachments: Map<string, MaintenanceAttachment>;
  documents: Map<string, Document>;
  conversations: Map<string, Conversation>;
  conversationParticipants: Map<string, ConversationParticipant>;
  messages: Map<string, Message>;
  uploads: Map<string, MockUpload>;
  stripePaymentIntents: Map<string, MockPaymentIntent>;
  stripeConnectAccounts: Map<string, MockStripeConnectAccount>;

  reset(): void;
  seed(data: SeedData): void;
}

export function createMockStore(): MockStore {
  const store: MockStore = {
    users: new Map(),
    sessions: new Map(),
    organizations: new Map(),
    profiles: new Map(),
    organizationMembers: new Map(),
    properties: new Map(),
    units: new Map(),
    leases: new Map(),
    leaseTenants: new Map(),
    rentCharges: new Map(),
    payments: new Map(),
    stripeAccounts: new Map(),
    maintenanceRequests: new Map(),
    maintenanceComments: new Map(),
    maintenanceAttachments: new Map(),
    documents: new Map(),
    conversations: new Map(),
    conversationParticipants: new Map(),
    messages: new Map(),
    uploads: new Map(),
    stripePaymentIntents: new Map(),
    stripeConnectAccounts: new Map(),

    reset() {
      store.users.clear();
      store.sessions.clear();
      store.organizations.clear();
      store.profiles.clear();
      store.organizationMembers.clear();
      store.properties.clear();
      store.units.clear();
      store.leases.clear();
      store.leaseTenants.clear();
      store.rentCharges.clear();
      store.payments.clear();
      store.stripeAccounts.clear();
      store.maintenanceRequests.clear();
      store.maintenanceComments.clear();
      store.maintenanceAttachments.clear();
      store.documents.clear();
      store.conversations.clear();
      store.conversationParticipants.clear();
      store.messages.clear();
      store.uploads.clear();
      store.stripePaymentIntents.clear();
      store.stripeConnectAccounts.clear();
    },

    seed(data: SeedData) {
      if (data.users) {
        for (const u of data.users) store.users.set(u.id, u);
      }
      if (data.sessions) {
        for (const s of data.sessions) store.sessions.set(s.access_token, s);
      }
      if (data.organizations) {
        for (const o of data.organizations) store.organizations.set(o.id, o);
      }
      if (data.profiles) {
        for (const p of data.profiles) store.profiles.set(p.id, p);
      }
      if (data.organizationMembers) {
        for (const m of data.organizationMembers) store.organizationMembers.set(m.id, m);
      }
      if (data.properties) {
        for (const p of data.properties) store.properties.set(p.id, p);
      }
      if (data.units) {
        for (const u of data.units) store.units.set(u.id, u);
      }
      if (data.leases) {
        for (const l of data.leases) store.leases.set(l.id, l);
      }
      if (data.leaseTenants) {
        for (const lt of data.leaseTenants) store.leaseTenants.set(lt.id, lt);
      }
      if (data.rentCharges) {
        for (const rc of data.rentCharges) store.rentCharges.set(rc.id, rc);
      }
      if (data.payments) {
        for (const p of data.payments) store.payments.set(p.id, p);
      }
      if (data.stripeAccounts) {
        for (const sa of data.stripeAccounts) store.stripeAccounts.set(sa.id, sa);
      }
      if (data.maintenanceRequests) {
        for (const mr of data.maintenanceRequests) store.maintenanceRequests.set(mr.id, mr);
      }
      if (data.maintenanceComments) {
        for (const mc of data.maintenanceComments) store.maintenanceComments.set(mc.id, mc);
      }
      if (data.maintenanceAttachments) {
        for (const ma of data.maintenanceAttachments) store.maintenanceAttachments.set(ma.id, ma);
      }
      if (data.documents) {
        for (const d of data.documents) store.documents.set(d.id, d);
      }
      if (data.conversations) {
        for (const c of data.conversations) store.conversations.set(c.id, c);
      }
      if (data.conversationParticipants) {
        for (const cp of data.conversationParticipants) {
          store.conversationParticipants.set(`${cp.conversation_id}:${cp.user_id}`, cp);
        }
      }
      if (data.messages) {
        for (const m of data.messages) store.messages.set(m.id, m);
      }
      if (data.uploads) {
        for (const u of data.uploads) store.uploads.set(`${u.bucket}:${u.path}`, u);
      }
      if (data.stripePaymentIntents) {
        for (const pi of data.stripePaymentIntents) store.stripePaymentIntents.set(pi.id, pi);
      }
      if (data.stripeConnectAccounts) {
        for (const ca of data.stripeConnectAccounts) store.stripeConnectAccounts.set(ca.id, ca);
      }
    },
  };

  return store;
}
