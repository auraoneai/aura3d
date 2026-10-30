/**
 * Thermal Drift VFX pack (GU47 WP-13 HS-13): six registered presets, the event -> burst map, camera ownership and the
 * reduced-motion path (PRD §6.3: emission halves, flashes capped at 0.3).
 */
import { describe, expect, it } from "vitest";
import type { AuraVfxEffectSpec } from "@aura3d/engine";
import {
  anchorPosition,
  burstOptions,
  EXHAUST_PLUME,
  presetCount,
  registerThermalDriftVfx,
  TD_VFX_KINDS,
  TD_VFX_PRESETS,
  VfxLedger,
  vfxForEvent
} from "../../../apps/showcase-heatsink/src/vfx";
import type { SimEvent } from "../../../apps/showcase-heatsink/src/sim";

describe("heatsink VFX pack", () => {
  it("defines the six td-* presets, named after their kind, with no camera layer (the chase camera owns shake)", () => {
    expect(TD_VFX_KINDS).toEqual(["td-slag-burst", "td-ember-hit", "td-wall-scrape", "td-coolant-burst", "td-boost-flare", "td-shock"]);
    for (const kind of TD_VFX_KINDS) {
      const spec = TD_VFX_PRESETS[kind];
      expect(spec.name).toBe(kind);
      expect(spec.layers.some((l) => l.type === "emitter"), kind).toBe(true);
      expect(spec.layers.some((l) => l.type === "camera"), kind).toBe(false);
    }
    expect(EXHAUST_PLUME.layers.every((l) => l.type === "emitter")).toBe(true);
  });

  it("registers every preset on the app's effects surface", () => {
    const seen = new Map<string, AuraVfxEffectSpec>();
    const kinds = registerThermalDriftVfx({ registerPreset: (kind, spec) => { seen.set(kind, spec); } });
    expect(kinds).toEqual(TD_VFX_KINDS);
    expect([...seen.keys()]).toEqual([...TD_VFX_KINDS]);
    expect(registerThermalDriftVfx(undefined)).toEqual([]);
  });

  it("maps gameplay events to bursts and leaves the rest silent", () => {
    const cases: [SimEvent, string | null][] = [
      [{ type: "barrel" }, "td-slag-burst"],
      [{ type: "takedown", name: "Vex", by: "laser" }, "td-slag-burst"],
      [{ type: "destroyed" }, "td-slag-burst"],
      [{ type: "hit", name: "Vex" }, "td-ember-hit"],
      [{ type: "damage", amount: 20, source: "missile" }, "td-ember-hit"],
      [{ type: "damage", amount: 5, source: "scrape" }, null],
      [{ type: "scrape" }, "td-wall-scrape"],
      [{ type: "pickup", kind: "boost", item: null }, "td-boost-flare"],
      [{ type: "pickup", kind: "coolant", item: null }, "td-coolant-burst"],
      [{ type: "pickup", kind: "shield", item: null }, "td-coolant-burst"],
      [{ type: "shock", hits: 2 }, "td-shock"],
      [{ type: "countdown", value: 3 }, null],
      [{ type: "lap", lap: 1, lapSeconds: 60, best: false, trace: null }, null],
      [{ type: "overheat" }, null]
    ];
    for (const [event, kind] of cases) expect(vfxForEvent(event)?.kind ?? null, event.type).toBe(kind);
  });

  it("keeps coolant cyan for the coolant burst only", () => {
    const usesCyan = (spec: AuraVfxEffectSpec) => JSON.stringify(spec).toLowerCase().includes("#35d6ff");
    expect(TD_VFX_KINDS.filter((kind) => usesCyan(TD_VFX_PRESETS[kind]))).toEqual(["td-coolant-burst"]);
  });

  it("reduced motion halves emission and caps the flash at 0.3; the camera is never shaken by a burst", () => {
    for (const kind of TD_VFX_KINDS) {
      const full = burstOptions(kind, false, 3);
      expect(full).toEqual({ camera: false, seed: 3 });
      const reduced = burstOptions(kind, true, 3);
      expect(reduced.camera).toBe(false);
      expect(reduced.count).toBe(Math.max(1, Math.round(presetCount(kind) / 2)));
      expect(reduced.count!).toBeLessThan(presetCount(kind));
      expect(reduced.intensity).toBe(0.3);
    }
  });

  it("places bursts around the drone and counts them", () => {
    const out: [number, number, number] = [0, 0, 0];
    expect(anchorPosition("player", [1, 1.5, -0.4], null, out)).toEqual([1, 1.5, -0.4]);
    expect(anchorPosition("wall", [-3, 1.5, -0.4], null, out)[0]).toBe(-10.5);
    expect(anchorPosition("target", [0, 1.5, -0.4], [2, 1.4, -20], out)).toEqual([2, 1.4, -20]);
    expect(anchorPosition("target", [0, 1.5, -0.4], null, out)[2]).toBeCloseTo(-14.4, 6);
    const ledger = new VfxLedger();
    ledger.note("td-shock");
    ledger.note("td-shock");
    ledger.note("td-ember-hit");
    expect(ledger.total).toBe(3);
    expect(ledger.fired["td-shock"]).toBe(2);
    ledger.reset();
    expect(ledger.total).toBe(0);
  });
});
