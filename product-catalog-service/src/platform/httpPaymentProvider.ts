import { randomUUID } from "node:crypto";
import { createBoundedMap } from "../utils/boundedMap";
import {
  DeclineCode,
  Money,
  PaymentGatewayUnavailableError,
  PaymentMethodInfo,
  PaymentProvider,
  PaymentResult,
  PaymentStateError,
  PaymentStatus,
} from "./types";

/**
 * Adapter from the `PaymentProvider` port to a Stripe-style HTTP gateway (here:
 * the local `payment-simulator` service). Replacing the dummy with a real
 * gateway means writing one more adapter like this - checkout doesn't change.
 *
 * Configuration is read fresh on every call (like the other services' env
 * knobs): PAYMENT_GATEWAY_URL (server-to-server), PAYMENT_GATEWAY_PUBLIC_URL
 * (what the browser calls; defaults to the server URL), and the two dummy keys.
 */
const TIMEOUT_MS = 5000;

const gatewayUrl = (): string => (process.env.PAYMENT_GATEWAY_URL ?? "http://localhost:5002").replace(/\/$/, "");
const publicUrl = (): string => (process.env.PAYMENT_GATEWAY_PUBLIC_URL ?? gatewayUrl()).replace(/\/$/, "");
const secretKey = (): string => process.env.PAYMENT_GATEWAY_SECRET_KEY ?? "sk_test_dummy";
const publishableKey = (): string => process.env.PAYMENT_GATEWAY_PUBLISHABLE_KEY ?? "pk_test_dummy";

interface GatewayPayment {
  id: string;
  status: PaymentStatus;
  declineCode?: DeclineCode;
  actionType?: "3ds";
  card?: { brand: string; last4: string };
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; json: T & { error?: string; message?: string } }> {
  try {
    const response = await fetch(`${gatewayUrl()}${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${secretKey()}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await response.json().catch(() => ({}))) as T & { error?: string; message?: string };
    if (response.status >= 500) throw new PaymentGatewayUnavailableError(`Gateway error ${response.status}`);
    return { status: response.status, json };
  } catch (err) {
    if (err instanceof PaymentGatewayUnavailableError) throw err;
    throw new PaymentGatewayUnavailableError(`Payment gateway unreachable: ${(err as Error).message}`);
  }
}

function toResult(payment: GatewayPayment): PaymentResult {
  return {
    status: payment.status,
    reference: payment.id,
    ...(payment.declineCode ? { declineCode: payment.declineCode } : {}),
    ...(payment.actionType ? { actionType: payment.actionType } : {}),
    ...(payment.card ? { card: payment.card } : {}),
  };
}

/** Maps a gateway 4xx on a lifecycle call to the port's typed error. */
function stateError(status: number, json: { error?: string; message?: string }): PaymentStateError {
  const code = status === 404 ? "UNKNOWN_PAYMENT" : json.error === "amount_exceeds_captured" ? "AMOUNT_EXCEEDS_CAPTURED" : "INVALID_STATE";
  return new PaymentStateError(code, json.message ?? "Payment gateway rejected the operation");
}

export function createGatewayPaymentProvider(
  method: Omit<PaymentMethodInfo, "simulated" | "clientConfig"> & { tokenMethod: "card" | "ebt" },
  options: { simulated: boolean }
): PaymentProvider {
  const { tokenMethod, ...base } = method;

  const lifecycle = async (path: string, body?: unknown): Promise<PaymentResult> => {
    const { status, json } = await call<GatewayPayment>("POST", path, body ?? {});
    if (status >= 400) throw stateError(status, json);
    return toResult(json);
  };

  return {
    // A getter, so the public URL follows the env var like every other knob.
    get method(): PaymentMethodInfo {
      return {
        ...base,
        simulated: options.simulated,
        clientConfig: {
          tokenizationUrl: `${publicUrl()}/v1/tokens`,
          publishableKey: publishableKey(),
          testCardsUrl: options.simulated ? `${publicUrl()}/v1/test-cards` : undefined,
          tokenMethod,
        },
      };
    },

    async authorize({ orderRef, amount, source }) {
      if (source.kind !== "token") {
        return { status: "declined", reference: `none_${randomUUID()}`, declineCode: "unsupported_source" };
      }
      const { status, json } = await call<GatewayPayment>("POST", "/v1/payments", {
        token: source.token,
        amountMinor: amount.amountMinor,
        currency: amount.currency,
        orderRef,
      });
      if (status === 400 || status === 401) {
        // A bad/used/expired token, not a gateway outage: a normal decline.
        return { status: "declined", reference: `rejected_${randomUUID()}`, declineCode: "invalid_token" };
      }
      return toResult(json);
    },

    confirmAction: (reference, approved) => lifecycle(`/v1/payments/${encodeURIComponent(reference)}/confirm`, { approved }),
    capture: (reference) => lifecycle(`/v1/payments/${encodeURIComponent(reference)}/capture`),
    refund: (reference: string, amount: Money) =>
      lifecycle(`/v1/payments/${encodeURIComponent(reference)}/refund`, { amountMinor: amount.amountMinor }),
  };
}

/**
 * Pay at pickup: nothing is collected online, so there is no gateway. The order
 * is placed as `authorized` (an intent to pay) and captured at the counter.
 * Records live in memory only - it is a placeholder for a POS integration.
 */
export function createPayAtPickupProvider(method: Omit<PaymentMethodInfo, "simulated" | "clientConfig">): PaymentProvider {
  const records = createBoundedMap<string, { status: PaymentStatus; amountMinor: number; refundedMinor: number }>(10_000);
  const load = (reference: string) => {
    const record = records.get(reference);
    if (!record) throw new PaymentStateError("UNKNOWN_PAYMENT", `No payment found with reference "${reference}"`);
    return record;
  };

  return {
    method: { ...method, simulated: true },

    async authorize({ amount, source }) {
      if (source.kind !== "none") return { status: "declined", reference: `none_${randomUUID()}`, declineCode: "unsupported_source" };
      const reference = `pickup_${randomUUID()}`;
      records.set(reference, { status: "authorized", amountMinor: amount.amountMinor, refundedMinor: 0 });
      return { status: "authorized", reference };
    },

    async confirmAction() {
      throw new PaymentStateError("INVALID_STATE", "Pay at pickup has no action to confirm");
    },

    async capture(reference) {
      const record = load(reference);
      if (record.status !== "authorized" && record.status !== "captured") {
        throw new PaymentStateError("INVALID_STATE", `Cannot capture a payment that is ${record.status}`);
      }
      record.status = "captured";
      return { status: "captured", reference };
    },

    async refund(reference, amount) {
      const record = load(reference);
      if (record.status !== "captured" && record.status !== "refunded") {
        throw new PaymentStateError("INVALID_STATE", `Cannot refund a payment that is ${record.status}`);
      }
      if (record.refundedMinor + amount.amountMinor > record.amountMinor) {
        throw new PaymentStateError("AMOUNT_EXCEEDS_CAPTURED", "Refund exceeds the captured amount");
      }
      record.refundedMinor += amount.amountMinor;
      if (record.refundedMinor === record.amountMinor) record.status = "refunded";
      return { status: "refunded", reference };
    },
  };
}
