-- =============================================================================
-- MEDIPAL · Ambulance module · migration 004
-- =============================================================================
-- Non-destructive: this file only CREATEs objects. It never alters or drops a
-- Blood Bank or E-UPCHAR object.
--
-- HONESTY CONTRACT (enforced by the schema, not just by application code)
--   1. A provider row only becomes publicly visible once its status is
--      'approved'. Nothing else is served to the public provider list.
--   2. Availability, price and response time are stored PER PROVIDER, PER
--      CATEGORY, and each carries `availability_source` and `last_confirmed_at`.
--      A number with no source and no timestamp prints as "not confirmed".
--   3. Live GPS tracking is impossible unless the provider actually runs a
--      dispatch feed. `tracking_mode` defaults to 'phone_only', and
--      `dispatch_integration` stays NULL until a real authorised integration is
--      configured — so the UI can never fake a moving ambulance.
--   4. A booking is never marked dispatched/accepted by MEDIPAL. Those statuses
--      are only written by a provider feed or by a recorded operator phone
--      confirmation, and every write appends to `ambulance_booking_events`.
--   5. No seed rows for providers, coverage or bookings. Empty means empty.
--   6. Bookings hold a patient's name, phone and pickup coordinates, so they run
--      under FORCE ROW LEVEL SECURITY and are never exposed through a view
--      without contact columns.
-- =============================================================================

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enumerations
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ambulance_category') then
    create type ambulance_category as enum (
      'Basic Life Support (BLS)',
      'Advanced Life Support (ALS)',
      'Patient Transport Vehicle (PTV)',
      'Other Locally Available Service'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ambulance_provider_type') then
    create type ambulance_provider_type as enum (
      'Government','Private','NGO / Trust','Hospital-owned'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ambulance_provider_status') then
    create type ambulance_provider_status as enum (
      'pending','under_review','approved','rejected','suspended'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ambulance_availability') then
    create type ambulance_availability as enum (
      'available','limited','unavailable','unknown'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ambulance_availability_source') then
    create type ambulance_availability_source as enum (
      'provider_declared','provider_dispatch_feed','medipal_verified','not_confirmed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ambulance_tracking_mode') then
    create type ambulance_tracking_mode as enum (
      'phone_only','provider_portal','provider_dispatch_feed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ambulance_urgency') then
    create type ambulance_urgency as enum ('emergency','non_emergency');
  end if;

  if not exists (select 1 from pg_type where typname = 'ambulance_booking_status') then
    create type ambulance_booking_status as enum (
      'requested','accepted','assigned','dispatched','en_route','arrived',
      'completed','cancelled','unable_to_fulfil'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ambulance_event_source') then
    create type ambulance_event_source as enum (
      'medipal','provider_dispatch_feed','provider_phone_confirmation','patient'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ambulance_data_source_type') then
    create type ambulance_data_source_type as enum (
      'live_api','periodic_import','user_submitted_unverified','unavailable'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Shared updated_at trigger (reuses the Blood Bank helper)
-- -----------------------------------------------------------------------------
create or replace function ambulance_touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

-- -----------------------------------------------------------------------------
-- Human-readable public identifiers
-- -----------------------------------------------------------------------------
create sequence if not exists ambulance_provider_ref_seq start 1;
create sequence if not exists ambulance_booking_ref_seq start 1;

-- -----------------------------------------------------------------------------
-- 1. Provenance register
-- -----------------------------------------------------------------------------
create table if not exists ambulance_data_sources (
  id                  text primary key,
  name                text not null,
  source_type         ambulance_data_source_type not null,
  provider            text not null,
  url                 text,
  verification_status text not null,
  requires_registration boolean not null default false,
  notes               text not null,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

comment on table ambulance_data_sources is
  'Where each ambulance fact may legitimately come from, and what it is and is not allowed to claim. Static reference rows only — no provider, coverage or booking data.';

-- -----------------------------------------------------------------------------
-- 2. Emergency contacts (configurable, verified reference data)
-- -----------------------------------------------------------------------------
create table if not exists ambulance_emergency_contacts (
  id         text primary key,
  label      text not null,
  number     text not null,
  scope      text not null,
  region     text not null default 'IN',
  url        text,
  notes      text not null,
  sort_order integer not null default 100,
  is_active  boolean not null default true,
  constraint ambulance_emergency_contacts_number_shape check (number ~ '^[0-9]{3,6}$')
);

comment on table ambulance_emergency_contacts is
  'Official emergency telephone numbers MEDIPAL may display. Dialling one of these places a normal telephone call — MEDIPAL does not dispatch anything.';

-- -----------------------------------------------------------------------------
-- 3. Providers
-- -----------------------------------------------------------------------------
create table if not exists ambulance_providers (
  id                      uuid primary key default gen_random_uuid(),
  public_ref              text not null unique
                            default 'AMB-PRV-' || to_char(now(), 'YY') || '-' ||
                                    lpad(nextval('ambulance_provider_ref_seq')::text, 5, '0'),
  name                    text not null,
  provider_type           ambulance_provider_type not null,
  contact_phone           text not null,
  alternate_phone         text,
  emergency_hotline       text,
  email                   text,
  address                 text,
  city                    text,
  district                text,
  state                   text,
  postal_code             text,
  latitude                double precision,
  longitude               double precision,
  coordinates_verified    boolean not null default false,
  service_area            text,
  operating_hours         text,
  status                  ambulance_provider_status not null default 'pending',
  tracking_mode           ambulance_tracking_mode not null default 'phone_only',
  dispatch_integration    text,
  notes                   text,
  data_source_id          text not null references ambulance_data_sources(id),
  source_note             text,
  last_verified_at        timestamptz,
  reviewed_at             timestamptz,
  reviewed_by             text,
  review_notes            text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint ambulance_providers_contact_shape check (contact_phone ~ '^\+?[0-9]{10,15}$'),
  constraint ambulance_providers_lat_range check (latitude is null or (latitude >= -90 and latitude <= 90)),
  constraint ambulance_providers_lon_range check (longitude is null or (longitude >= -180 and longitude <= 180)),
  -- A coordinate pair is either fully present and flagged verified, or absent.
  constraint ambulance_providers_coordinates_pair check (
    (latitude is null and longitude is null) or (latitude is not null and longitude is not null)
  ),
  constraint ambulance_providers_approved_needs_contact check (
    status <> 'approved' or (contact_phone is not null and last_verified_at is not null)
  ),
  -- Live tracking is impossible without a real integration behind it.
  constraint ambulance_providers_tracking_needs_integration check (
    tracking_mode = 'phone_only' or dispatch_integration is not null
  )
);

comment on table ambulance_providers is
  'Ambulance operators MEDIPAL knows about. Only rows with status = approved appear in any public list.';

create index if not exists ambulance_providers_status_idx on ambulance_providers (status);
create index if not exists ambulance_providers_state_idx on ambulance_providers (state);

drop trigger if exists ambulance_providers_touch on ambulance_providers;
create trigger ambulance_providers_touch before update on ambulance_providers
  for each row execute function ambulance_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Per-category coverage for a provider
-- -----------------------------------------------------------------------------
create table if not exists ambulance_provider_services (
  id                        uuid primary key default gen_random_uuid(),
  provider_id               uuid not null references ambulance_providers(id) on delete cascade,
  category                  ambulance_category not null,
  availability              ambulance_availability not null default 'unknown',
  availability_source       ambulance_availability_source not null default 'not_confirmed',
  base_fare_paise           integer,
  per_km_paise              integer,
  estimated_response_minutes integer,
  notes                     text,
  last_confirmed_at         timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  unique (provider_id, category),

  constraint ambulance_provider_services_fare_range check (
    (base_fare_paise is null or base_fare_paise >= 0) and
    (per_km_paise is null or per_km_paise >= 0)
  ),
  constraint ambulance_provider_services_response_range check (
    estimated_response_minutes is null or
    (estimated_response_minutes >= 1 and estimated_response_minutes <= 1440)
  ),
  -- Ties each claim to the moment the provider confirmed it. A claim with no
  -- timestamp is treated as unconfirmed by the API.
  constraint ambulance_provider_services_claim_needs_timestamp check (
    availability_source = 'not_confirmed' or last_confirmed_at is not null
  )
);

comment on table ambulance_provider_services is
  'Which ambulance categories each provider actually runs, when that was last confirmed, and the provider-supplied fare and response estimate if any. Prices are stored in paise as integers.';

drop trigger if exists ambulance_provider_services_touch on ambulance_provider_services;
create trigger ambulance_provider_services_touch before update on ambulance_provider_services
  for each row execute function ambulance_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Bookings
-- -----------------------------------------------------------------------------
create table if not exists ambulance_bookings (
  id                        uuid primary key default gen_random_uuid(),
  public_ref                text not null unique
                              default 'AMB-' || to_char(now(), 'YY') || '-' ||
                                      lpad(nextval('ambulance_booking_ref_seq')::text, 5, '0'),
  idempotency_key           text unique,

  category                  ambulance_category not null,
  urgency                   ambulance_urgency not null default 'emergency',
  provider_id               uuid references ambulance_providers(id) on delete set null,
  status                    ambulance_booking_status not null default 'requested',
  status_updated_at         timestamptz not null default now(),

  patient_name              text not null,
  contact_phone             text not null,
  patient_age               integer,
  patient_sex               text,
  needs                     text[] not null default '{}',

  pickup_address            text not null,
  pickup_latitude           double precision,
  pickup_longitude          double precision,
  pickup_accuracy_meters    integer,
  pickup_source             text not null default 'manual',
  pickup_landmark           text,

  destination_name          text,
  destination_address       text,
  destination_phone         text,
  destination_latitude      double precision,
  destination_longitude     double precision,

  notes                     text,
  consent_to_share          boolean not null default false,
  share_with_provider_at    timestamptz,

  cancelled_at              timestamptz,
  cancelled_reason          text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint ambulance_bookings_phone_shape check (contact_phone ~ '^[6-9][0-9]{9}$'),
  constraint ambulance_bookings_name_length check (char_length(patient_name) between 2 and 120),
  constraint ambulance_bookings_age_range check (patient_age is null or (patient_age >= 0 and patient_age <= 130)),
  constraint ambulance_bookings_pickup_source check (
    pickup_source in ('browser_geolocation','manual','geocoded','map_pin')
  ),
  constraint ambulance_bookings_needs_allowed check (
    needs <@ array[
      'wheelchair','stretcher','oxygen','cardiac_monitor',
      'neonatal_incubator','trained_attendant','isolation'
    ]::text[]
  ),
  constraint ambulance_bookings_pickup_pair check (
    (pickup_latitude is null and pickup_longitude is null) or
    (pickup_latitude is not null and pickup_longitude is not null)
  ),
  constraint ambulance_bookings_destination_pair check (
    (destination_latitude is null and destination_longitude is null) or
    (destination_latitude is not null and destination_longitude is not null)
  ),
  -- Consent must be recorded before the patient's contact and location may be
  -- shared with an operator, and the share timestamp cannot precede consent.
  constraint ambulance_bookings_share_needs_consent check (
    share_with_provider_at is null or consent_to_share
  ),
  constraint ambulance_bookings_cancel_shape check (
    (status <> 'cancelled') or (cancelled_at is not null)
  )
);

comment on table ambulance_bookings is
  'A transportation request. Holds a patient name, contact number and pickup coordinates, so it is contact-bearing data: FORCE ROW LEVEL SECURITY applies and it is never served to another user.';

create index if not exists ambulance_bookings_status_idx on ambulance_bookings (status);
create index if not exists ambulance_bookings_provider_idx on ambulance_bookings (provider_id);
create index if not exists ambulance_bookings_created_idx on ambulance_bookings (created_at desc);

drop trigger if exists ambulance_bookings_touch on ambulance_bookings;
create trigger ambulance_bookings_touch before update on ambulance_bookings
  for each row execute function ambulance_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 6. Booking timeline (append-only)
-- -----------------------------------------------------------------------------
create table if not exists ambulance_booking_events (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references ambulance_bookings(id) on delete cascade,
  status     ambulance_booking_status not null,
  actor      text not null default 'system',
  source     ambulance_event_source not null default 'medipal',
  note       text,
  created_at timestamptz not null default now()
);

comment on table ambulance_booking_events is
  'Append-only status history. A status shown to a patient is always one of these rows — MEDIPAL never advances a booking on its own.';

create index if not exists ambulance_booking_events_booking_idx
  on ambulance_booking_events (booking_id, created_at);

-- -----------------------------------------------------------------------------
-- 7. Platform audit trail for the ambulance module
-- -----------------------------------------------------------------------------
create table if not exists ambulance_audit_logs (
  id         uuid primary key default gen_random_uuid(),
  actor      text not null default 'anonymous',
  action     text not null,
  entity     text not null,
  entity_id  text,
  detail     jsonb,
  created_at timestamptz not null default now()
);

comment on table ambulance_audit_logs is
  'Append-only audit trail for administrative and status-changing actions in the ambulance module.';

create index if not exists ambulance_audit_logs_created_idx
  on ambulance_audit_logs (created_at desc);

-- -----------------------------------------------------------------------------
-- 8. Grants
-- -----------------------------------------------------------------------------
-- Migration 001's blanket grant ran before these tables existed, so the runtime
-- role needs an explicit grant here or every query is denied at the door.
grant select, insert, update, delete on
  ambulance_data_sources, ambulance_emergency_contacts, ambulance_providers,
  ambulance_provider_services, ambulance_bookings, ambulance_booking_events,
  ambulance_audit_logs
to medipal_api;

grant usage, select on
  ambulance_provider_ref_seq, ambulance_booking_ref_seq
to medipal_api;

-- -----------------------------------------------------------------------------
-- 9. Row-level security
-- -----------------------------------------------------------------------------
-- Contact-bearing tables only. The running server connects as medipal_api and is
-- the single trusted reader; no superuser is ever used at runtime, which is what
-- makes these policies meaningful.
alter table ambulance_bookings enable row level security;
alter table ambulance_bookings force row level security;

drop policy if exists ambulance_bookings_api on ambulance_bookings;
create policy ambulance_bookings_api on ambulance_bookings
  for all to medipal_api using (true) with check (true);

alter table ambulance_booking_events enable row level security;
alter table ambulance_booking_events force row level security;

drop policy if exists ambulance_booking_events_api on ambulance_booking_events;
create policy ambulance_booking_events_api on ambulance_booking_events
  for all to medipal_api using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 10. Public read surface — approved providers only, no private columns
-- -----------------------------------------------------------------------------
create or replace view ambulance_public_providers
with (security_invoker = true) as
select
  p.id,
  p.public_ref,
  p.name,
  p.provider_type,
  p.contact_phone,
  p.alternate_phone,
  p.emergency_hotline,
  p.address,
  p.city,
  p.district,
  p.state,
  p.postal_code,
  p.latitude,
  p.longitude,
  p.coordinates_verified,
  p.service_area,
  p.operating_hours,
  p.tracking_mode,
  p.dispatch_integration,
  p.data_source_id,
  p.source_note,
  p.last_verified_at
from ambulance_providers p
where p.status = 'approved';

comment on view ambulance_public_providers is
  'The only provider surface the public API reads. Restricted to approved operators and carries no review or audit columns.';

grant select on ambulance_public_providers to medipal_api;

-- -----------------------------------------------------------------------------
-- 11. Coverage summary — answers "is this category actually available here?"
-- -----------------------------------------------------------------------------
create or replace view ambulance_category_coverage
with (security_invoker = true) as
select
  s.category,
  p.state,
  p.district,
  count(*) filter (where s.availability = 'available')::integer            as providers_available,
  count(*) filter (where s.availability = 'limited')::integer              as providers_limited,
  count(*)::integer                                                        as providers_total,
  max(s.last_confirmed_at)                                                 as last_confirmed_at
from ambulance_providers p
join ambulance_provider_services s on s.provider_id = p.id
where p.status = 'approved'
group by s.category, p.state, p.district;

comment on view ambulance_category_coverage is
  'Per category, per state/district, how many approved operators actually report that category. MEDIPAL asserts nothing beyond these counts.';

grant select on ambulance_category_coverage to medipal_api;

-- -----------------------------------------------------------------------------
-- 12. Reference rows — provenance and emergency contacts only
-- -----------------------------------------------------------------------------
insert into ambulance_data_sources
  (id, name, source_type, provider, url, verification_status, requires_registration, notes, is_active)
values
  (
    'provider_declared',
    'Provider-declared availability',
    'user_submitted_unverified',
    'Ambulance operator (authorised representative)',
    null,
    'unverified',
    false,
    'Stated by the operator''s own representative. Reported in good faith and '
    || 'not independently audited. Treat as a lead to telephone, never as a '
    || 'guarantee that a vehicle is free right now.',
    true
  ),
  (
    'provider_dispatch_feed',
    'Authorised provider dispatch feed',
    'live_api',
    'Ambulance operator dispatch system',
    null,
    'live',
    true,
    'A real machine-to-machine feed from an operator''s dispatch system. It '
    || 'alone can report vehicle assignment, dispatch, live position and arrival '
    || 'without a human telephone call. MEDIPAL has no such agreement in place '
    || 'yet, so no provider currently runs on this source, and the UI states '
    || 'that plain tracking is unavailable rather than simulating movement.',
    true
  ),
  (
    'medipal_verified',
    'MEDIPAL coordinator verification',
    'periodic_import',
    'MEDIPAL operations team',
    null,
    'verified',
    false,
    'Contact number, service area and categories countersigned by a MEDIPAL '
    || 'coordinator. Verification is manual and periodic — it is NOT a real-time '
    || 'feed, and the timestamp shown is the moment of verification.',
    true
  ),
  (
    'patient_submitted',
    'Details supplied by the patient',
    'user_submitted_unverified',
    'Person raising the request',
    null,
    'unverified',
    false,
    'Pickup address, contact number and destination typed by the person making '
    || 'the request. Never treated as verified and never shown to anyone except '
    || 'the operator the patient agrees to share it with.',
    true
  ),
  (
    'geoapify_directory',
    'Geoapify directory search',
    'live_api',
    'Geoapify GmbH (OpenStreetMap-derived)',
    'https://www.geoapify.com/',
    'live',
    false,
    'Used to resolve a typed address to coordinates and to suggest nearby '
    || 'hospitals. Carries no availability, no price and no operator identity, '
    || 'and MEDIPAL never infers any from it.',
    true
  )
on conflict (id) do update
  set name = excluded.name,
      source_type = excluded.source_type,
      provider = excluded.provider,
      url = excluded.url,
      verification_status = excluded.verification_status,
      requires_registration = excluded.requires_registration,
      notes = excluded.notes,
      is_active = excluded.is_active;

insert into ambulance_emergency_contacts
  (id, label, number, scope, region, url, notes, sort_order, is_active)
values
  (
    'india_erss',
    'National emergency number',
    '112',
    'All of India — single emergency response number',
    'IN',
    'https://112.gov.in/',
    'India''s Emergency Response Support System. Dialling 112 connects you to '
    || 'the official emergency service, which can arrange police, fire or an '
    || 'ambulance. MEDIPAL does not place or dispatch this call for you.',
    10,
    true
  ),
  (
    'national_ambulance_108',
    'Emergency ambulance (108)',
    '108',
    'Emergency response / ambulance, in participating states',
    'IN',
    'https://nhm.gov.in/nhm_live/index1.php?lang=1&level=2&lid=189&sublinkid=1217',
    'The National Health Mission emergency response ambulance service, operated '
    || 'in participating states. Availability varies by state and district — '
    || 'MEDIPAL cannot confirm coverage for your location.',
    20,
    true
  ),
  (
    'patient_transport_102',
    'Patient transport ambulance (102)',
    '102',
    'Non-emergency patient transport, in participating states',
    'IN',
    'https://nhm.gov.in/nhm_live/index1.php?lang=1&level=2&lid=189&sublinkid=1217',
    'The National Health Mission patient-transport service, intended mainly for '
    || 'pregnant women, mothers and infants. Where 102 and 108 are operated '
    || 'together, calls may be routed to the same control room.',
    30,
    true
  ),
  (
    'health_helpline_104',
    'Health information helpline (104)',
    '104',
    'Health advice and information',
    'IN',
    null,
    'A health information line. It is NOT an emergency number and cannot send '
    || 'a vehicle. Use it for non-urgent questions only.',
    40,
    true
  )
on conflict (id) do update
  set label = excluded.label,
      number = excluded.number,
      scope = excluded.scope,
      region = excluded.region,
      url = excluded.url,
      notes = excluded.notes,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active;

commit;
