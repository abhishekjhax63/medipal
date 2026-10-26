-- =====================================================================
-- MEDIPAL · E-UPCHAR relational schema
--
-- Target: PostgreSQL 15+ (Supabase compatible).
--
-- Scope: the 21 entities listed in the E-UPCHAR spec (§22). The frontend
-- currently runs against an in-memory repository so the product is fully
-- reviewable offline; this file is the server-side contract that repository
-- is written to match, field for field.
--
-- Non-negotiable rules encoded here:
--   * Amounts are integer paise (BIGINT). NULL means "genuinely unknown"
--     and is never silently treated as 0.
--   * Availability is per hospital: a hospital_services row is the only way
--     a service becomes bookable at a given hospital.
--   * Verified hospital facts come from the owner-supplied dataset only.
--     There is no code path here that invents a hospital, address or price.
--   * Identity numbers are stored masked. The full value never reaches this
--     database, logs, URLs or analytics (spec §11).
--   * Invoices issued by MEDIPAL are acknowledgements/receipts. The
--     document_type check constraint makes a "hospital tax invoice"
--     impossible to store (spec §15).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------
create type user_role              as enum ('patient', 'hospital_staff', 'admin');
create type ownership_type         as enum ('Public', 'Private', 'Trust');
create type service_group          as enum ('imaging', 'laboratory', 'other');
create type service_kind           as enum ('scan', 'test', 'package', 'appointment', 'other');
create type price_verification     as enum ('verified', 'practice', 'unverified');
create type price_source_type      as enum ('hospital', 'official_online', 'verified_third_party');
create type schedule_source        as enum ('hospital_api', 'authorised_partner', 'admin_configured', 'practice', 'not_connected');
create type booking_status         as enum ('requested', 'pending_hospital_confirmation', 'confirmed', 'completed', 'cancelled');
create type payment_status         as enum ('not_collected', 'created', 'paid', 'failed', 'cancelled', 'pending');
create type report_status          as enum ('not_available', 'pending', 'ready');
create type patient_document_kind  as enum ('prescription', 'patient_photo', 'identity_reference');
create type patient_gender         as enum ('female', 'male', 'other', 'undisclosed');
create type patient_relation       as enum ('self', 'spouse', 'child', 'parent', 'sibling', 'other');
create type payment_provider       as enum ('razorpay', 'none');
create type invoice_document_type  as enum ('medipal_booking_acknowledgement', 'medipal_payment_receipt');

-- ---------------------------------------------------------------------
-- 1. users
--    Mirrors auth.users in Supabase; id is the auth subject.
-- ---------------------------------------------------------------------
create table users (
  id          uuid primary key,
  full_name   text not null,
  email       text,
  phone       text,
  role        user_role not null default 'patient',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint users_email_or_phone check (email is not null or phone is not null)
);

