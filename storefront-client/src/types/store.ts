export interface PaymentMethodInfo {
  id: string;
  displayName: string;
  kind: "card" | "wallet" | "benefit" | "offline";
  /** True for demo modules: the UI must show a "simulated payments" notice. */
  simulated: boolean;
  /** Present for gateway methods: where the BROWSER sends card details to get a one-time token. */
  clientConfig?: {
    tokenizationUrl: string;
    publishableKey: string;
    testCardsUrl?: string;
    tokenMethod: "card" | "ebt";
  };
}

export interface StoreLocation {
  id: string;
  name: string;
  taxJurisdiction: string;
}

export interface PublicStoreConfig {
  region: string;
  currency: string;
  locale: string;
  priceMode: "tax-exclusive" | "tax-inclusive";
  units: "imperial" | "metric";
  stores: StoreLocation[];
  paymentMethods: PaymentMethodInfo[];
  paymentSimulation: boolean;
}

export type StoreConfig = PublicStoreConfig;
