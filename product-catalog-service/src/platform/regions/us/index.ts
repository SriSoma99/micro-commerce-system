import { createGatewayPaymentProvider, createPayAtPickupProvider } from "../../httpPaymentProvider";
import { usRetailReceipt } from "../../receipts/usRetailReceipt";
import { RegionPack } from "../../types";
import { demoTaxTableProvider, US_JURISDICTIONS } from "./demoTaxTable";

/**
 * United States: prices shown tax-exclusive, sales tax added at checkout by
 * jurisdiction, imperial units, USD. Card and EBT go through the local dummy
 * payment gateway (`payment-simulator`) via an HTTP adapter; a real gateway
 * (e.g. Stripe) is one more adapter registered in its place.
 */
export const usRegionPack: RegionPack = {
  code: "US",
  displayName: "United States",
  defaults: {
    currency: "USD",
    locale: "en-US",
    priceMode: "tax-exclusive",
    units: "imperial",
    taxProvider: "demo-table",
    payments: ["card-mock", "pay-at-pickup"],
    receipt: "us-retail",
  },
  taxProviders: [demoTaxTableProvider],
  paymentProviders: [
    createGatewayPaymentProvider(
      { id: "card-mock", displayName: "Credit / debit card", kind: "card", tokenMethod: "card" },
      { simulated: true }
    ),
    createGatewayPaymentProvider(
      { id: "ebt-mock", displayName: "SNAP / EBT", kind: "benefit", tokenMethod: "ebt" },
      { simulated: true }
    ),
    createPayAtPickupProvider({ id: "pay-at-pickup", displayName: "Pay at pickup", kind: "offline" }),
  ],
  receiptTemplates: [usRetailReceipt],
  jurisdictions: US_JURISDICTIONS,
  address: {
    country: "US",
    regionPattern: "^[A-Za-z]{2}$",
    regionExample: "IL",
    postalCodePattern: "^\\d{5}(-\\d{4})?$",
    postalCodeExample: "60510",
  },
};
