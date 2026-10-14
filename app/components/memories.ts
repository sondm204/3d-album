import type { SavedMemory } from "@/lib/memories";

// Album rendering uses the API contract; optional place supports older page designs.
export type Memory = SavedMemory & { place?: string };

export function displayDate(value: string) {
  return value.split("-").reverse().join(" . ");
}
