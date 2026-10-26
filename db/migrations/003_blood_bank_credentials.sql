-- =============================================================================
-- MEDIPAL · Blood Bank module · migration 003
-- Real, server-side credentials for the facility console.
-- =============================================================================
-- There is no simulated login anywhere in this module. When the platform team
-- approves a facility it issues an opaque access token; only the SHA-256 hash
-- is stored. Facility staff present the token as a bearer credential, and the
-- server resolves it to exactly one facility — that is the whole authorisation
-- model. Nothing about "who am I" is decided in the browser.
-- =============================================================================

begin;

create table if not exists blood_facility_credentials (
  id           uuid primary key default gen_random_uuid(),
  facility_id  uuid not null references blood_facilities(id) on delete cascade,
  label        text not null default 'primary',
  token_hash   text not null unique,
  token_hint   text not null,
  issued_by    text not null default 'platform_admin',
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

comment on table blood_facility_credentials is
  'Hashed facility access tokens. The cleartext token is shown to the operator exactly once, at issue time, and is never persisted or logged.';

create index if not exists blood_facility_credentials_facility_idx
  on blood_facility_credentials (facility_id)
  where revoked_at is null;

-- Migration 001's blanket `grant ... on all tables` ran before this table
-- existed, so the runtime role needs an explicit grant here or it will be
-- denied at the door ("permission denied for table blood_facility_credentials").
grant select, insert, update, delete on blood_facility_credentials to medipal_api;

alter table blood_facility_credentials enable row level security;
alter table blood_facility_credentials force row level security;

drop policy if exists blood_facility_credentials_api on blood_facility_credentials;
create policy blood_facility_credentials_api on blood_facility_credentials
  for all to medipal_api using (true) with check (true);

-- -----------------------------------------------------------------------------
-- Facility console read surface: the in-scope facility is resolved from the
-- bearer token, never from a client-supplied id.
-- -----------------------------------------------------------------------------
create or replace function blood_resolve_facility_token(p_token_hash text)
returns uuid as $$
  select c.facility_id
    from blood_facility_credentials c
    join blood_facilities f on f.id = c.facility_id
   where c.token_hash = p_token_hash
     and c.revoked_at is null
     and f.status = 'approved'
   limit 1;
$$ language sql stable security definer;

comment on function blood_resolve_facility_token(text) is
  'Maps a hashed bearer token to its facility. Requires the facility to still be approved, so suspending a facility revokes console access immediately.';

revoke all on function blood_resolve_facility_token(text) from public;
grant execute on function blood_resolve_facility_token(text) to medipal_api;

-- -----------------------------------------------------------------------------
-- Derived status: an inventory row whose expiry has passed is expired even if
-- nobody has run a housekeeping job. Keeps the search honest without a cron.
-- -----------------------------------------------------------------------------
create or replace view blood_inventory_effective
with (security_invoker = true) as
select
  i.*,
  case
    when i.expiry_date is not null and i.expiry_date < current_date then 'expired'::blood_inventory_status
    when i.expiry_date is not null and i.expiry_date <= current_date + 7 then 'approaching_expiry'::blood_inventory_status
    else i.status
  end as effective_status
from blood_inventory i;

grant select on blood_inventory_effective to medipal_api;

-- Re-point the public availability view at the derived status so that units
-- whose expiry date has already passed can never be counted as available, even
-- if no housekeeping job has run.
create or replace view blood_public_availability
with (security_invoker = true) as
select
  f.id                                as facility_id,
  f.public_ref                        as facility_ref,
  f.name                              as facility_name,
  f.category                          as facility_category,
  f.address,
  f.city,
  f.district,
  f.state,
  f.postal_code,
  f.latitude,
  f.longitude,
  f.phone,
  f.emergency_hotline,
  f.has_blood_bank,
  f.status                            as facility_status,
  f.operating_hours,
  f.last_verified_at                  as facility_last_verified_at,
  f.data_source_id,
  f.source_note,
  i.blood_group,
  i.component,
  sum(i.quantity)::integer            as available_quantity,
  max(i.unit)                         as unit,
  max(i.last_updated_at)              as inventory_last_updated_at,
  count(*)::integer                   as batch_count,
  min(i.expiry_date)                  as nearest_expiry_date
from blood_facilities f
join blood_inventory_effective i on i.facility_id = f.id
where i.effective_status in ('available','approaching_expiry')
  and i.quantity > 0
group by
  f.id, f.public_ref, f.name, f.category, f.address, f.city, f.district, f.state,
  f.postal_code, f.latitude, f.longitude, f.phone, f.emergency_hotline, f.has_blood_bank,
  f.status, f.operating_hours, f.last_verified_at, f.data_source_id, f.source_note,
  i.blood_group, i.component;

grant select on blood_public_availability to medipal_api;

commit;
