import type { SeedData } from '../store';
import type { LeaseTenant, Conversation, ConversationParticipant, Message } from '@propnest/db';
import { faker } from '@faker-js/faker';
import { buildLandlord, buildTenant, buildOrganization, buildOrgMember, buildProperty, buildUnit, buildLease } from '../fixtures';

export function realtimeMessaging(): SeedData {
  const landlord = buildLandlord({ email: 'landlord@propnest-test.com', password: 'test123' });
  const tenant = buildTenant({ email: 'tenant@propnest-test.com', password: 'test123' });
  const org = buildOrganization({ name: 'Chat Test Org' });
  const member = buildOrgMember({ organization_id: org.id, user_id: landlord.id, role: 'owner' });
  const property = buildProperty({ organization_id: org.id });
  const unit = buildUnit({ property_id: property.id });
  const lease = buildLease({ unit_id: unit.id });

  const lt: LeaseTenant = {
    id: faker.string.uuid(),
    lease_id: lease.id,
    user_id: tenant.id,
    is_primary: true,
    invited_at: faker.date.past().toISOString(),
    accepted_at: faker.date.past().toISOString(),
  };

  const conversation: Conversation = {
    id: faker.string.uuid(),
    organization_id: org.id,
    subject: 'Lease Questions',
    created_at: faker.date.past().toISOString(),
  };

  const cp1: ConversationParticipant = {
    conversation_id: conversation.id,
    user_id: landlord.id,
    last_read_at: faker.date.recent().toISOString(),
  };

  const cp2: ConversationParticipant = {
    conversation_id: conversation.id,
    user_id: tenant.id,
    last_read_at: null,
  };

  const msg1: Message = {
    id: faker.string.uuid(),
    conversation_id: conversation.id,
    sender_id: tenant.id,
    body: 'When is rent due this month?',
    sent_at: faker.date.recent().toISOString(),
  };

  const msg2: Message = {
    id: faker.string.uuid(),
    conversation_id: conversation.id,
    sender_id: landlord.id,
    body: 'It is due on the 1st as usual.',
    sent_at: new Date().toISOString(),
  };

  return {
    users: [landlord, tenant],
    organizations: [org],
    organizationMembers: [member],
    properties: [property],
    units: [unit],
    leases: [lease],
    leaseTenants: [lt],
    conversations: [conversation],
    conversationParticipants: [cp1, cp2],
    messages: [msg1, msg2],
  };
}
