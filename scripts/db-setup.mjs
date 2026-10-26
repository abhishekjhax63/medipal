/**
 * MEDIPAL · Blood Bank database setup.
 *
 * Idempotent. Run with `npm run db:setup`.
 *
 *  1. Creates the `medipal` database if it does not exist.
 *  2. Creates/updates the least-privilege `medipal_api` login role, taking its
 *     password from `DATABASE_URL`. The server never connects as a superuser,
 *     which is what makes the FORCE ROW LEVEL SECURITY policies meaningful.
 *  3. Applies every `db/migrations/*.sql` in filename order, each inside its own
 *     transaction (the files carry their own begin/commit).
 *  4. Verifies the result and prints what actually exists.
 *
 * Nothing here is destructive: migrations only CREATE or replace objects. No
 * DROP of any pre-existing table, and no seed data for donors or inventory.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { ROOT, config } from "../server/env.mjs";

const MIGRATIONS_DIR = resolve(ROOT, "db", "migrations");

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

function requireAdminUrl() {
  if (!config.database.adminUrl) {
    fail(
      "DATABASE_ADMIN_URL is not set. Add it to `.env.server`, e.g.\n" +
        "      DATABASE_ADMIN_URL=postgresql://<superuser>@127.0.0.1:5432/medipal",
    );
  }
  return config.database.adminUrl;
}

function requireAppUrl() {
  if (!config.database.url) {
    fail(
      "DATABASE_URL is not set. Add it to `.env.server`, e.g.\n" +
        "      DATABASE_URL=postgresql://medipal_api:<password>@127.0.0.1:5432/medipal",
    );
  }
  return config.database.url;
}

/** Splits a connection URL into the pieces needed to bootstrap a role. */
function describe(url) {
  const parsed = new URL(url);
  return {
    database: parsed.pathname.replace(/^\//, ""),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    host: parsed.hostname,
    port: parsed.port || "5432",
  };
}

async function ensureDatabase(admin, target) {
  const existing = await admin.query("select 1 from pg_database where datname = $1", [target]);
  if (existing.rowCount > 0) {
    console.log(`  · database "${target}" already exists`);
    return;
  }
  // Identifiers cannot be parameterised; `target` comes from our own env file.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(target)) fail(`Unsafe database name: ${target}`);
  await admin.query(`create database ${target}`);
  console.log(`  ✓ created database "${target}"`);
}

async function ensureRole(admin, app) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(app.user)) fail(`Unsafe role name: ${app.user}`);
  if (!app.password) {
    fail(
      "DATABASE_URL must include a password for the application role, e.g.\n" +
        "      DATABASE_URL=postgresql://medipal_api:<password>@127.0.0.1:5432/medipal",
    );
  }

  const exists = await admin.query("select 1 from pg_roles where rolname = $1", [app.user]);
  if (exists.rowCount === 0) {
    await admin.query(
      `create role ${app.user} with login password '${app.password.replace(/'/g, "''")}'`,
    );
    console.log(`  ✓ created role "${app.user}"`);
  } else {
    await admin.query(
      `alter role ${app.user} with login password '${app.password.replace(/'/g, "''")}'`,
    );
    console.log(`  · role "${app.user}" already exists (password re-synced)`);
  }

  // Explicitly NOT a superuser and explicitly NOT bypassing RLS.
  await admin.query(
    `alter role ${app.user} nosuperuser nocreatedb nocreaterole nobypassrls`,
  );
}

async function applyMigrations(client) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (files.length === 0) fail(`No migrations found in ${MIGRATIONS_DIR}`);

  for (const file of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
    try {
      await client.query(sql);
      console.log(`  ✓ applied ${file}`);
    } catch (error) {
      console.error(`\n  ✗ ${file} failed: ${error.message}\n`);
      throw error;
    }
  }
}

async function report(client) {
  const tables = await client.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`,
  );
  const views = await client.query(
    `select table_name from information_schema.views
      where table_schema = 'public' order by table_name`,
  );
  const sources = await client.query(
    `select id, source_type, verification_status from blood_data_sources order by id`,
  );
  const rls = await client.query(
    `select relname, relrowsecurity, relforcerowsecurity
       from pg_class
      where relnamespace = 'public'::regnamespace
        and relkind = 'r' and relforcerowsecurity
      order by relname`,
  );

  console.log(`\n  tables (${tables.rowCount}): ${tables.rows.map((r) => r.table_name).join(", ")}`);
  console.log(`  views  (${views.rowCount}): ${views.rows.map((r) => r.table_name).join(", ")}`);
  console.log("\n  data sources:");
  for (const row of sources.rows) {
    console.log(`    · ${row.id} — ${row.source_type} / ${row.verification_status}`);
  }
  console.log(
    `\n  FORCE RLS tables: ${rls.rows.map((r) => r.relname).join(", ") || "(none)"}`,
  );
}

async function main() {
  const adminUrl = requireAdminUrl();
  const appUrl = requireAppUrl();
  const app = describe(appUrl);

  console.log("\nMEDIPAL · blood bank database setup\n");

  const bootstrapUrl = new URL(adminUrl);
  bootstrapUrl.pathname = "/postgres";
  const bootstrap = new Client({ connectionString: bootstrapUrl.toString() });

  await bootstrap.connect();
  try {
    await ensureDatabase(bootstrap, app.database);
    await ensureRole(bootstrap, app);
  } finally {
    await bootstrap.end();
  }

  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await applyMigrations(client);
    await report(client);
  } finally {
    await client.end();
  }

  // Prove the application role can actually reach the schema and that its
  // privileges do not include superuser.
  const appProbe = new Client({ connectionString: appUrl });
  await appProbe.connect();
  try {
    const identity = await appProbe.query(
      `select current_user as role, usesuper, usebypassrls
         from pg_user where usename = current_user`,
    );
    const { role, usesuper, usebypassrls } = identity.rows[0];
    if (usesuper || usebypassrls) {
      fail(`Role "${role}" must not be a superuser or BYPASSRLS.`);
    }
    const reachable = await appProbe.query("select count(*)::int as n from blood_public_availability");
    console.log(
      `\n  ✓ application role "${role}" connected (superuser=${usesuper}, bypassrls=${usebypassrls})`,
    );
    console.log(`  ✓ blood_public_availability reachable, ${reachable.rows[0].n} row(s)`);
  } finally {
    await appProbe.end();
  }

  console.log("\n  Database setup complete.\n");
}

main().catch((error) => fail(error.message));
