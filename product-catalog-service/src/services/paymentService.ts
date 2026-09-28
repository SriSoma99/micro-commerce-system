import { getPlatform } from "../platform/platform";
import { PaymentMethodInfo, PaymentProvider } from "../platform/types";

/**
 * The payment methods this install enabled (with the browser-side tokenization
 * config for gateway-backed ones), or `undefined` before setup.
 */
export function getEnabledPaymentMethods(): PaymentMethodInfo[] | undefined {
  return getPlatform()?.payments.map((provider) => provider.method);
}

/** The enabled provider for a method id - a method the installer didn't enable is not usable. */
export function findEnabledProvider(methodId: string): PaymentProvider | undefined {
  return getPlatform()?.payments.find((provider) => provider.method.id === methodId);
}
