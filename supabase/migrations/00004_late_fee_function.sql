create or replace function generate_late_fees()
returns int language plpgsql security definer as $$
declare
  r record;
  count int := 0;
begin
  for r in
    select
      rc.id as charge_id,
      rc.lease_id,
      rc.amount as rent_amount,
      l.late_fee_type,
      l.late_fee_amount,
      l.grace_period_days
    from rent_charges rc
    join leases l on l.id = rc.lease_id
    where rc.charge_type = 'rent'
      and rc.is_waived = false
      and l.status = 'active'
      and l.late_fee_amount is not null
      and rc.due_date + l.grace_period_days < current_date
      and not exists (
        select 1 from payments p
        where p.rent_charge_id = rc.id
          and p.status = 'succeeded'
      )
      and not exists (
        select 1 from rent_charges lf
        where lf.lease_id = rc.lease_id
          and lf.charge_type = 'late_fee'
          and lf.due_date = rc.due_date
      )
  loop
    insert into rent_charges (lease_id, charge_type, amount, due_date, description)
    values (
      r.lease_id,
      'late_fee',
      case r.late_fee_type
        when 'flat' then r.late_fee_amount
        when 'percentage' then round(r.rent_amount * r.late_fee_amount / 100, 2)
      end,
      current_date,
      'Late fee for overdue rent charge ' || r.charge_id
    );
    count := count + 1;
  end loop;

  return count;
end;
$$;
