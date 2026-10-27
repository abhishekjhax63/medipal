/**
 * A tiny server-sent-events hub for blood availability changes.
 *
 * The specification asks for Supabase Realtime so that a client watching a
 * blood group sees a 5 -> 2 change without reloading. This deployment does not
 * run Supabase; the equivalent behaviour is implemented here, on the same
 * server that owns the data, with no extra vendor and no change to the
 * database. A change detected during a sync is broadcast to every subscribed
 * browser exactly once.
 *
 * Nothing sensitive is ever broadcast: events carry a facility reference, a
 * blood group, a component, a unit count and the source's own timestamp. No
 * contact data, no key, no raw payload.
 */

/** @type {Set<import("node:http").ServerResponse>} */
const clients = new Set();

/** The most recent event, replayed to a client the moment it subscribes. */
let lastEvent = null;

function write(response, payload) {
  try {
    response.write(`data: ${JSON.stringify(payload)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Registers a response as an SSE subscriber. Returns an unsubscribe function
 * that the caller must invoke when the connection closes.
 */
export function subscribe(response) {
  clients.add(response);
  // Tell the client how to behave before the first real event arrives.
  write(response, {
    type: "hello",
    at: new Date().toISOString(),
    subscribers: clients.size,
    note: "Availability changes are pushed here as they are synced. Nothing is fabricated: a silent stream means no change was observed.",
  });
  if (lastEvent) write(response, { ...lastEvent, replayed: true });

  return () => {
    clients.delete(response);
  };
}

/** Fans an event out to every subscriber. Never throws. */
export function broadcast(event) {
  const payload = { ...event, at: event.at ?? new Date().toISOString() };
  lastEvent = payload;

  for (const response of [...clients]) {
    if (!write(response, payload)) clients.delete(response);
  }
  return clients.size;
}

export function subscriberCount() {
  return clients.size;
}

/** Closes every stream — used when the process is shutting down. */
export function closeAll() {
  for (const response of [...clients]) {
    try {
      response.end();
    } catch {
      /* the socket is already gone */
    }
  }
  clients.clear();
}
