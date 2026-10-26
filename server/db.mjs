/**
 * PostgreSQL access for the Blood Bank module.
 *
 * The pool connects as the least-privilege role named in `DATABASE_URL`
 * (`medipal_api`), never as a superuser. That is deliberate: `blood_donors`,
 * `blood_requests` and `blood_request_events` run under FORCE ROW LEVEL
 * SECURITY, and a superuser would silently bypass it.
 *
 * Failure is never hidden. If the database is unreachable, callers receive a
 * 503 carrying an explicit "database not reachable" error instead of an empty
 * list, so a broken backend can never be mistaken for "no blood available".
 */

import pg from "pg";
import { config } from "./env.mjs";

const { Pool } = pg;

export const dbConfigured = Boolean(config.database.url);

let pool = null;
let lastFailure = null;

function getPool() {
  if (!dbConfigured) {
    const error = new Error(
      "The blood bank database is not configured on this server. " +
        "Set DATABASE_URL in `.env.server` and run `npm run db:setup`.",
    );
    error.statusCode = 503;
    error.code = "DB_NOT_CONFIGURED";
    throw error;
  }
  if (!pool) {
    pool = new Pool({
      connectionString: config.database.url,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: "medipal-api",
    });
    // A pool-level error must not take the process down; surface it on next use.
    pool.on("error", (error) => {
      lastFailure = error;
      console.error(`[medipal] postgres pool error: ${error.message}`);
    });
  }
  return pool;
}

/** Runs a single parameterised statement. */
export async function query(text, params = []) {
  const client = getPool();
  try {
    const result = await client.query(text, params);
    lastFailure = null;
    return result;
  } catch (error) {
    lastFailure = error;
    throw translate(error);
  }
}

/** Runs `fn` inside a transaction, rolling back on any throw. */
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    lastFailure = null;
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* rollback failure is superseded by the original error */
    }
    throw translate(error);
  } finally {
    client.release();
  }
}

/**
 * Maps driver failures onto HTTP-bearing errors. Constraint violations become
 * 400/409 with the offending constraint named, so the client can show a real
 * reason instead of a generic failure.
 */
function translate(error) {
  if (error?.statusCode) return error;

  const constraint = error?.constraint || "";
  const map = {
    blood_donors_consent_required: "Consent must be recorded before a donor can be contacted.",
    blood_donors_phone_shape: "Enter a 10-digit Indian mobile number.",
    blood_requests_consent_required: "The request cannot be submitted without recorded consent.",
    blood_requests_phone_shape: "Enter a 10-digit Indian contact number.",
    blood_facilities_status_gate:
      "A facility needs a licence number and a verification timestamp before it can be approved.",
    blood_inventory_expiry_order: "The expiry date cannot be earlier than the collection date.",
    blood_transfers_distinct_facilities: "A transfer must have two different facilities.",
    blood_cold_chain_range: "The cold-chain target range is inverted.",
  };
  if (map[constraint]) {
    const wrapped = new Error(map[constraint]);
    wrapped.statusCode = 400;
    wrapped.code = "CONSTRAINT_VIOLATION";
    wrapped.detail = { constraint };
    return wrapped;
  }

  if (error?.code === "23505" || error?.code === "23514" || error?.code === "23503") {
    const wrapped = new Error(
      error.code === "23505"
        ? "That record already exists."
        : "The submitted values did not pass the database's integrity checks.",
    );
    wrapped.statusCode = error.code === "23505" ? 409 : 400;
    wrapped.code = error.code;
    wrapped.detail = { constraint: constraint || undefined };
    return wrapped;
  }

  if (error?.code === "ECONNREFUSED" || error?.code === "ETIMEDOUT" || error?.code === "ENOTFOUND") {
    const wrapped = new Error(
      "The blood bank database is not reachable. Check that PostgreSQL is running.",
    );
    wrapped.statusCode = 503;
    wrapped.code = "DB_UNREACHABLE";
    return wrapped;
  }

  const wrapped = new Error("The database rejected the request.");
  wrapped.statusCode = 500;
  wrapped.code = error?.code || "DB_ERROR";
  wrapped.cause = error;
  return wrapped;
}

/**
 * Runs `fn` on a dedicated connection inside a transaction that is ALWAYS
 * rolled back. Used by the Blood Bank self-test, which deliberately provokes
 * constraint violations: the probes must prove real behaviour without leaving
 * a single row behind, and errors must surface raw so the test can inspect
 * constraint names rather than a translated message.
 */
export async function withRollback(fn) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    return await fn(client);
  } finally {
    try {
      await client.query("rollback");
    } catch (error) {
      console.error(`[medipal] self-test rollback failed: ${error.message}`);
    }
    client.release();
  }
}

/** Health probe used by `GET /api/health`. Never throws. */
export async function databaseHealth() {
  if (!dbConfigured) return { status: "not_configured" };
  try {
    const started = Date.now();
    const result = await query("select current_user as role, now() as at");
    return {
      status: "live",
      role: result.rows[0].role,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return { status: "error", message: error.message, code: error.code || null };
  }
}

export function databaseFailure() {
  return lastFailure ? String(lastFailure.message || lastFailure) : null;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Appends an audit entry. Audit failures are reported, never swallowed silently. */
export async function audit(entry) {
  const { actor = "anonymous", action, entity, entityId = null, detail = null } = entry;
  try {
    await query(
      `insert into blood_audit_logs (actor, action, entity, entity_id, detail)
       values ($1, $2, $3, $4, $5)`,
      [actor, action, entity, entityId, detail],
    );
  } catch (error) {
    console.error(`[medipal] audit write failed (${action}/${entity}): ${error.message}`);
    throw error;
  }
}