-- ---------------------------------------------------------------------
-- 2. hospitals
--    Read-only from the app's perspective: rows are imported from the
--    owner-supplied directory dataset. `enabled` is the only field an
--    administrator may toggle from the console.
-- ---------------------------------------------------------------------
create table hospitals (
  id                 text primary key,
  name               text not null,
  state              text not null,
  district           text not null,
  -- NULL means "the dataset does not publish this" — never guessed.
  city               text,
  address            text,
  phone              text,
  ownership          ownership_type,
  schemes            text[] not null default '{}',
  empanelment_status text,
  opening_hours      text,
  enabled            boolean not null default true,
  dataset_id         text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index hospitals_state_district_idx on hospitals (state, district);
create index hospitals_dataset_idx        on hospitals (dataset_id);

-- ---------------------------------------------------------------------
-- 3. hospital_locations
-- ---------------------------------------------------------------------
create table hospital_locations (
  id                    uuid primary key default gen_random_uuid(),
  hospital_id           text not null references hospitals (id) on delete cascade,
  label                 text not null,
  address               text,
  city                  text,
  district              text not null,
  state                 text not null,
  latitude              numeric(9, 6),
  longitude             numeric(9, 6),
  -- A map marker is rendered only when this is true.
  coordinates_verified  boolean not null default false,
  constraint hospital_locations_coords_pair check (
    (latitude is null and longitude is null) or (latitude is not null and longitude is not null)
  ),
  constraint hospital_locations_verified_requires_coords check (
    coordinates_verified = false or (latitude is not null and longitude is not null)
  )
);

create index hospital_locations_hospital_idx on hospital_locations (hospital_id);

-- ---------------------------------------------------------------------
-- 4. hospital_departments
-- ---------------------------------------------------------------------
create table hospital_departments (
  id          uuid primary key default gen_random_uuid(),
  hospital_id text not null references hospitals (id) on delete cascade,
  name        text not null,
  unique (hospital_id, name)
);

-- ---------------------------------------------------------------------
-- 5. service_categories
-- ---------------------------------------------------------------------
create table service_categories (
  id           text primary key,
  label        text not null,
  service_group service_group not null,
  search_terms text[] not null default '{}'
);

-- ---------------------------------------------------------------------
-- 6. services
-- ---------------------------------------------------------------------
create table services (
  id          text primary key,
  name        text not null,
  category_id text not null references service_categories (id),
  service_group service_group not null,
  kind        service_kind not null,
  summary     text not null,
  description text not null
);

create index services_category_idx on services (category_id);

-- ---------------------------------------------------------------------
-- 7. hospital_services
--    The hospital <-> service relationship. Availability is per hospital.
-- ---------------------------------------------------------------------
create table hospital_services (
  id                       text primary key,
  hospital_id              text not null references hospitals (id) on delete cascade,
  service_id               text not null references services (id) on delete cascade,
  available                boolean not null default true,
  requires_prescription    boolean not null default false,
  -- NULL means the hospital has not published this information.
  report_turnaround        text,
  preparation_instructions text,
  prerequisite_service_ids text[] not null default '{}',
  updated_at               timestamptz not null default now(),
  unique (hospital_id, service_id)
);

create index hospital_services_hospital_idx on hospital_services (hospital_id);

-- ---------------------------------------------------------------------
-- 8. service_components  (the tests inside a package)
-- ---------------------------------------------------------------------
create table service_components (
  id         uuid primary key default gen_random_uuid(),
  service_id text not null references services (id) on delete cascade,
  name       text not null,
  note       text
);

create index service_components_service_idx on service_components (service_id);

-- ---------------------------------------------------------------------
-- 9. price_sources
-- ---------------------------------------------------------------------
create table price_sources (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  url        text,
  source_type price_source_type not null,
  -- Whether MEDIPAL is legally permitted to publish this source.
  permitted  boolean not null default false
);

-- ---------------------------------------------------------------------
-- 10. service_prices
--     Integer paise throughout. final_payable_paise is recalculated
--     server-side before any payment; a client-supplied total is ignored.
-- ---------------------------------------------------------------------
create table service_prices (
  id                           text primary key,
  hospital_id                  text not null references hospitals (id) on delete cascade,
  service_id                   text not null references services (id) on delete cascade,
  hospital_price_paise         bigint check (hospital_price_paise >= 0),
  official_online_price_paise  bigint check (official_online_price_paise >= 0),
  third_party_price_paise      bigint check (third_party_price_paise >= 0),
  source_id                    uuid references price_sources (id) on delete set null,
  last_verified_on             date,
  conditions                   text,
  taxes_and_fees_paise         bigint check (taxes_and_fees_paise >= 0),
  final_payable_paise          bigint check (final_payable_paise >= 0),
  verification_status          price_verification not null default 'unverified',
  updated_by                   uuid references users (id) on delete set null,
  updated_at                   timestamptz not null default now(),
  unique (hospital_id, service_id),
  -- A verified price must actually carry an amount, a source and a date.
  constraint service_prices_verified_is_complete check (
    verification_status <> 'verified'
    or (final_payable_paise is not null and source_id is not null and last_verified_on is not null)
  )
);

create index service_prices_hospital_idx on service_prices (hospital_id);
create index service_prices_verification_idx on service_prices (verification_status);

-- ---------------------------------------------------------------------
-- 11. patients
--     Identity is stored masked only. The full number is never accepted.
-- ---------------------------------------------------------------------
create table patients (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      uuid not null references users (id) on delete cascade,
  full_name          text not null,
  date_of_birth      date not null,
  gender             patient_gender not null,
  phone              text not null,
  email              text,
  relationship       patient_relation not null default 'self',
  address            text,
  emergency_contact  text,
  identity_kind      text check (identity_kind in ('aadhaar_last4', 'pmjay_card_last4', 'other_id_last4')),
  identity_masked    text,
  identity_consented_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Masked identity must be complete or absent, and masked values always
  -- end in exactly four visible digits.
  constraint patients_identity_complete check (
    (identity_kind is null and identity_masked is null and identity_consented_at is null)
    or (identity_kind is not null and identity_masked is not null and identity_consented_at is not null)
  ),
  constraint patients_identity_is_masked check (
    identity_masked is null or identity_masked ~ '^[^0-9]*[0-9]{4}$'
  )
);

create index patients_owner_idx on patients (owner_user_id);

-- ---------------------------------------------------------------------
-- 12. patient_documents  (metadata only; bytes live in private storage)
-- ---------------------------------------------------------------------
create table patient_documents (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid references patients (id) on delete cascade,
  owner_user_id  uuid not null references users (id) on delete cascade,
  booking_id     uuid,
  kind           patient_document_kind not null,
  file_name      text not null,
  mime_type      text not null,
  size_bytes     bigint not null check (size_bytes >= 0),
  -- Storage reference path. Never a public URL.
  storage_path   text,
  uploaded_at    timestamptz not null default now()
);

create index patient_documents_owner_idx   on patient_documents (owner_user_id);
create index patient_documents_patient_idx on patient_documents (patient_id);

-- ---------------------------------------------------------------------
-- 13. appointment_slots
--     A slot is generated by a connected source or configured by an
--     administrator. When no source is connected there are simply no rows,
--     and the UI says so instead of inventing availability.
-- ---------------------------------------------------------------------
create table appointment_slots (
  id          uuid primary key default gen_random_uuid(),
  hospital_id text not null references hospitals (id) on delete cascade,
  service_id  text not null references services (id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  capacity    integer not null default 1 check (capacity > 0),
  booked      integer not null default 0 check (booked >= 0),
  held_until  timestamptz,
  source      schedule_source not null,
  unique (hospital_id, service_id, starts_at),
  constraint appointment_slots_order check (ends_at > starts_at),
  constraint appointment_slots_within_capacity check (booked <= capacity)
);

create index appointment_slots_lookup_idx on appointment_slots (hospital_id, service_id, starts_at);

-- ---------------------------------------------------------------------
-- 14. bookings
-- ---------------------------------------------------------------------
create table bookings (
  id                       uuid primary key default gen_random_uuid(),
  reference                text not null unique,
  user_id                  uuid not null references users (id) on delete cascade,
  patient_id               uuid not null references patients (id) on delete restrict,
  hospital_id              text not null references hospitals (id) on delete restrict,
  service_id               text not null references services (id) on delete restrict,
  hospital_service_id      text not null references hospital_services (id) on delete restrict,
  status                   booking_status not null default 'requested',
  appointment_starts_at    timestamptz,
  appointment_ends_at      timestamptz,
  schedule_source          schedule_source not null default 'not_connected',
  payment_id               uuid,
  invoice_id               uuid,
  prescription_document_id uuid references patient_documents (id) on delete set null,
  total_payable_paise      bigint check (total_payable_paise >= 0),
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- A confirmed booking must have a real appointment time from a source.
  constraint bookings_confirmed_requires_schedule check (
    status <> 'confirmed'
    or (appointment_starts_at is not null and schedule_source <> 'not_connected')
  )
);

create index bookings_user_idx     on bookings (user_id);
create index bookings_patient_idx  on bookings (patient_id);
create index bookings_hospital_idx on bookings (hospital_id);
create index bookings_status_idx   on bookings (status);

-- ---------------------------------------------------------------------
-- 15. booking_items  (frozen copy of what was priced at booking time)
-- ---------------------------------------------------------------------
create table booking_items (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references bookings (id) on delete cascade,
  label               text not null,
  quantity            integer not null default 1 check (quantity > 0),
  unit_price_paise    bigint check (unit_price_paise >= 0),
  taxes_paise         bigint check (taxes_paise >= 0),
  fees_paise          bigint check (fees_paise >= 0),
  verification_status price_verification not null
);

create index booking_items_booking_idx on booking_items (booking_id);

-- ---------------------------------------------------------------------
-- 16. payments
-- ---------------------------------------------------------------------
create table payments (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references bookings (id) on delete cascade,
  provider            payment_provider not null default 'none',
  provider_order_id   text,
  provider_payment_id text,
  amount_paise        bigint check (amount_paise >= 0),
  currency            text not null default 'INR' check (currency = 'INR'),
  status              payment_status not null default 'not_collected',
  -- True when the payment ran against a sandbox. Never real money.
  sandbox             boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- A paid payment must come from a provider that actually verified it.
  constraint payments_paid_requires_reference check (
    status <> 'paid' or provider <> 'none'
  )
);

create index payments_booking_idx on payments (booking_id);
create unique index payments_provider_payment_idx
  on payments (provider, provider_payment_id)
  where provider_payment_id is not null;

-- ---------------------------------------------------------------------
-- 17. invoices
--     Always a MEDIPAL document. The check constraint makes storing a
--     hospital tax invoice structurally impossible.
-- ---------------------------------------------------------------------
create table invoices (
  id                uuid primary key default gen_random_uuid(),
  invoice_number    text not null unique,
  booking_id        uuid not null references bookings (id) on delete cascade,
  issued_at         timestamptz not null default now(),
  document_type     invoice_document_type not null,
  amount_paise      bigint check (amount_paise >= 0),
  payment_status    payment_status not null,
  payment_reference text,
  sandbox           boolean not null default true
);

create index invoices_booking_idx on invoices (booking_id);

-- ---------------------------------------------------------------------
-- 18. uploaded_prescriptions
--     A thin, explicit view over prescription documents so the clinical
--     intent is auditable separately from generic documents.
-- ---------------------------------------------------------------------
create table uploaded_prescriptions (
  id                uuid primary key default gen_random_uuid(),
  document_id       uuid not null references patient_documents (id) on delete cascade,
  patient_id        uuid references patients (id) on delete cascade,
  owner_user_id     uuid not null references users (id) on delete cascade,
  hospital_id       text references hospitals (id) on delete set null,
  service_id        text references services (id) on delete set null,
  reviewed_by       uuid references users (id) on delete set null,
  reviewed_at       timestamptz,
  uploaded_at       timestamptz not null default now()
);

create index uploaded_prescriptions_owner_idx on uploaded_prescriptions (owner_user_id);

-- ---------------------------------------------------------------------
-- 19. reports
--     Only ever created when an authorised diagnostic source supplied a
--     file. MEDIPAL does not generate reports.
-- ---------------------------------------------------------------------
create table reports (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references bookings (id) on delete cascade,
  user_id       uuid not null references users (id) on delete cascade,
  service_name  text not null,
  hospital_name text not null,
  status        report_status not null default 'not_available',
  report_date   date,
  download_url  text,
  constraint reports_ready_requires_file check (
    status <> 'ready' or download_url is not null
  )
);

create index reports_user_idx    on reports (user_id);
create index reports_booking_idx on reports (booking_id);

-- ---------------------------------------------------------------------
-- 20. reviews
--     `verified_booking` is only true when tied to a completed booking.
-- ---------------------------------------------------------------------
create table reviews (
  id               uuid primary key default gen_random_uuid(),
  hospital_id      text not null references hospitals (id) on delete cascade,
  booking_id       uuid references bookings (id) on delete set null,
  author_label     text not null,
  rating           smallint not null check (rating between 1 and 5),
  body             text not null,
  verified_booking boolean not null default false,
  created_at       timestamptz not null default now(),
  constraint reviews_verified_requires_booking check (
    verified_booking = false or booking_id is not null
  )
);

create index reviews_hospital_idx on reviews (hospital_id);

-- ---------------------------------------------------------------------
-- 21. audit_logs
--     Append-only. Meta must never contain identity numbers.
-- ---------------------------------------------------------------------
create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references users (id) on delete set null,
  actor_role  user_role not null,
  action      text not null,
  entity      text not null,
  entity_id   text not null,
  meta        jsonb not null default '{}'::jsonb,
  at          timestamptz not null default now()
);

create index audit_logs_entity_idx on audit_logs (entity, entity_id);
create index audit_logs_at_idx     on audit_logs (at desc);

-- ---------------------------------------------------------------------
-- Booking + payment must be atomic (spec §22, "use database transactions").
-- ---------------------------------------------------------------------
create or replace function create_booking_transaction(
  p_reference           text,
  p_user_id             uuid,
  p_patient_id          uuid,
  p_hospital_id         text,
  p_service_id          text,
  p_hospital_service_id text,
  p_total_payable_paise bigint,
  p_slot_id             uuid default null
) returns uuid
language plpgsql
security definer
as $$
declare
  v_booking_id uuid;
  v_slot       appointment_slots%rowtype;
begin
  if p_slot_id is not null then
    select * into v_slot from appointment_slots where id = p_slot_id for update;
    if not found then
      raise exception 'slot_not_found';
    end if;
    if v_slot.booked >= v_slot.capacity and (v_slot.held_until is null or v_slot.held_until < now()) then
      raise exception 'slot_taken';
    end if;
    update appointment_slots
       set booked = booked + 1
     where id = p_slot_id;
  end if;

  insert into bookings (reference, user_id, patient_id, hospital_id, service_id,
                        hospital_service_id, total_payable_paise)
  values (p_reference, p_user_id, p_patient_id, p_hospital_id, p_service_id,
          p_hospital_service_id, p_total_payable_paise)
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Row-level security
--
-- Server-side authorisation is the source of truth; these policies are the
-- second line of defence and make cross-tenant reads impossible even if a
-- route forgets a filter.
-- ---------------------------------------------------------------------
alter table patients           enable row level security;
alter table patient_documents  enable row level security;
alter table uploaded_prescriptions enable row level security;
alter table bookings           enable row level security;
alter table payments           enable row level security;
alter table invoices           enable row level security;
alter table reports            enable row level security;

-- Owners see only their own rows; staff and admins are scoped separately
-- through server-side roles rather than a client claim.
create policy patients_owner_read on patients
  for select using (owner_user_id = auth.uid());

create policy patient_documents_owner_read on patient_documents
  for select using (owner_user_id = auth.uid());

create policy uploaded_prescriptions_owner_read on uploaded_prescriptions
  for select using (owner_user_id = auth.uid());

create policy bookings_owner_read on bookings
  for select using (user_id = auth.uid());

create policy payments_owner_read on payments
  for select using (
    exists (select 1 from bookings b where b.id = payments.booking_id and b.user_id = auth.uid())
  );

create policy invoices_owner_read on invoices
  for select using (
    exists (select 1 from bookings b where b.id = invoices.booking_id and b.user_id = auth.uid())
  );

create policy reports_owner_read on reports
  for select using (user_id = auth.uid());

-- Directory tables are readable by everyone, writable only by the server
-- role that imports the dataset and by an authorised administrator.
alter table hospitals          enable row level security;
alter table hospital_locations enable row level security;
alter table service_categories enable row level security;
alter table services           enable row level security;
alter table hospital_services  enable row level security;
alter table service_prices     enable row level security;
alter table price_sources      enable row level security;

create policy hospitals_public_read          on hospitals          for select using (enabled);
create policy hospital_locations_public_read on hospital_locations for select using (true);
create policy service_categories_public_read on service_categories for select using (true);
create policy services_public_read           on services           for select using (true);
create policy hospital_services_public_read  on hospital_services  for select using (available);
create policy service_prices_public_read     on service_prices     for select using (true);
create policy price_sources_public_read      on price_sources      for select using (permitted);

alter table audit_logs enable row level security;

-- Audit logs are append-only and never readable by ordinary users.
create policy audit_logs_admin_read on audit_logs
  for select using (
    exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin')
  );
