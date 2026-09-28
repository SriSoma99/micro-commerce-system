export interface PickupSlot {
  id: string;
  storeId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  label: string; // e.g. "Today, 2:00 PM - 3:00 PM"
  capacity: number;
  reserved: number;
  available: boolean;
}

export type OrderFulfillmentStatus = "payment_pending" | "placed" | "packed" | "ready" | "collected" | "cancelled";
