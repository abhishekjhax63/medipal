-- =============================================================================
-- MEDIPAL · E-UPCHAR core records
-- =============================================================================
-- No hospitals, catalogue rows, prices, slots, users or bookings are seeded.
-- A blank database must remain blank until an authorised importer/admin adds
-- verified source data. This migration creates only the persistent, constrained
-- surfaces used by server/eupchar.mjs.

begin;

create extension if not exists pgcrypto;

create table if not exists eupchar_users (
  id          uuid primary key,
  full_name   text not null,
  email       text,
  phone       text,
  role        text not null default 'patient' check (role in ('patient','hospital_staff','admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint eupchar_users_contact check (email is not null or phone is not null)
);

create table if not exists eupchar_hospitals (
  id               text primary key,
  name             text not null,
  state            text not null,
  district         text not null,
  city             text,
  address          text,
  phone            text,
  ownership        text check (ownership in ('Public','Private','Trust')),
  schemes          text[] not null default '{}',
  empanelment_status text,
  opening_hours    text,
  enabled          boolean not null default true,
  dataset_id       text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists eupchar_hospitals_location_idx on eupchar_hospitals (state, district);

create table if not exists eupchar_services (
  id             text primary key,
  name           text not null,
  category_id    text not null,
  service_group  text not null check (service_group in ('imaging','laboratory','other')),
  kind           text not null check (kind in ('scan','test','package','appointment','other')),
  summary        text not null,
  description    text not null,
  created_at     timestamptz not null default now()
);

create table if not exists eupchar_hospital_services (
  id                       uuid primary key default gen_random_uuid(),
  hospital_id              text not null references eupchar_hospitals(id) on delete cascade,
  service_id               text not null references eupchar_services(id) on delete cascade,
  available                boolean not null default true,
  booking_enabled          boolean not null default false,
  requires_prescription    boolean not null default false,
  report_turnaround        text,
  preparation_instructions text,
  prerequisite_service_ids text[] not null default '{}',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (hospital_id, service_id)
);
create index if not exists eupchar_hospital_services_lookup_idx on eupchar_hospital_services (hospital_id, service_id);

create table if not exists eupchar_price_sources (
  id          text primary key,
  name        text not null,
  url         text,
  permitted   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists eupchar_service_prices (
  id                    uuid primary key default gen_random_uuid(),
  hospital_id           text not null references eupchar_hospitals(id) on delete cascade,
  service_id            text not null references eupchar_services(id) on delete cascade,
  final_payable_paise   bigint check (final_payable_paise >= 0),
  taxes_and_fees_paise  bigint check (taxes_and_fees_paise >= 0),
  source_id             text references eupchar_price_sources(id) on delete set null,
  last_verified_on      date,
  conditions            text,
  verification_status   text not null default 'unverified' check (verification_status in ('verified','unverified')),
  updated_at            timestamptz not null default now(),
  unique (hospital_id, service_id),
  constraint eupchar_verified_price_complete check (
    verification_status <> 'verified' or (final_payable_paise is not null and source_id is not null and last_verified_on is not null)
  )
);

create table if not exists eupchar_patients (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid not null references eupchar_users(id) on delete cascade,
  full_name             text not null check (char_length(full_name) between 2 and 120),
  date_of_birth         date not null check (date_of_birth <= current_date),
  gender                text not null check (gender in ('female','male','other','undisclosed')),
  phone                 text not null check (phone ~ '^[6-9][0-9]{9}$'),
  email                 text,
  relationship          text not null default 'self' check (relationship in ('self','spouse','child','parent','sibling','other')),
  address               text,
  emergency_contact     text,
  identity_kind         text check (identity_kind in ('aadhaar_last4','pmjay_card_last4','other_id_last4')),
  identity_masked       text,
  identity_consented_at timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint eupchar_identity_complete check (
    (identity_kind is null and identity_masked is null and identity_consented_at is null)
    or (identity_kind is not null and identity_masked is not null and identity_consented_at is not null)
  ),
  constraint eupchar_identity_masked check (identity_masked is null or identity_masked ~ '^[^0-9]*[0-9]{4}$')
);
create index if not exists eupchar_patients_owner_idx on eupchar_patients (owner_user_id);

create table if not exists eupchar_appointment_slots (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   text not null references eupchar_hospitals(id) on delete cascade,
  service_id    text not null references eupchar_services(id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  capacity      integer not null default 1 check (capacity > 0),
  booked        integer not null default 0 check (booked >= 0 and booked <= capacity),
  source        text not null check (source in ('hospital_api','authorised_partner','admin_configured')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (hospital_id, service_id, starts_at),
  constraint eupchar_slot_time_order check (ends_at > starts_at)
);
create index if not exists eupchar_slots_lookup_idx on eupchar_appointment_slots (hospital_id, service_id, starts_at);

create table if not exists eupchar_bookings (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null unique,
  user_id               uuid not null references eupchar_users(id) on delete cascade,
  patient_id            uuid not null references eupchar_patients(id) on delete restrict,
  hospital_id           text not null references eupchar_hospitals(id) on delete restrict,
  service_id            text not null references eupchar_services(id) on delete restrict,
  hospital_service_id   uuid not null references eupchar_hospital_services(id) on delete restrict,
  status                text not null default 'requested' check (status in ('requested','pending_hospital_confirmation','confirmed','completed','cancelled')),
  appointment_starts_at timestamptz,
  appointment_ends_at   timestamptz,
  schedule_source       text not null default 'not_connected' check (schedule_source in ('hospital_api','authorised_partner','admin_configured','not_connected')),
  payment_id            uuid,
  invoice_id            uuid,
  prescription_document_id uuid,
  total_payable_paise   bigint check (total_payable_paise >= 0),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint eupchar_confirmed_has_schedule check (status <> 'confirmed' or appointment_starts_at is not null)
);
create index if not exists eupchar_bookings_user_idx on eupchar_bookings (user_id, created_at desc);
alter table eupchar_bookings add column if not exists idempotency_key text;
create unique index if not exists eupchar_bookings_idempotency_key_idx
  on eupchar_bookings (idempotency_key) where idempotency_key is not null;

create table if not exists eupchar_payments (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null unique references eupchar_bookings(id) on delete cascade,
  provider            text not null check (provider in ('razorpay','none')),
  provider_order_id   text,
  provider_payment_id text,
  amount_paise        bigint check (amount_paise >= 0),
  status              text not null check (status in ('not_collected','created','paid','failed','cancelled','pending')),
  sandbox             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint eupchar_paid_requires_provider_reference check (status <> 'paid' or (provider = 'razorpay' and provider_payment_id is not null))
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'eupchar_bookings_payment_fk') then
    alter table eupchar_bookings add constraint eupchar_bookings_payment_fk foreign key (payment_id) references eupchar_payments(id) on delete set null;
  end if;
end
$$;

create table if not exists eupchar_invoices (
  id                uuid primary key default gen_random_uuid(),
  invoice_number    text not null unique,
  booking_id        uuid not null unique references eupchar_bookings(id) on delete cascade,
  document_type     text not null check (document_type in ('medipal_booking_acknowledgement','medipal_payment_receipt')),
  amount_paise      bigint check (amount_paise >= 0),
  payment_status    text not null check (payment_status in ('not_collected','created','paid','failed','cancelled','pending')),
  payment_reference text,
  sandbox           boolean not null default false,
  issued_at         timestamptz not null default now()
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'eupchar_bookings_invoice_fk') then
    alter table eupchar_bookings add constraint eupchar_bookings_invoice_fk foreign key (invoice_id) references eupchar_invoices(id) on delete set null;
  end if;
end
$$;

create table if not exists eupchar_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references eupchar_users(id) on delete set null,
  actor_role  text not null check (actor_role in ('patient','hospital_staff','admin')),
  action      text not null,
  entity      text not null,
  entity_id   text not null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- The only runtime database credential is medipal_api. Browser users never
-- connect to PostgreSQL, while server/eupchar.mjs enforces owner/role checks.
grant select, insert, update, delete on all tables in schema public to medipal_api;
grant usage, select on all sequences in schema public to medipal_api;

commit;
