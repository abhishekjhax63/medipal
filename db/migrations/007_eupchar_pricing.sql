-- =============================================================================
-- MEDIPAL · E-UPCHAR verified pricing
-- =============================================================================
-- Extends the price record so a published price, a free-programme price, a
-- provider-confirmed price and an unconfirmed price are all representable and
-- distinguishable — and so an administrator can record provenance and flag a
-- stale source without deleting history.
--
-- No price is seeded. A blank database stays blank until an authorised
-- administrator records a sourced price.

begin;

alter table eupchar_service_prices
  add column if not exists source_url        text,
  add column if not exists source_type       text,
  add column if not exists status_note       text,
  add column if not exists stale_detected_on date,
  add column if not exists verified_by       uuid references eupchar_users(id) on delete set null;

-- The original inline check allowed only ('verified','unverified'). Widen it to
-- the honest states used by the application (types/eupchar.ts).
alter table eupchar_service_prices
  drop constraint if exists eupchar_service_prices_verification_status_check;
alter table eupchar_service_prices
  add constraint eupchar_service_prices_verification_status_check
  check (verification_status in (
    'verified','published','free_programme','awaiting_confirmation','unverified','practice'
  ));

-- Any state that may surface a chargeable or free amount must carry its
-- provenance: an amount, a named source and the date that source was checked.
alter table eupchar_service_prices
  drop constraint if exists eupchar_verified_price_complete;
alter table eupchar_service_prices
  add constraint eupchar_verified_price_complete check (
    verification_status not in ('verified','published','free_programme')
    or (final_payable_paise is not null and source_id is not null and last_verified_on is not null)
  );

-- A source flagged stale must say when it was flagged.
alter table eupchar_service_prices
  drop constraint if exists eupchar_price_stale_has_date;
alter table eupchar_service_prices
  add constraint eupchar_price_stale_has_date check (stale_detected_on is null or last_verified_on is not null);

create index if not exists eupchar_service_prices_status_idx
  on eupchar_service_prices (verification_status);

grant select, insert, update, delete on all tables in schema public to medipal_api;

commit;
