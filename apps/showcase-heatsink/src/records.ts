/**
 * Best lap and ghost trace per circuit and drone (audit C9), kept in localStorage. Storage failures (private mode,
 * quota) fall back to memory for the session.
 */
import type { CircuitId, DroneId } from "./data";
import type { GhostTrace } from "./sim";

export interface LapRecord {
  readonly bestLap: number | null;
  readonly ghost: GhostTrace | null;
}

const KEY = "thermal-drift.records.v1";
const memory = new Map<string, LapRecord>();

const keyOf = (circuit: CircuitId, drone: DroneId): string => `${circuit}:${drone}`;

function readAll(): Record<string, LapRecord> {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, LapRecord>) : {};
  } catch {
    return {};
  }
}

function valid(record: unknown): record is LapRecord {
  if (!record || typeof record !== "object") return false;
  const r = record as LapRecord;
  const lapOk = r.bestLap === null || (typeof r.bestLap === "number" && Number.isFinite(r.bestLap) && r.bestLap > 0);
  const ghostOk = r.ghost === null || (typeof r.ghost === "object" && typeof r.ghost.lapSeconds === "number" && Array.isArray(r.ghost.samples) && r.ghost.samples.every((s) => typeof s === "number" && Number.isFinite(s)));
  return lapOk && ghostOk;
}

export function loadRecord(circuit: CircuitId, drone: DroneId): LapRecord | null {
  const key = keyOf(circuit, drone);
  const stored = readAll()[key];
  if (valid(stored)) return stored;
  return memory.get(key) ?? null;
}

export function saveRecord(circuit: CircuitId, drone: DroneId, record: LapRecord): void {
  const key = keyOf(circuit, drone);
  memory.set(key, record);
  try {
    const all = readAll();
    all[key] = record;
    globalThis.localStorage?.setItem(KEY, JSON.stringify(all));
  } catch {
    /* memory only */
  }
}
