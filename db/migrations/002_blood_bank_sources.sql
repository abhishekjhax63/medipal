-- =============================================================================
-- MEDIPAL · Blood Bank module · migration 002
-- Data-source register (provenance), static reference rows only.
-- =============================================================================
-- These rows describe WHERE blood information can legitimately come from and
-- what each source is and is not allowed to claim. They contain no patient,
-- donor, facility or stock data — nothing here is invented clinical content.
--
-- Every facility row and every inventory row carries `data_source_id`, so the
-- UI can always print an honest provenance line next to a number.
-- =============================================================================

begin;

insert into blood_data_sources
  (id, name, source_type, provider, url, verification_status, requires_registration, notes, is_active)
values
  (
    'eraktkosh',
    'e-RaktKosh',
    'unavailable',
    'Ministry of Health & Family Welfare / C-DAC',
    'https://eraktkosh.mohfw.gov.in/',
    'no_authorized_api',
    true,
    'India''s national blood-bank portal. It exposes NO open API for automated '
    || 'consumption: the public stock endpoint is bound to an authenticated '
    || 'browser session and rejects requests that do not carry the anti-automation '
    || 'token minted by the portal''s own JavaScript. C-DAC issues "Open API" '
    || 'credentials only to licensed blood banks after registration '
    || '(eraktkosh@cdac.in). MEDIPAL does not bypass that access control, so '
    || 'e-RaktKosh figures are not shown.',
    true
  ),
  (
    'facility_self_report',
    'Facility self-reported inventory',
    'user_submitted_unverified',
    'Participating blood bank (authorised representative)',
    null,
    'unverified',
    false,
    'Entered by a facility''s authorised representative through the MEDIPAL '
    || 'facility console. Reported in good faith and not independently audited. '
    || 'Treat as an indication to confirm by telephone, never as a guarantee '
    || 'that a unit is reserved.',
    true
  ),
  (
    'medipal_field_verified',
    'MEDIPAL coordinator verification',
    'periodic_import',
    'MEDIPAL operations team',
    null,
    'verified',
    false,
    'Countersigned by a MEDIPAL coordinator against the facility''s physical '
    || 'register. Verification is manual and periodic — it is NOT a real-time '
    || 'feed, and the timestamp shown is the moment of verification.',
    true
  ),
  (
    'geoapify_directory',
    'Geoapify healthcare directory',
    'live_api',
    'Geoapify GmbH (OpenStreetMap-derived)',
    'https://www.geoapify.com/',
    'live',
    false,
    'Live place search over OpenStreetMap-derived healthcare data. Returns '
    || 'facility names, addresses, categories and contact details ONLY. It '
    || 'carries no blood group, no component and no stock quantity, and MEDIPAL '
    || 'never infers any.',
    true
  ),
  (
    'openstreetmap_tiles',
    'OpenStreetMap base map',
    'live_api',
    'OpenStreetMap contributors',
    'https://www.openstreetmap.org/',
    'live',
    false,
    'Base map tiles for the facility network map. Provides geographic context '
    || 'only — no facility records and no stock data.',
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

commit;
