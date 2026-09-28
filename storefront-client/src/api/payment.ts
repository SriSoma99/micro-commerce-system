import type { PaymentMethodInfo } from "../types/store";

export interface TestCard {
  number: string;
  outcome: string;
}

export type TokenizeResult = { ok: true; token: string; brand: string; last4: string } | { ok: false; message: string };

/**
 * Sends the card details STRAIGHT to the payment gateway (never to the shop
 * backend) and gets back a one-time token. The publishable key is safe to
 * ship in the browser: it can only create tokens, not charge anything.
 */
export async function tokenizeCard(
  config: NonNullable<PaymentMethodInfo["clientConfig"]>,
  card: { number: string; month: number; year: number; cvc: string }
): Promise<TokenizeResult> {
  try {
    const response = await fetch(config.tokenizationUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.publishableKey}` },
      body: JSON.stringify({ method: config.tokenMethod, number: card.number.replace(/\s/g, ""), expMonth: card.month, expYear: card.year, cvc: card.cvc }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details: string[] | undefined = body.details;
      return { ok: false, message: details?.length ? `Please check your card details: ${details.join("; ")}.` : (body.message ?? "The payment service rejected the card details.") };
    }
    return { ok: true, token: body.token, brand: body.brand, last4: body.last4 };
  } catch {
    return { ok: false, message: "We couldn't reach the payment service. You haven't been charged; please try again." };
  }
}

/** The gateway's documented test cards, for the demo helper panel. */
export async function fetchTestCards(url: string, method: "card" | "ebt"): Promise<TestCard[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const body = (await response.json()) as Partial<Record<"card" | "ebt", TestCard[]>>;
    return body[method] ?? [];
  } catch {
    return [];
  }
}

const DECLINE_MESSAGES: Record<string, string> = {
  card_declined: "Your card was declined. Please try a different card.",
  insufficient_funds: "There aren't enough funds on this card. Please try a different card.",
  expired_card: "This card has expired. Please use a different card.",
  incorrect_cvc: "The security code is incorrect. Please check it and try again.",
  invalid_number: "That card number isn't valid. Please check it and try again.",
  processing_error: "The bank had a problem processing this payment. Please try again in a moment.",
  invalid_token: "Your payment details timed out. Please enter them again.",
  unsupported_source: "That payment method can't be used for this order.",
};

export function declineMessage(declineCode: string | undefined): string {
  return (declineCode && DECLINE_MESSAGES[declineCode]) || "Your payment was declined. Please try a different card.";
}
