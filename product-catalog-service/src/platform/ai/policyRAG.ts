export interface PolicyDocument {
  id: string;
  topic: "returns_and_refunds" | "perishable_goods" | "snap_ebt" | "pickup_sla" | "inventory_transfers";
  title: string;
  summary: string;
  rules: string[];
  instantAutoApproveLimitMinor?: number; // e.g. 2500 = $25.00
  keywords: string[];
}

export const STORE_POLICIES: PolicyDocument[] = [
  {
    id: "POL-001",
    topic: "perishable_goods",
    title: "Perishable Produce, Dairy & Meat Freshness Guarantee",
    summary: "100% money-back freshness guarantee for spoiled, bruised, or damaged perishable items within 48 hours of pickup.",
    rules: [
      "Perishable items (produce, fresh meat, dairy, chilled juice) qualify for 100% refund within 48 hours of curbside pickup or receipt.",
      "Instant automated AI resolution is permitted for verified perishable damage claims under or equal to $25.00 total.",
      "Claims exceeding $25.00 or repeated claims from suspicious accounts require human supervisor review and approval draft creation.",
      "Customers are not required to physically return spoiled perishable food to the store.",
      "Refunds are processed back to the original payment method with an instant digital Credit Note (CR-XXXX)."
    ],
    instantAutoApproveLimitMinor: 2500, // $25.00
    keywords: ["berries", "milk", "meat", "produce", "moldy", "squished", "damaged", "rotten", "perishable", "spoil", "sour", "freshness"]
  },
  {
    id: "POL-002",
    topic: "returns_and_refunds",
    title: "Non-Perishable General Grocery Return Policy",
    summary: "Standard 30-day return policy for unopened shelf-stable packaged goods with digital invoice/receipt.",
    rules: [
      "Unopened non-perishable packaged items can be returned within 30 calendar days of purchase.",
      "A valid invoice number (e.g. INV-IL01-00042) or order reference is required.",
      "Opened or tampered canned/dry goods cannot be returned unless defective or recalled.",
      "Refunds are credited to the original credit/debit card, EBT card, or store credit."
    ],
    instantAutoApproveLimitMinor: 2500,
    keywords: ["return", "refund", "receipt", "invoice", "cereal", "pasta", "canned", "non-perishable", "30 days", "unopened"]
  },
  {
    id: "POL-003",
    topic: "snap_ebt",
    title: "SNAP / EBT USDA Eligibility Guidelines",
    summary: "USDA regulatory compliance rules for SNAP/EBT food benefit payments and split tender.",
    rules: [
      "SNAP/EBT benefits can only purchase staple food items, produce, dairy, breads, cereals, and non-alcoholic beverages.",
      "Hot prepared foods, alcohol, vitamins, pet food, and paper/household goods are strictly SNAP-ineligible.",
      "Sales tax is legally exempt on all SNAP-eligible food purchases in participating jurisdictions.",
      "Split tender checkout allows paying eligible food lines with EBT and remaining non-food items with credit/debit card."
    ],
    keywords: ["snap", "ebt", "food stamps", "usda", "eligible", "tax exempt", "split tender", "benefits"]
  },
  {
    id: "POL-004",
    topic: "pickup_sla",
    title: "Curbside Pickup & Slot Rescheduling SLA",
    summary: "Store pickup time slot scheduling, 1-hour fulfillment windows, and customer rescheduling grace periods.",
    rules: [
      "Customers must select a 1-hour pickup window during checkout.",
      "Orders are packed in temperature-controlled chillers up to 30 minutes prior to the pickup window.",
      "Customers may reschedule their pickup slot free of charge up to 1 hour before the start of the scheduled window.",
      "Unclaimed orders are held until the end of business day; perishable items are returned to stock or marked down after 24 hours."
    ],
    keywords: ["pickup", "slot", "curbside", "reschedule", "time", "hours", "late", "window", "collect"]
  },
  {
    id: "POL-005",
    topic: "inventory_transfers",
    title: "Inter-Store Stock Transfer Guidelines",
    summary: "Operational rules for moving inventory between retail stores in the same or neighboring districts.",
    rules: [
      "Inter-store stock transfers are permitted between stores in the same state or regional cluster (e.g. IL-01 <-> IL-02, OH-01 <-> OH-02).",
      "Transfers require positive on-hand inventory balance exceeding the source store's low-stock safety threshold.",
      "A transfer tracking number (TRF-XXXX) is atomically issued upon dispatch and completes upon destination receiving."
    ],
    keywords: ["transfer", "inter-store", "move stock", "rebalance", "warehouse", "between stores", "dispatch"]
  }
];

export function queryStorePolicies(query: string, topicFilter?: string): PolicyDocument[] {
  const cleanQuery = query.toLowerCase();
  const words = cleanQuery.split(/\s+/).filter((w) => w.length > 2);

  return STORE_POLICIES.filter((doc) => {
    if (topicFilter && doc.topic !== topicFilter) return false;
    const matchKeyword = doc.keywords.some((kw) => cleanQuery.includes(kw) || words.some((w) => kw.includes(w)));
    const matchText = doc.title.toLowerCase().includes(cleanQuery) || doc.summary.toLowerCase().includes(cleanQuery);
    const matchRules = doc.rules.some((r) => words.some((w) => r.toLowerCase().includes(w)));
    return matchKeyword || matchText || matchRules;
  });
}
