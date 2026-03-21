create or replace function log_change()
returns trigger language plpgsql security definer as $$
begin
  insert into audit_logs (table_name, record_id, action, old_data, new_data, performed_by)
  values (
    TG_TABLE_NAME,
    coalesce(NEW.id, OLD.id),
    TG_OP,
    case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end,
    coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  );
  return coalesce(NEW, OLD);
end;
$$;

-- Apply to security-sensitive tables
create trigger audit_payments after insert or update or delete on payments
  for each row execute procedure log_change();

create trigger audit_leases after insert or update or delete on leases
  for each row execute procedure log_change();

create trigger audit_organization_members after insert or update or delete on organization_members
  for each row execute procedure log_change();

create trigger audit_stripe_accounts after insert or update or delete on stripe_accounts
  for each row execute procedure log_change();
