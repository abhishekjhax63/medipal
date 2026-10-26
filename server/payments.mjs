/**
 * Razorpay payment endpoints.
 *
 * Two operations, both server-side so the secret never reaches the browser:
 *
 *  - `createOrder` — asks Razorpay for an order id for an amount in paise. The
 *    browser can only *request* an order; it never creates one itself.
 *  - `verifyPayment` — recomputes the HMAC signature Razorpay returned. The
 *    browser's "success" callback is treated as untrusted evidence; only this
 *    check decides whether a payment is real.
 *
 * The matching key *secret* lives in `.env.server` only.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { config, readiness } from "./env.mjs";

export const paymentsConfigured = readiness.payments;

const RAZORPAY_API = "https://api.razorpay.com/v1";
const REQUEST_TIMEOUT_MS = 20_000;

function authHeader() {
  const token = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString("base64");
  return `Basic ${token}`;
}

/** Constant-time comparison of two hex signatures. */
function safeEqual(a, b) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function createOrder({ amountPaise, receipt }) {
  if (!paymentsConfigured) {
    const error = new Error("Payments are not configured on the server.");
    error.statusCode = 503;
    throw error;
  }

  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    const error = new Error("A positive integer amount in paise is required.");
    error.statusCode = 400;
    throw error;
  }

  let response;
  try {
    response = await fetch(`${RAZORPAY_API}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(),
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: typeof receipt === "string" ? receipt.slice(0, 40) : undefined,
        notes: { source: "medipal-e-upchar" },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    const error = new Error("The payment service could not be reached.");
    error.statusCode = 502;
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(
      `The payment service refused the order (status ${response.status}).${detail ? ` ${detail.slice(0, 200)}` : ""}`,
    );
    error.statusCode = 502;
    throw error;
  }

  const order = await response.json();
  if (!order || typeof order.id !== "string") {
    const error = new Error("The payment service did not return an order id.");
    error.statusCode = 502;
    throw error;
  }

  return {
    orderId: order.id,
    amountPaise: typeof order.amount === "number" ? order.amount : amountPaise,
    currency: typeof order.currency === "string" ? order.currency : "INR",
  };
}

/**
 * Verifies a completed payment. Returns `paid` only when the signature matches;
 * anything else is reported honestly as `pending` or `failed`.
 */
export async function verifyPayment({ orderId, providerPaymentId, signature }) {
  if (!paymentsConfigured) {
    const error = new Error("Payments are not configured on the server.");
    error.statusCode = 503;
    throw error;
  }

  if (typeof orderId !== "string" || orderId.length === 0) {
    const error = new Error("An order id is required to verify a payment.");
    error.statusCode = 400;
    throw error;
  }

  if (typeof providerPaymentId !== "string" || typeof signature !== "string" || !providerPaymentId || !signature) {
    return { status: "pending", reason: "No completed payment was supplied to verify." };
  }

  const expected = createHmac("sha256", config.razorpay.keySecret)
    .update(`${orderId}|${providerPaymentId}`)
    .digest("hex");

  if (!safeEqual(expected, signature)) {
    return {
      status: "failed",
      reason: "The payment signature did not match, so the payment was not accepted.",
    };
  }

  return { status: "paid", reason: "Payment signature verified by the payment service." };
}
