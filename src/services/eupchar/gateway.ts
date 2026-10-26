/**
 * Payment gateway abstraction (spec §14).
 *
 * Two paths, never mixed:
 *
 *  - **Live** — `VITE_EUPCHAR_API_BASE` and a publishable key id are configured.
 *    The browser only ever *asks the server* to create an order and then *asks
 *    the server* to verify the result. The browser's own "success" callback is
 *    treated as untrusted input; only `payments/verify` decides the status.
 *
 *  - **Sandbox** — nothing is configured. No order is created with any real
 *    provider and no money can move. Every result is tagged `sandbox: true` and
 *    the UI is required to say so. MEDIPAL never claims a real payment happened.
 *
 * No secret is ever read here. The Razorpay secret lives on the server only.
 */

import { API_BASE, RAZORPAY_PUBLIC_KEY_ID, isApiConnected } from "@/services/eupchar/config";
import type { PaymentStatus } from "@/types/eupchar";

export type CreateOrderInput = {
  bookingId: string;
  amountPaise: number;
  patientName: string;
  serviceName: string;
};

export type CreateOrderResult =
  | {
      ok: true;
      sandbox: boolean;
      /** Server-issued order id. Unique per attempt (idempotency key). */
      orderId: string;
      amountPaise: number;
      currency: "INR";
      /** Publishable key id — safe to hand to the provider's checkout script. */
      publicKeyId: string | null;
    }
  | { ok: false; reason: string };

export type VerifyPaymentInput = {
  bookingId: string;
  orderId: string;
  providerPaymentId: string | null;
  signature: string | null;
  sandbox: boolean;
};

export type VerifyPaymentResult = {
  status: PaymentStatus;
  sandbox: boolean;
  reason: string;
};

const CREATE_ORDER_PATH = "/api/e-upchar/payments/create-order";
const VERIFY_PATH = "/api/e-upchar/payments/verify";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function createPaymentOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  if (!input.amountPaise || input.amountPaise <= 0) {
    return {
      ok: false,
      reason:
        "There is no verified amount to charge for this booking, so no payment can be started.",
    };
  }

  if (isApiConnected) {
    try {
      const response = await fetch(`${API_BASE}${CREATE_ORDER_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": newIdempotencyKey(),
        },
        body: JSON.stringify({
          bookingId: input.bookingId,
          amountPaise: input.amountPaise,
        }),
      });
      if (!response.ok) {
        return {
          ok: false,
          reason: `The payment service replied with ${response.status}. No payment was taken.`,
        };
      }
      const payload = (await response.json()) as {
        orderId?: string;
        amountPaise?: number;
        currency?: string;
      };
      if (!payload.orderId) {
        return { ok: false, reason: "The payment service did not return an order id." };
      }
      return {
        ok: true,
        sandbox: false,
        orderId: payload.orderId,
        amountPaise: payload.amountPaise ?? input.amountPaise,
        currency: "INR",
        publicKeyId: RAZORPAY_PUBLIC_KEY_ID || null,
      };
    } catch {
      return {
        ok: false,
        reason:
          "MEDIPAL could not reach the payment service. Network failure — no payment was taken.",
      };
    }
  }

  // Sandbox: an order id that is obviously not from a real provider.
  return {
    ok: true,
    sandbox: true,
    orderId: `sandbox_${newIdempotencyKey()}`,
    amountPaise: input.amountPaise,
    currency: "INR",
    publicKeyId: null,
  };
}

/**
 * Ask the server to confirm the payment. The browser's callback values are sent
 * as *evidence only* — the status returned here is the only one MEDIPAL trusts.
 */
export async function verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
  if (input.sandbox) {
    return {
      status: "paid",
      sandbox: true,
      reason: "Sandbox payment recorded locally. No money was processed.",
    };
  }

  try {
    const response = await fetch(`${API_BASE}${VERIFY_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: input.bookingId,
        orderId: input.orderId,
        providerPaymentId: input.providerPaymentId,
        signature: input.signature,
      }),
    });
    if (!response.ok) {
      return {
        status: "pending",
        sandbox: false,
        reason: `Verification returned ${response.status}. The payment status is not confirmed yet.`,
      };
    }
    const payload = (await response.json()) as { status?: PaymentStatus };
    const status: PaymentStatus = payload.status ?? "pending";
    return {
      status,
      sandbox: false,
      reason:
        status === "paid"
          ? "Payment confirmed by the payment provider."
          : `The provider reported the payment as "${status}".`,
    };
  } catch {
    return {
      status: "pending",
      sandbox: false,
      reason:
        "MEDIPAL could not reach the payment service to confirm. Your payment status is pending — do not pay again.",
    };
  }
}

/** Loads the provider's checkout script only for a live payment attempt. */
export async function loadRazorpayCheckout(): Promise<boolean> {
  if (typeof document === "undefined") return false;
  if ("Razorpay" in window) return true;
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}
