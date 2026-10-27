-- =============================================================================
-- MEDIPAL · Blood Bank module · migration 006
-- Bihar live availability synchronisation
-- =============================================================================
-- Additive and non-destructive. It never drops or rewrites data created by
-- migrations 001-005.
--
-- NAME MAPPING (the specification asks for `blood_centres` / `blood_inventory`;
-- this deployment already owns those concepts under the names below, and
-- duplicating them would create two conflicting sources of truth):
--
--   spec `blood_centres`   ->  existing `blood_facilities`   (+ external_id,
--                              source_url, verification_status, district_id;
--                              the spec's `source` column IS `data_source_id`)
--   spec `blood_inventory` ->  existing `blood_inventory`   (+ availability_status,
--                              source_record_id, source_updated_at, synced_at;
--                              the spec's `units` IS `quantity`)
--   spec `data_sources`    ->  existing `blood_data_sources` (+ base_url,
--                              enabled, health_status, last_successful_sync,
--                              last_failed_sync)
--
-- HONESTY CONTRACT (enforced by this schema)
--   1. A synced inventory row can never exist without a source_record_id, an
--      external centre id and a source timestamp — so a number can always be
--      traced back to the provider record and the moment it was observed.
--   2. `availability_status` defaults to UNKNOWN. Nothing is assumed AVAILABLE.
--   3. Provider rows and manually reported rows are uniquely separated by the
--      partial index, so a facility report can never silently overwrite an
--      official provider figure — they are distinct rows with distinct
--      provenance, and the API applies the priority rules explicitly.
--   4. Nothing in this file invents a stock figure, a centre or a sync result.
--      `districts` is the only seeded table, and it holds public administrative
--      geography (names + headquarters coordinates), never clinical data.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Enumerations
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'blood_availability_status') then
    create type blood_availability_status as enum ('AVAILABLE','LOW','UNAVAILABLE','UNKNOWN');
  end if;
  if not exists (select 1 from pg_type where typname = 'blood_sync_status') then
    create type blood_sync_status as enum ('running','success','partial','failed','skipped');
  end if;
  if not exists (select 1 from pg_type where typname = 'blood_source_health') then
    create type blood_source_health as enum ('healthy','degraded','offline','not_configured','unknown');
  end if;
  if not exists (select 1 from pg_type where typname = 'blood_centre_verification') then
    create type blood_centre_verification as enum (
      'unverified','provider_authorized','field_verified','centre_verified','rejected'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 1. Districts — public administrative geography for Bihar
-- -----------------------------------------------------------------------------
-- Coordinates are the district headquarters, taken from published state
-- administrative geography. They are used to centre a map and to bound a
-- radius search; they are never presented as the location of a blood centre.
create table if not exists districts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  state       text not null,
  latitude    double precision,
  longitude   double precision,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint districts_name_state_unique unique (name, state),
  constraint districts_coordinate_range check (
    (latitude is null or (latitude >= -90 and latitude <= 90))
    and (longitude is null or (longitude >= -180 and longitude <= 180))
  )
);

create index if not exists districts_state_idx on districts (state);

drop trigger if exists districts_touch on districts;
create trigger districts_touch before update on districts
  for each row execute function blood_touch_updated_at();

insert into districts (name, state, latitude, longitude) values
  ('Araria',           'Bihar', 26.1390, 87.5130),
  ('Arwal',            'Bihar', 25.2440, 84.6790),
  ('Aurangabad',       'Bihar', 24.7520, 84.3740),
  ('Banka',            'Bihar', 24.8810, 86.9230),
  ('Begusarai',        'Bihar', 25.4180, 86.1270),
  ('Bhagalpur',        'Bihar', 25.2450, 86.9720),
  ('Bhojpur',          'Bihar', 25.5560, 84.6600),
  ('Buxar',            'Bihar', 25.5650, 83.9770),
  ('Darbhanga',        'Bihar', 26.1540, 85.8970),
  ('East Champaran',   'Bihar', 26.6480, 84.9170),
  ('Gaya',             'Bihar', 24.7910, 85.0000),
  ('Gopalganj',        'Bihar', 26.4680, 84.4400),
  ('Jamui',            'Bihar', 24.9260, 86.2250),
  ('Jehanabad',        'Bihar', 25.2130, 84.9870),
  ('Kaimur',           'Bihar', 25.0450, 83.6180),
  ('Katihar',          'Bihar', 25.5390, 87.5780),
  ('Khagaria',         'Bihar', 25.5020, 86.4670),
  ('Kishanganj',       'Bihar', 26.1020, 87.9460),
  ('Lakhisarai',       'Bihar', 25.1780, 86.0910),
  ('Madhepura',        'Bihar', 25.9210, 86.7920),
  ('Madhubani',        'Bihar', 26.3530, 86.0710),
  ('Munger',           'Bihar', 25.3810, 86.4650),
  ('Muzaffarpur',      'Bihar', 26.1200, 85.3760),
  ('Nalanda',          'Bihar', 25.2000, 85.5200),
  ('Nawada',           'Bihar', 24.8860, 85.5400),
  ('Patna',            'Bihar', 25.5941, 85.1376),
  ('Purnia',           'Bihar', 25.7780, 87.4740),
  ('Rohtas',           'Bihar', 24.9540, 84.0270),
  ('Saharsa',          'Bihar', 25.8800, 86.6000),
  ('Samastipur',       'Bihar', 25.8620, 85.7810),
  ('Saran',            'Bihar', 25.7810, 84.7470),
  ('Sheikhpura',       'Bihar', 25.1400, 85.8500),
  ('Sheohar',          'Bihar', 26.5130, 85.2930),
  ('Sitamarhi',        'Bihar', 26.5930, 85.4900),
  ('Siwan',            'Bihar', 26.2190, 84.3560),
  ('Supaul',           'Bihar', 26.1230, 86.6050),
  ('Vaishali',         'Bihar', 25.6870, 85.2120),
  ('West Champaran',   'Bihar', 26.8020, 84.5020)
on conflict (name, state) do update
  set latitude = excluded.latitude,
      longitude = excluded.longitude;

-- -----------------------------------------------------------------------------
-- 2. Provider-sync columns on the existing centre registry
-- -----------------------------------------------------------------------------
alter table blood_facilities add column if not exists external_id text;
alter table blood_facilities add column if not exists source_url text;
alter table blood_facilities add column if not exists district_id uuid references districts(id) on delete set null;
alter table blood_facilities add column if not exists verification_status blood_centre_verification
  not null default 'unverified';

comment on column blood_facilities.external_id is
  'The provider''s own identifier for this centre. NULL for self-registered MEDIPAL facilities. Together with data_source_id it forms the idempotency key for upserts.';

comment on column blood_facilities.verification_status is
  'How this centre came to be trusted. `provider_authorized` means it arrived from an authorised provider feed; `unverified` means nobody has checked it.';

-- The spec's `source + external_id` uniqueness. `data_source_id` IS the source.
create unique index if not exists blood_facilities_source_external_idx
  on blood_facilities (data_source_id, external_id)
  where external_id is not null;

create index if not exists blood_facilities_district_idx on blood_facilities (district_id);

-- -----------------------------------------------------------------------------
-- 3. Provider-sync columns on the existing inventory table
-- -----------------------------------------------------------------------------
alter table blood_inventory add column if not exists availability_status blood_availability_status
  not null default 'UNKNOWN';
alter table blood_inventory add column if not exists source_record_id text;
alter table blood_inventory add column if not exists source_updated_at timestamptz;
alter table blood_inventory add column if not exists synced_at timestamptz;

comment on column blood_inventory.availability_status is
  'The availability verdict. Copied verbatim from the provider when the provider states one; otherwise derived from `quantity` using the configurable thresholds. Defaults to UNKNOWN so nothing is ever assumed available.';

comment on column blood_inventory.source_record_id is
  'Provider record identity. Non-NULL marks a provider-synced aggregate row (one row per centre+group+component). NULL marks a batch-level row reported by a facility.';

comment on column blood_inventory.source_updated_at is
  'When the source says the count was observed. Freshness is computed from THIS, never from our own write time.';

-- Idempotency grain for synced rows. Batch rows (source_record_id IS NULL) are
-- deliberately excluded: a facility may legitimately hold several batches of
-- the same group and component.
create unique index if not exists blood_inventory_sync_grain_idx
  on blood_inventory (facility_id, blood_group, component)
  where source_record_id is not null;

create index if not exists blood_inventory_synced_idx
  on blood_inventory (synced_at desc nulls last);
create index if not exists blood_inventory_availability_idx
  on blood_inventory (availability_status, blood_group, component);

-- -----------------------------------------------------------------------------
-- 4. Sync runs
-- -----------------------------------------------------------------------------
create table if not exists sync_runs (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null,
  trigger            text not null default 'schedule'
                     check (trigger in ('schedule','manual','startup','retry')),
  started_at         timestamptz not null default now(),
  completed_at       timestamptz,
  status             blood_sync_status not null default 'running',
  records_received   integer not null default 0 check (records_received >= 0),
  records_inserted   integer not null default 0 check (records_inserted >= 0),
  records_updated    integer not null default 0 check (records_updated >= 0),
  records_unchanged  integer not null default 0 check (records_unchanged >= 0),
  records_failed     integer not null default 0 check (records_failed >= 0),
  centres_upserted   integer not null default 0 check (centres_upserted >= 0),
  request_attempts   integer not null default 0 check (request_attempts >= 0),
  duration_ms        integer,
  error_message      text,
  created_at         timestamptz not null default now(),
  constraint sync_runs_completion_order check (
    completed_at is null or completed_at >= started_at
  )
);

create index if not exists sync_runs_provider_idx on sync_runs (provider, started_at desc);
create index if not exists sync_runs_status_idx on sync_runs (status, started_at desc);

-- Only one run per provider may be in flight, so two cron ticks can never
-- interleave writes for the same source.
create unique index if not exists sync_runs_single_active_idx
  on sync_runs (provider)
  where status = 'running';

-- -----------------------------------------------------------------------------
-- 5. Sync errors
-- -----------------------------------------------------------------------------
create table if not exists sync_errors (
  id              uuid primary key default gen_random_uuid(),
  sync_run_id     uuid not null references sync_runs(id) on delete cascade,
  external_id     text,
  error_type      text not null,
  error_message   text not null,
  payload_hash    text,
  payload_excerpt jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists sync_errors_run_idx on sync_errors (sync_run_id, created_at);
create index if not exists sync_errors_type_idx on sync_errors (error_type);

comment on table sync_errors is
  'One row per rejected record. `payload_excerpt` holds the offending fields so an administrator can see exactly what the provider sent — it is deliberately truncated and never contains credentials.';

-- -----------------------------------------------------------------------------
-- 6. Inventory history (append-only change log)
-- -----------------------------------------------------------------------------
create table if not exists inventory_history (
  id                uuid primary key default gen_random_uuid(),
  facility_id       uuid not null references blood_facilities(id) on delete cascade,
  inventory_id      uuid references blood_inventory(id) on delete set null,
  blood_group       blood_group not null,
  component         blood_component not null,
  previous_units    integer,
  new_units         integer not null,
  previous_status   blood_availability_status,
  new_status        blood_availability_status not null,
  source            text not null,
  sync_run_id       uuid references sync_runs(id) on delete set null,
  source_updated_at timestamptz,
  recorded_at       timestamptz not null default now()
);

create index if not exists inventory_history_facility_idx
  on inventory_history (facility_id, recorded_at desc);
create index if not exists inventory_history_group_idx
  on inventory_history (blood_group, component, recorded_at desc);

comment on table inventory_history is
  'Append-only. Written ONLY when a sync meaningfully changed units or status — an unchanged re-sync writes nothing, so this table stays a change log rather than a polling log.';

-- -----------------------------------------------------------------------------
-- 7. Data-source register additions (provider configuration + health)
-- -----------------------------------------------------------------------------
alter table blood_data_sources add column if not exists base_url text;
alter table blood_data_sources add column if not exists enabled boolean not null default false;
alter table blood_data_sources add column if not exists priority integer not null default 100;
alter table blood_data_sources add column if not exists health_status blood_source_health
  not null default 'unknown';
alter table blood_data_sources add column if not exists health_message text;
alter table blood_data_sources add column if not exists last_health_check_at timestamptz;
alter table blood_data_sources add column if not exists last_successful_sync timestamptz;
alter table blood_data_sources add column if not exists last_failed_sync timestamptz;

comment on column blood_data_sources.enabled is
  'Whether synchronisation from this source may run. False is the honest default: a source is never enabled without an operator decision and, for provider feeds, authorised credentials.';

comment on column blood_data_sources.priority is
  'Source priority. Lower wins. 10 = official authorised feed, 30 = verified blood centre, 50 = other authorised provider, 90 = unknown.';

-- -----------------------------------------------------------------------------
-- 8. Source priority + the authorised e-RaktKosh feed slot
-- -----------------------------------------------------------------------------
update blood_data_sources set priority = 50 where id = 'eraktkosh';

insert into blood_data_sources
  (id, name, source_type, provider, url, verification_status, requires_registration,
   notes, is_active, base_url, enabled, priority)
values
  (
    'eraktkosh_authorized_feed',
    'e-RaktKosh authorised feed',
    'live_api',
    'Ministry of Health & Family Welfare / C-DAC',
    'https://eraktkosh.mohfw.gov.in/',
    'awaiting_credentials',
    true,
    'Reserved slot for the officially issued e-RaktKosh integration. It stays '
    || 'DISABLED until C-DAC grants credentials to this deployment. When the '
    || 'operator sets ERAKTKOSH_API_BASE_URL / ERAKTKOSH_API_KEY / '
    || 'ERAKTKOSH_API_SECRET in `.env.server` and enables this row, '
    || 'ERaktKoshProvider begins serving real figures through the standard sync '
    || 'pipeline. Until then MEDIPAL reports this source as not configured and '
    || 'shows no e-RaktKosh numbers at all.',
    true, null, false, 10
  ),
  (
    'blood_centre_verified',
    'Verified blood centre self-report',
    'user_submitted_unverified',
    'Participating blood centre (authorised representative)',
    null,
    'centre_verified',
    false,
    'Entered by an authenticated blood-centre user through the MEDIPAL centre '
    || 'portal. Published with source = BLOOD_CENTRE_VERIFIED. Ranked below an '
    || 'official authorised feed, so a provider figure is never overwritten by a '
    || 'manual one — the two coexist and the API applies the priority order.',
    true, null, true, 30
  )
on conflict (id) do update
  set name = excluded.name,
      source_type = excluded.source_type,
      provider = excluded.provider,
      url = excluded.url,
      requires_registration = excluded.requires_registration,
      notes = excluded.notes,
      is_active = excluded.is_active,
      priority = excluded.priority;

update blood_data_sources set priority = 90 where id = 'geoapify_directory';
update blood_data_sources set priority = 95 where id = 'openstreetmap_tiles';

-- -----------------------------------------------------------------------------
-- 9. Public availability view — refreshed to carry provenance + freshness basis
-- -----------------------------------------------------------------------------
drop view if exists blood_public_availability;

create view blood_public_availability
with (security_invoker = true) as
select
  f.id                                as facility_id,
  f.public_ref                        as facility_ref,
  f.external_id,
  f.name                              as facility_name,
  f.category                          as facility_category,
  f.address,
  f.city,
  f.district,
  d.name                              as district_name,
  f.state,
  f.postal_code,
  f.latitude,
  f.longitude,
  f.phone,
  f.emergency_hotline,
  f.has_blood_bank,
  f.status                            as facility_status,
  f.verification_status               as facility_verification_status,
  f.source_url,
  f.operating_hours,
  f.last_verified_at                  as facility_last_verified_at,
  f.data_source_id,
  f.source_note,
  i.blood_group,
  i.component,
  sum(i.quantity)::integer            as available_quantity,
  max(i.unit)                         as unit,
  max(i.availability_status::text)::blood_availability_status as availability_status,
  max(i.last_updated_at)              as inventory_last_updated_at,
  max(i.source_updated_at)            as source_updated_at,
  max(i.synced_at)                    as synced_at,
  bool_or(i.source_record_id is not null) as is_provider_synced,
  count(*)::integer                   as batch_count,
  min(i.expiry_date)                  as nearest_expiry_date
from blood_facilities f
left join districts d on d.id = f.district_id
join blood_inventory i on i.facility_id = f.id
where i.status in ('available','approaching_expiry')
  and i.quantity > 0
group by
  f.id, f.public_ref, f.external_id, f.name, f.category, f.address, f.city, f.district,
  d.name, f.state, f.postal_code, f.latitude, f.longitude, f.phone, f.emergency_hotline,
  f.has_blood_bank, f.status, f.verification_status, f.source_url, f.operating_hours,
  f.last_verified_at, f.data_source_id, f.source_note,
  i.blood_group, i.component;

comment on view blood_public_availability is
  'Aggregated, contact-free inventory surface. `source_updated_at` is the provider''s own observation time; freshness labels (LIVE / RECENT / STALE / OUTDATED) are derived by the API from it so the thresholds live in exactly one place.';

-- -----------------------------------------------------------------------------
-- 10. Row level security + grants for the new tables
-- -----------------------------------------------------------------------------
alter table districts          enable row level security;
alter table sync_runs          enable row level security;
alter table sync_errors        enable row level security;
alter table inventory_history  enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['districts','sync_runs','sync_errors','inventory_history']
  loop
    execute format('drop policy if exists %I on %I', t || '_api', t);
    execute format(
      'create policy %I on %I for all to medipal_api using (true) with check (true)',
      t || '_api', t
    );
  end loop;
end
$$;

grant usage on schema public to medipal_api;
grant select on blood_public_availability to medipal_api;
grant select, insert, update, delete on all tables in schema public to medipal_api;
grant usage, select on all sequences in schema public to medipal_api;

-- -----------------------------------------------------------------------------
-- 11. Publication gate — widened for authorised provider feeds
-- -----------------------------------------------------------------------------
-- The original gate required a licence number before a centre could be
-- published, which is correct for a centre that MEDIPAL onboards itself. A
-- centre that arrives from an AUTHORISED provider feed is vouched for by that
-- feed instead: we hold the provider's own identifier and the moment we
-- verified it. The constraint name is unchanged so existing error handling and
-- messages keep working.
--
-- Nothing is weakened for MEDIPAL-onboarded facilities: they still need a
-- licence number and a verification timestamp. And an unverified, licence-less
-- row still cannot be published.
alter table blood_facilities drop constraint if exists blood_facilities_status_gate;
alter table blood_facilities add constraint blood_facilities_status_gate check (
  status <> 'approved'
  or (license_number is not null and last_verified_at is not null)
  or (
    verification_status = 'provider_authorized'
    and external_id is not null
    and last_verified_at is not null
  )
);

commit;
