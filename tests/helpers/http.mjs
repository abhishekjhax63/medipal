/**
 * Minimal request/response doubles for exercising the HTTP route modules
 * without opening a socket.
 *
 * The route modules only ever touch a handful of members of `request` and
 * `response` (`method`, `headers`, `on`, `writeHead`, `write`, `end`), so a
 * small honest pair of objects is enough — no mocking framework, and no
 * pretence that these are real sockets.
 */

/**
 * A request double.
 *
 * `emit()` is real: `streamChanges` registers `close`/`error` handlers and
 * relies on being called back to clear its keep-alive timer, so a test that
 * exercises the SSE route MUST call `emit("close")` or the run will hang.
 */
export function fakeRequest({ method = "GET", headers = {}, remoteAddress = "127.0.0.1" } = {}) {
  const handlers = new Map();
  return {
    method,
    headers,
    socket: { remoteAddress },
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return this;
    },
    emit(event) {
      for (const handler of handlers.get(event) ?? []) handler();
      return this;
    },
    destroy() {},
  };
}

/** Collects everything the route writes, so a test can assert on it. */
export function fakeResponse() {
  const chunks = [];
  const response = {
    statusCode: null,
    headers: null,
    chunks,
    /** Everything written so far — an SSE route never calls `end()`. */
    get body() {
      return chunks.join("");
    },
    writeHead(statusCode, headers) {
      response.statusCode = statusCode;
      response.headers = headers;
      return response;
    },
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    },
    end(chunk) {
      if (chunk !== undefined) chunks.push(String(chunk));
      return response;
    },
  };
  return response;
}

/** The parsed JSON body, or `null` when the route wrote nothing. */
export function jsonBody(response) {
  return response.body ? JSON.parse(response.body) : null;
}

export function urlOf(path) {
  return new URL(path, "http://medipal.test");
}
