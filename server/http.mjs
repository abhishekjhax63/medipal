/**
 * Minimal HTTP helpers shared by the MEDIPAL route modules.
 *
 * Everything the client receives is JSON. Errors are shaped once, here, so no
 * handler can accidentally leak an internal message for a 5xx while still
 * reporting a precise reason for 4xx.
 */

export class HttpError extends Error {
  constructor(statusCode, message, code = undefined, detail = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.detail = detail;
  }
}

export function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  response.end(payload);
}

export function sendError(response, error) {
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const message =
    status >= 500 && !error?.statusCode
      ? "Something went wrong on the server."
      : error?.message || "Request failed.";
  const body = { error: message };
  if (error?.code) body.code = error.code;
  if (error?.detail) body.detail = error.detail;
  if (status >= 500 && error?.cause?.message) {
    console.error(`[medipal] ${error.code || "error"}: ${error.cause.message}`);
  }
  sendJson(response, status, body);
}

export async function readJsonBody(request, limitBytes = 256 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        rejectBody(new HttpError(413, "Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolveBody({});
      try {
        const parsed = JSON.parse(raw);
        resolveBody(parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        rejectBody(new HttpError(400, "Request body must be valid JSON."));
      }
    });
    request.on("error", rejectBody);
  });
}
