/**
 * 5.0 A5 lab (EXPERIMENTAL, `?lighting=probes`, default OFF): a per-floor `NativeLightProbeGrid` that gives each floor the
 * soft bounced light its practical fixtures would throw onto the concrete. The 4.x rig has direct light only (no GI), so
 * the shadow side of every pool is flat. Probes are filled analytically from the floor's own fixture cells and lamp colour
 * (no baking, nothing authored in the scene): irradiance falls off with distance and is cut where a wall blocks the line.
 * Pure data + one adapter; the sim, the light rig and every asset id are untouched.
 */
import { NativeLightProbeGrid } from "@aura3d/engine/lighting";
import { CELL, parseFloor } from "../maps";
import { fixtureCells, floorDefOfSlot, lookOfSlot, wallHeightOfSlot } from "./look";

export const PROBE_FLAG = "lighting";
export const PROBE_FLAG_VALUE = "probes";
/** Scale on the fixture term: the bounce is a fill, never a second key. */
export const PROBE_BOUNCE_GAIN = 0.55;
export const PROBE_MAX_AXIS = 16;

export function probesRequested(search: string | undefined): boolean {
  if (!search) return false;
  return new URLSearchParams(search).get(PROBE_FLAG)?.trim().toLowerCase() === PROBE_FLAG_VALUE;
}

const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

export interface ProbeFloorPlan {
  readonly min: [number, number, number];
  readonly max: [number, number, number];
  readonly dimensions: [number, number, number];
  /** Linear RGB irradiance per probe, x fastest, then y, then z. */
  readonly irradiance: readonly (readonly [number, number, number])[];
}

/** True when the straight line between two world XZ points crosses a solid cell (sampled at quarter-cell steps). */
function blocked(isOpen: (cx: number, cz: number) => boolean, ax: number, az: number, bx: number, bz: number): boolean {
  const dist = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(dist / (CELL / 4)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!isOpen(Math.floor((ax + (bx - ax) * t) / CELL), Math.floor((az + (bz - az) * t) / CELL))) return true;
  }
  return false;
}

/** Pure: the probe plan for a floor slot (deterministic, no engine calls). */
export function planFloorProbes(slot: number): ProbeFloorPlan {
  const def = floorDefOfSlot(slot);
  const look = lookOfSlot(slot);
  const { w, h, at } = parseFloor(def);
  const wallH = wallHeightOfSlot(slot);
  const isOpen = (cx: number, cz: number) => { const ch = at(cx, cz); return ch !== "#" && ch !== "%" && ch !== " " && ch !== "P"; };
  const dims: [number, number, number] = [Math.min(PROBE_MAX_AXIS, Math.max(2, w)), 3, Math.min(PROBE_MAX_AXIS, Math.max(2, h))];
  const min: [number, number, number] = [CELL * 0.5, 0.5, CELL * 0.5];
  const max: [number, number, number] = [CELL * (w - 0.5), Math.max(1.5, wallH - 0.4), CELL * (h - 0.5)];
  const lamp = hexToLinear(look.lamp.color);
  const fixtures = fixtureCells(def).map((c) => [(c[0] + 0.5) * CELL, (c[1] + 0.5) * CELL] as const);
  const reach = look.fixtures.distance * 1.4;
  const strength = look.fixtures.intensity * PROBE_BOUNCE_GAIN * 0.06;
  const irradiance: [number, number, number][] = [];
  for (let k = 0; k < dims[2]; k++) for (let j = 0; j < dims[1]; j++) for (let i = 0; i < dims[0]; i++) {
    const px = min[0] + ((max[0] - min[0]) * i) / (dims[0] - 1);
    const py = min[1] + ((max[1] - min[1]) * j) / (dims[1] - 1);
    const pz = min[2] + ((max[2] - min[2]) * k) / (dims[2] - 1);
    let e = 0;
    if (isOpen(Math.floor(px / CELL), Math.floor(pz / CELL))) {
      for (const [fx, fz] of fixtures) {
        const dx = fx - px, dz = fz - pz, dy = wallH - py;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > reach * reach || blocked(isOpen, px, pz, fx, fz)) continue;
        e += 1 / (1 + d2 / 6);
      }
    }
    e *= strength;
    irradiance.push([lamp[0] * e, lamp[1] * e, lamp[2] * e]);
  }
  return { min, max, dimensions: dims, irradiance };
}

/** Builds a grid for `slot`, filled from `planFloorProbes`. The caller owns it (detach, then `dispose`). */
export function buildFloorProbeGrid(slot: number): NativeLightProbeGrid {
  const plan = planFloorProbes(slot);
  const grid = new NativeLightProbeGrid({ min: plan.min, max: plan.max, dimensions: plan.dimensions });
  let n = 0;
  for (let k = 0; k < plan.dimensions[2]; k++) for (let j = 0; j < plan.dimensions[1]; j++) for (let i = 0; i < plan.dimensions[0]; i++) {
    grid.setProbeIrradiance(i, j, k, plan.irradiance[n++]!);
  }
  return grid;
}

interface LightingHost {
  attachIndirect(source: { kind: "probe-grid"; grid: NativeLightProbeGrid }, options?: { intensity?: number; outside?: "null" | "clamp" }): () => void;
}

/** Swaps the attached grid to `slot`'s. `attach` returns false (and leaves 4.x lighting) when the renderer refuses it. */
export function createProbeController(lighting: () => LightingHost | undefined) {
  let detach: (() => void) | null = null;
  let grid: NativeLightProbeGrid | null = null;
  let attachedSlot = -1;
  const release = () => {
    try { detach?.(); } finally { detach = null; try { grid?.dispose(); } finally { grid = null; } }
  };
  return {
    attach(slot: number): boolean {
      if (slot === attachedSlot && detach) return true;
      const host = lighting();
      if (!host) return false;
      release();
      attachedSlot = -1;
      try {
        grid = buildFloorProbeGrid(slot);
        detach = host.attachIndirect({ kind: "probe-grid", grid }, { intensity: 1, outside: "null" });
        attachedSlot = slot;
        return true;
      } catch (error) {
        release();
        console.warn("[bunker-zero] ?lighting=probes unavailable, staying on 4.x lighting:", error instanceof Error ? error.message : error);
        return false;
      }
    },
    dispose: release
  };
}
