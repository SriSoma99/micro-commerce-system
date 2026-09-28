import { getDb } from "../db/database";
import { PickupSlot } from "../types/fulfilment";

const DEFAULT_SLOT_CAPACITY = 10;
const START_HOUR = 9; // 9:00 AM
const END_HOUR = 20; // 8:00 PM

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}

function formatTime(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatHourLabel(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:00 ${period}`;
}

export function generatePickupSlots(storeId: string, daysAhead = 3): PickupSlot[] {
  const slots: PickupSlot[] = [];
  const now = new Date();
  const db = getDb();

  for (let d = 0; d < daysAhead; d++) {
    const day = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    const dateStr = formatDate(day);

    const dayLabel = d === 0 ? "Today" : d === 1 ? "Tomorrow" : day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

    for (let h = START_HOUR; h < END_HOUR; h++) {
      const slotId = `${storeId}_${dateStr}_${String(h).padStart(2, "0")}`;
      const startTime = formatTime(h);
      const endTime = formatTime(h + 1);

      // Count existing active orders for this slot
      let reserved = 0;
      try {
        const row = db
          .prepare(
            `SELECT COUNT(*) as count FROM orders WHERE store_id = ? AND json_extract(configuration_json, '$.pickupSlotId') = ? AND status <> 'cancelled'`
          )
          .get(storeId, slotId) as { count: number } | undefined;
        reserved = row?.count ?? 0;
      } catch {
        // configuration_json on orders or fallback
      }

      const available = reserved < DEFAULT_SLOT_CAPACITY;
      const label = `${dayLabel}, ${formatHourLabel(h)} – ${formatHourLabel(h + 1)}`;

      slots.push({
        id: slotId,
        storeId,
        date: dateStr,
        startTime,
        endTime,
        label,
        capacity: DEFAULT_SLOT_CAPACITY,
        reserved,
        available,
      });
    }
  }

  return slots;
}

export function isValidPickupSlot(storeId: string, slotId: string): boolean {
  const slots = generatePickupSlots(storeId);
  const found = slots.find((s) => s.id === slotId);
  return found !== undefined && found.available;
}
