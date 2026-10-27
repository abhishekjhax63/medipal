-- =============================================================================
-- MEDIPAL · Blood Bank module · migration 001
-- =============================================================================
-- Non-destructive: this file only CREATEs objects inside the dedicated
-- `medipal` database. It never touches the existing `db/schema.sql` objects
-- (E-UPCHAR / hospital directory), which live in a separate database.
--
-- HONESTY CONTRACT (enforced by the schema itself, not just by application code)
--   1. Every stock quantity is traceable to a row in `blood_data_sources`, so the
--      UI can always state WHERE a number came from and WHEN it was last updated.
--   2. There is no seed data for donors or inventory. Empty means empty.
--   3. `blood_donors` and `blood_requests` hold contact details and therefore run
--      under FORCE ROW LEVEL SECURITY. Only the `medipal_api` server role can read
--      them; anything else reads NULL. Superusers still bypass RLS by PostgreSQL
--      design, which is why the server never runs as a superuser.
--   4. Public read access is served exclusively through the
--      `blood_public_availability` view, which contains no contact columns.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enumerations
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'blood_group') then
    create type blood_group as enum ('A+','A-','B+','B-','AB+','AB-','O+','O-');
  end if;
  if not exists (select 1 from pg_type where typname = 'blood_component') then
    create type blood_component as enum (
      'Packed Red Blood Cells','Whole Blood','Platelets','Fresh Frozen Plasma','Cryoprecipitate'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'blood_facility_category') then
    create type blood_facility_category as enum (
      'Regional Blood Center','Hospital Blood Bank','Trauma Center Depot','Mobile Collection Hub'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'blood_facility_status') then
    create type blood_facility_status as enum ('pending','under_review','approved','rejected','suspended');
  end if;
  if not exists (select 1 from pg_type where typname = 'blood_inventory_status') then
    create type blood_inventory_status as enum (
      'available','reserved','quarantine','approaching_expiry','expired'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'blood_movement_type') then
    create type blood_movement_type as enum (
      'receipt','issue','transfer_out','transfer_in','expiry_quarantine','manual_adjustment'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'blood_request_priority') then
    create type blood_request_priority as enum ('Routine','Urgent','Stat Emergency');
  end if;
  if not exists (select 1 from pg_type where typname = 'blood_request_status') then
    create type blood_request_status as enum (
      'created','sent_to_eligible','under_review','proposal_accepted','proposal_rejected',
      'dispatched','received','closed','cancelled'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'blood_donor_availability') then
    create type blood_donor_availability as enum (
      'available','temporarily_unavailable','recently_donated','unknown'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'blood_coldchain_status') then
    create type blood_coldchain_status as enum (
      'nominal','warning','critical_excursion','completed','exception_review'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'blood_transfer_status') then
    create type blood_transfer_status as enum (
      'requested','approved','in_transit','received','cancelled'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'blood_data_source_type') then
    create type blood_data_source_type as enum (
      'live_api','periodic_import','user_submitted_unverified','unavailable'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'blood_notification_type') then
    create type blood_notification_type as enum (
      'expiry_alert','verification_due','shortage_request','transfer_update',
      'cold_chain_alert','facility_approval','request_update'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Shared updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function blood_touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

-- -----------------------------------------------------------------------------
-- Reference counters for human-readable public identifiers
-- -----------------------------------------------------------------------------
create sequence if not exists blood_facility_ref_seq start 1;
create sequence if not exists blood_donor_ref_seq start 1;
create sequence if not exists blood_request_ref_seq start 1;

create or replace function blood_next_public_ref(prefix text, counter text)
returns text as $$
begin
  return prefix || '-' || to_char(now(), 'YY') || '-' ||
         lpad(nextval(counter)::text, 5, '0');
end;
$$ language plpgsql;

-- -----------------------------------------------------------------------------
-- 1. Data sources — the provenance register every number must point at
-- -----------------------------------------------------------------------------
create table if not exists blood_data_sources (
  id                  text primary key,
  name                text not null,
  source_type         blood_data_source_type not null,
  provider            text,
  url                 text,
  verification_status text not null default 'unverified',
  requires_registration boolean not null default false,
  notes               text,
  last_synced_at      timestamptz,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

comment on table blood_data_sources is
  'Provenance register. Every inventory row and facility row references exactly one source so the UI can disclose origin and freshness honestly.';

-- -----------------------------------------------------------------------------
-- 2. Facilities (blood banks / collection hubs)
-- -----------------------------------------------------------------------------
create table if not exists blood_facilities (
  id                uuid primary key default gen_random_uuid(),
  public_ref        text not null unique default blood_next_public_ref('MED-BBF', 'blood_facility_ref_seq'),
  name              text not null,
  category          blood_facility_category not null,
  address           text,
  city              text not null,
  district          text,
  state             text not null,
  postal_code       text,
  latitude          double precision,
  longitude         double precision,
  phone             text,
  emergency_hotline text,
  email             text,
  license_number    text,
  status            blood_facility_status not null default 'pending',
  has_blood_bank    boolean not null default true,
  operating_hours   text,
  authorized_rep    text,
  data_source_id    text not null references blood_data_sources(id),
  source_note       text,
  submitted_at      timestamptz not null default now(),
  last_verified_at  timestamptz,
  reviewed_at       timestamptz,
  reviewed_by       text,
  review_notes      text,
  contact_consent   boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint blood_facilities_status_gate check (
    status <> 'approved' or (license_number is not null and last_verified_at is not null)
  )
);

comment on constraint blood_facilities_status_gate on blood_facilities is
  'A facility cannot be marked approved without a licence number and a verification timestamp. Prevents silent promotion to the public list.';

create index if not exists blood_facilities_status_idx on blood_facilities (status);
create index if not exists blood_facilities_region_idx on blood_facilities (state, district, city);
create index if not exists blood_facilities_postal_idx on blood_facilities (postal_code);

drop trigger if exists blood_facilities_touch on blood_facilities;
create trigger blood_facilities_touch before update on blood_facilities
  for each row execute function blood_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Donors — private contact data, RLS-forced
-- -----------------------------------------------------------------------------
create table if not exists blood_donors (
  id                 uuid primary key default gen_random_uuid(),
  public_ref         text not null unique default blood_next_public_ref('MED-BBD', 'blood_donor_ref_seq'),
  full_name          text not null,
  blood_group        blood_group not null,
  phone              text not null,
  email              text,
  state              text not null,
  district           text,
  city               text not null,
  postal_code        text,
  latitude           double precision,
  longitude          double precision,
  availability       blood_donor_availability not null default 'unknown',
  last_donation_date date,
  total_donations    integer not null default 0 check (total_donations >= 0),
  age_confirmed      boolean not null default false,
  weight_confirmed   boolean not null default false,
  medically_cleared  boolean,
  consent_to_contact boolean not null default false,
  consent_recorded_at timestamptz,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint blood_donors_consent_required check (
    consent_to_contact = false or consent_recorded_at is not null
  ),
  constraint blood_donors_phone_shape check (phone ~ '^[0-9]{10}$')
);

comment on table blood_donors is
  'Private donor registry. `phone` is never returned by any public endpoint; the API exposes a masked form only.';

create index if not exists blood_donors_group_region_idx
  on blood_donors (blood_group, state, city);
create index if not exists blood_donors_availability_idx on blood_donors (availability);

drop trigger if exists blood_donors_touch on blood_donors;
create trigger blood_donors_touch before update on blood_donors
  for each row execute function blood_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Inventory
-- -----------------------------------------------------------------------------
create table if not exists blood_inventory (
  id               uuid primary key default gen_random_uuid(),
  facility_id      uuid not null references blood_facilities(id) on delete cascade,
  blood_group      blood_group not null,
  component        blood_component not null,
  quantity         integer not null check (quantity >= 0),
  unit             text not null default 'Units' check (unit in ('Units','mL')),
  batch_number     text,
  collection_date  date,
  expiry_date      date,
  storage_location text,
  status           blood_inventory_status not null default 'available',
  notes            text,
  reported_by      text,
  data_source_id   text not null references blood_data_sources(id),
  last_updated_at  timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint blood_inventory_expiry_order check (
    expiry_date is null or collection_date is null or expiry_date >= collection_date
  )
);

create index if not exists blood_inventory_facility_idx on blood_inventory (facility_id);
create index if not exists blood_inventory_lookup_idx
  on blood_inventory (blood_group, component, status);
create index if not exists blood_inventory_updated_idx on blood_inventory (last_updated_at desc);

drop trigger if exists blood_inventory_touch on blood_inventory;
create trigger blood_inventory_touch before update on blood_inventory
  for each row execute function blood_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Inventory movement ledger (append-only audit of every stock change)
-- -----------------------------------------------------------------------------
create table if not exists blood_inventory_movements (
  id            uuid primary key default gen_random_uuid(),
  facility_id   uuid not null references blood_facilities(id) on delete cascade,
  inventory_id  uuid references blood_inventory(id) on delete set null,
  blood_group   blood_group not null,
  component     blood_component not null,
  movement_type blood_movement_type not null,
  quantity      integer not null,
  unit          text not null default 'Units',
  balance_after integer,
  reason        text not null check (char_length(btrim(reason)) >= 4),
  performed_by  text,
  occurred_at   timestamptz not null default now()
);

create index if not exists blood_movements_facility_idx
  on blood_inventory_movements (facility_id, occurred_at desc);

-- -----------------------------------------------------------------------------
-- 6. Requests
-- -----------------------------------------------------------------------------
create table if not exists blood_requests (
  id                 uuid primary key default gen_random_uuid(),
  public_ref         text not null unique default blood_next_public_ref('MED-BBR', 'blood_request_ref_seq'),
  requester_name     text not null,
  contact_phone      text not null,
  contact_email      text,
  for_whom           text not null,
  patient_reference  text,
  blood_group        blood_group not null,
  component          blood_component not null,
  units_required     integer not null check (units_required between 1 and 20),
  priority           blood_request_priority not null default 'Routine',
  required_by        timestamptz,
  clinical_indication text,
  state              text not null,
  district           text,
  city               text not null,
  postal_code        text,
  hospital_name      text,
  hospital_verified  boolean not null default false,
  status             blood_request_status not null default 'created',
  supplying_facility_id uuid references blood_facilities(id) on delete set null,
  consent_recorded   boolean not null default false,
  consent_recorded_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  closed_at          timestamptz,
  constraint blood_requests_consent_required check (consent_recorded = true),
  constraint blood_requests_phone_shape check (contact_phone ~ '^[0-9]{10}$')
);

comment on table blood_requests is
  'Request intake. `status` is only ever advanced by an explicit, audited event — never optimistically.';

create index if not exists blood_requests_status_idx on blood_requests (status, created_at desc);
create index if not exists blood_requests_region_idx on blood_requests (state, city);
create index if not exists blood_requests_lookup_idx on blood_requests (public_ref, contact_phone);

drop trigger if exists blood_requests_touch on blood_requests;
create trigger blood_requests_touch before update on blood_requests
  for each row execute function blood_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 7. Request status history
-- -----------------------------------------------------------------------------
create table if not exists blood_request_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references blood_requests(id) on delete cascade,
  from_status blood_request_status,
  to_status   blood_request_status not null,
  note        text,
  actor       text not null default 'system',
  created_at  timestamptz not null default now()
);

create index if not exists blood_request_events_request_idx
  on blood_request_events (request_id, created_at);

-- -----------------------------------------------------------------------------
-- 8. Facility proposals against a request
-- -----------------------------------------------------------------------------
create table if not exists blood_request_proposals (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references blood_requests(id) on delete cascade,
  facility_id    uuid not null references blood_facilities(id) on delete cascade,
  units_offered  integer not null check (units_offered > 0),
  message        text,
  status         text not null default 'offered'
                 check (status in ('offered','accepted','rejected','withdrawn')),
  created_at     timestamptz not null default now(),
  responded_at   timestamptz,
  unique (request_id, facility_id)
);

-- -----------------------------------------------------------------------------
-- 9. Cold chain
-- -----------------------------------------------------------------------------
create table if not exists blood_cold_chain_passports (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  facility_id        uuid not null references blood_facilities(id) on delete cascade,
  transfer_id        uuid,
  target_min_celsius numeric(4,1) not null,
  target_max_celsius numeric(4,1) not null,
  current_temp_celsius numeric(4,1),
  status             blood_coldchain_status not null default 'nominal',
  started_at         timestamptz not null default now(),
  completed_at       timestamptz,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint blood_cold_chain_range check (target_max_celsius > target_min_celsius)
);

drop trigger if exists blood_cold_chain_touch on blood_cold_chain_passports;
create trigger blood_cold_chain_touch before update on blood_cold_chain_passports
  for each row execute function blood_touch_updated_at();

create table if not exists blood_cold_chain_observations (
  id           uuid primary key default gen_random_uuid(),
  passport_id  uuid not null references blood_cold_chain_passports(id) on delete cascade,
  temp_celsius numeric(4,1) not null,
  is_excursion boolean not null default false,
  note         text,
  recorded_by  text,
  recorded_at  timestamptz not null default now()
);

create index if not exists blood_cold_chain_obs_idx
  on blood_cold_chain_observations (passport_id, recorded_at);

-- -----------------------------------------------------------------------------
-- 10. Transfers
-- -----------------------------------------------------------------------------
create table if not exists blood_transfers (
  id                  uuid primary key default gen_random_uuid(),
  from_facility_id    uuid not null references blood_facilities(id) on delete cascade,
  to_facility_id      uuid not null references blood_facilities(id) on delete cascade,
  blood_group         blood_group not null,
  component           blood_component not null,
  quantity            integer not null check (quantity > 0),
  unit                text not null default 'Units',
  status              blood_transfer_status not null default 'requested',
  cold_chain_passport_id uuid references blood_cold_chain_passports(id) on delete set null,
  notes               text,
  requested_at        timestamptz not null default now(),
  dispatched_at       timestamptz,
  received_at         timestamptz,
  constraint blood_transfers_distinct_facilities check (from_facility_id <> to_facility_id)
);

-- -----------------------------------------------------------------------------
-- 11. Notifications
-- -----------------------------------------------------------------------------
create table if not exists blood_notifications (
  id          uuid primary key default gen_random_uuid(),
  audience    text not null check (audience in ('public','facility','platform_admin')),
  facility_id uuid references blood_facilities(id) on delete cascade,
  type        blood_notification_type not null,
  title       text not null,
  body        text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists blood_notifications_audience_idx
  on blood_notifications (audience, created_at desc);

-- -----------------------------------------------------------------------------
-- 12. Audit log
-- -----------------------------------------------------------------------------
create table if not exists blood_audit_logs (
  id         bigserial primary key,
  actor      text not null default 'anonymous',
  action     text not null,
  entity     text not null,
  entity_id  text,
  detail     jsonb,
  created_at timestamptz not null default now()
);

create index if not exists blood_audit_logs_entity_idx
  on blood_audit_logs (entity, created_at desc);

-- -----------------------------------------------------------------------------
-- Public availability view — the ONLY surface exposed to unauthenticated reads.
-- Contains no contact columns.
-- -----------------------------------------------------------------------------
-- Dropped and recreated rather than `create or replace`: later migrations widen
-- this view's column set, and REPLACE cannot remove a column it already has, so
-- a re-run of this file would otherwise fail. The view owns no data.
drop view if exists blood_public_availability;
create view blood_public_availability
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
join blood_inventory i on i.facility_id = f.id
where i.status in ('available','approaching_expiry')
  and i.quantity > 0
group by
  f.id, f.public_ref, f.name, f.category, f.address, f.city, f.district, f.state,
  f.postal_code, f.latitude, f.longitude, f.phone, f.emergency_hotline, f.has_blood_bank,
  f.status, f.operating_hours, f.last_verified_at, f.data_source_id, f.source_note,
  i.blood_group, i.component;

comment on view blood_public_availability is
  'Aggregated, contact-free inventory surface. Freshness (recently_verified / update_due / stale_unconfirmed) is derived by the API from inventory_last_updated_at so thresholds live in one place.';

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
-- The server connects as `medipal_api`; that role is created by the operator
-- (see db/migrations/002_blood_bank_roles.sql). We grant it explicitly here and
-- deny everyone else by default.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'medipal_api') then
    raise notice 'role medipal_api missing — RLS policies will be created by 002_blood_bank_roles.sql';
  end if;
end
$$;

alter table blood_donors          enable row level security;
alter table blood_requests        enable row level security;
alter table blood_request_events  enable row level security;
alter table blood_request_proposals enable row level security;
alter table blood_audit_logs      enable row level security;

alter table blood_donors          force row level security;
alter table blood_requests        force row level security;
alter table blood_request_events  force row level security;

drop policy if exists blood_donors_api on blood_donors;
create policy blood_donors_api on blood_donors
  for all to medipal_api using (true) with check (true);

drop policy if exists blood_requests_api on blood_requests;
create policy blood_requests_api on blood_requests
  for all to medipal_api using (true) with check (true);

drop policy if exists blood_request_events_api on blood_request_events;
create policy blood_request_events_api on blood_request_events
  for all to medipal_api using (true) with check (true);

drop policy if exists blood_request_proposals_api on blood_request_proposals;
create policy blood_request_proposals_api on blood_request_proposals
  for all to medipal_api using (true) with check (true);

drop policy if exists blood_audit_logs_api on blood_audit_logs;
create policy blood_audit_logs_api on blood_audit_logs
  for all to medipal_api using (true) with check (true);

-- -----------------------------------------------------------------------------
-- Approved-facility read surface for the API role
-- -----------------------------------------------------------------------------
grant usage on schema public to medipal_api;
grant select on blood_public_availability to medipal_api;
grant select, insert, update, delete on all tables in schema public to medipal_api;
grant usage, select on all sequences in schema public to medipal_api;

commit;
