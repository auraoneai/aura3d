/**
 * Journey totals across chapters. Each chapter is its own page load, so the per-chapter numbers are written to
 * sessionStorage when the rider takes a chapter's portal and summed when the last chapter finishes.
 */
import type { Sim } from "./sim";

export const JOURNEY_KEY = "duneglide.journey.v1";

export interface ChapterRecord { readonly elapsed: number; readonly restored: number; readonly impacts: number }
/** Keyed by chapter index; replaying a chapter replaces its record instead of adding to it. */
export type Journey = Readonly<Record<string, ChapterRecord>>;

export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

export const recordOf = (sim: Pick<Sim, "state" | "flight">): ChapterRecord => ({ elapsed: sim.state.elapsed, restored: sim.state.restored.length, impacts: sim.flight.impacts });

export function readJourney(storage: StorageLike | undefined): Journey {
  try {
    const raw = storage?.getItem(JOURNEY_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, ChapterRecord> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, Partial<ChapterRecord>>)) {
      if (!/^[0-6]$/.test(k) || !v) continue;
      const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : 0);
      out[k] = { elapsed: num(v.elapsed), restored: num(v.restored), impacts: num(v.impacts) };
    }
    return out;
  } catch {
    return {};
  }
}

export function writeChapter(storage: StorageLike | undefined, chapter: number, record: ChapterRecord): Journey {
  const next = { ...readJourney(storage), [String(chapter)]: record };
  try { storage?.setItem(JOURNEY_KEY, JSON.stringify(next)); } catch { /* storage full or blocked: totals fall back to this chapter */ }
  return next;
}

export function clearJourney(storage: StorageLike | undefined): void {
  try { storage?.removeItem(JOURNEY_KEY); } catch { /* blocked */ }
}

export interface JourneyTotals { readonly elapsed: number; readonly restored: number; readonly impacts: number; readonly chapters: number }

/** Totals of the stored chapters plus the chapter being flown now (which replaces any stored record for it). */
export function journeyTotals(journey: Journey, chapter: number, current: ChapterRecord): JourneyTotals {
  const all: Record<string, ChapterRecord> = { ...journey, [String(chapter)]: current };
  const records = Object.values(all);
  return {
    elapsed: records.reduce((a, r) => a + r.elapsed, 0),
    restored: records.reduce((a, r) => a + r.restored, 0),
    impacts: records.reduce((a, r) => a + r.impacts, 0),
    chapters: records.length
  };
}

export const ratingOf = (impacts: number): string => (impacts === 0 ? "Glass-smooth" : impacts <= 3 ? "Steady hand" : "Rough landings");
