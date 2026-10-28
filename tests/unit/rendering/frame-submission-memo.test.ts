import { describe, expect, it } from "vitest";
import { computeProgramKey, type ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import { createRegistry, type QrFlags, type RegistryEntry } from "../../../packages/rendering/src/contracts/core";
import { withCoreOutputOff } from "../../../packages/rendering/src/renderer/coreOutputPostRoute";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { parseHrefCached } from "../../../packages/engine/src/contracts/urlCache";

/** Reference serialiser: the pre-memo implementation of `computeProgramKey`, kept here so the memo is checked against it. */
function referenceKey(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(referenceKey).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${referenceKey(v)}`).join(",")}}`;
}

function features(overrides: Partial<ProgramFeatures> = {}): ProgramFeatures {
  const defaults: Partial<ProgramFeatures> = { lighting: "lit", environment: "equirect", features: { "a3d.output.srgb": true } };
  return normalizeProgramFeatures({ ...defaults, ...overrides });
}

describe("computeProgramKey memo", () => {
  it("returns exactly the canonical serialisation, for repeated, reordered and sparse records", () => {
    const base = features();
    for (let round = 0; round < 3; round += 1) {
      expect(computeProgramKey(base)).toBe(referenceKey(base));
      // A rebuilt record with the keys in another order keys the same (the canonical form sorts).
      const reordered = JSON.parse(JSON.stringify({ ...base, features: { z: 1, a: 2 } })) as ProgramFeatures;
      const shuffled = Object.fromEntries(Object.entries(reordered).reverse()) as unknown as ProgramFeatures;
      expect(computeProgramKey(shuffled)).toBe(referenceKey(shuffled));
    }
    const withUndefined = { ...base, skinning: undefined } as ProgramFeatures;
    expect(computeProgramKey(withUndefined)).toBe(referenceKey(withUndefined));
    expect(computeProgramKey(withUndefined)).toBe(computeProgramKey(base));
  });

  it("distinguishes records that differ in any field, including after an identical one was memoised", () => {
    const a = features();
    computeProgramKey(a);
    const variants: ProgramFeatures[] = [
      features({ lighting: "unlit" }),
      features({ doubleSided: true }),
      features({ lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } }),
      features({ features: { "a3d.output.srgb": false } }),
      features({ features: { "a3d.output.srgb": true, extra: "x" } }),
      features({ maps: { baseColor: { uvSet: 0, transform: false } } })
    ];
    const keys = new Set([computeProgramKey(a), ...variants.map((variant) => computeProgramKey(variant))]);
    expect(keys.size).toBe(variants.length + 1);
    for (const variant of variants) expect(computeProgramKey(variant)).toBe(referenceKey(variant));
  });

  it("is not aliased to a record the caller mutates afterwards", () => {
    const mutable = { ...features(), features: { "a3d.output.srgb": true } } as { features: Record<string, unknown> } & ProgramFeatures;
    const before = computeProgramKey(mutable);
    mutable.features["a3d.output.srgb"] = false;
    const after = computeProgramKey(mutable);
    expect(after).not.toBe(before);
    expect(after).toBe(referenceKey(mutable));
    mutable.features["a3d.output.srgb"] = true;
    expect(computeProgramKey(mutable)).toBe(before);
  });
});

describe("registry active() memo", () => {
  interface Entry extends RegistryEntry { readonly tag: string }
  const flagsOf = (names: readonly string[]): QrFlags => {
    const values = Object.freeze(Object.fromEntries(names.map((name) => [name, true])));
    return { values, on: (name) => values[name as keyof typeof values] === true } as QrFlags;
  };

  it("returns the same list for the same flags until the registry changes, and honours registration order rules", () => {
    const registry = createRegistry<Entry>("test");
    registry.register({ id: "b", owner: "prd01", flag: "A3D_QR_CORE", tag: "b", order: 1 });
    registry.register({ id: "a", owner: "prd01", flag: "A3D_QR_CORE", tag: "a", order: 1 });
    registry.register({ id: "off", owner: "prd01", flag: "A3D_QR_POST", tag: "off" });
    const flags = flagsOf(["A3D_QR_CORE"]);
    const first = registry.active(flags);
    expect(first.map((e) => e.id)).toEqual(["a", "b"]);
    expect(registry.active(flags)).toBe(first);
    const unregister = registry.register({ id: "c", owner: "prd01", flag: "A3D_QR_CORE", tag: "c", order: 0 });
    const second = registry.active(flags);
    expect(second).not.toBe(first);
    expect(second.map((e) => e.id)).toEqual(["c", "a", "b"]);
    unregister();
    expect(registry.active(flags).map((e) => e.id)).toEqual(["a", "b"]);
    // Different flags are different answers.
    expect(registry.active(flagsOf(["A3D_QR_POST"])).map((e) => e.id)).toEqual(["off"]);
  });

  it("never caches flags that are not immutable (test doubles, mutable on())", () => {
    const registry = createRegistry<Entry>("test-mutable");
    registry.register({ id: "x", owner: "prd01", flag: "A3D_QR_CORE", tag: "x" });
    let enabled = false;
    const flags = { values: {}, on: () => enabled } as unknown as QrFlags;
    expect(registry.active(flags)).toEqual([]);
    enabled = true;
    expect(registry.active(flags).map((e) => e.id)).toEqual(["x"]);
    const bare = { on: () => enabled } as unknown as QrFlags;
    enabled = false;
    expect(registry.active(bare)).toEqual([]);
    enabled = true;
    expect(registry.active(bare).map((e) => e.id)).toEqual(["x"]);
  });
});

describe("per-frame flag derivations", () => {
  it("withCoreOutputOff yields one stable object per input flags and keeps its meaning", () => {
    const flags = resolveQrFlags({ options: "all" });
    const derived = withCoreOutputOff(flags);
    expect(withCoreOutputOff(flags)).toBe(derived);
    expect(derived.on("A3D_QR_CORE_OUTPUT")).toBe(false);
    expect(derived.values.A3D_QR_CORE_OUTPUT).toBe(false);
    expect(derived.on("A3D_QR_LIGHTING")).toBe(flags.on("A3D_QR_LIGHTING"));
    expect(Object.isFrozen(derived.values)).toBe(true);
    // Flags whose values are not frozen are derived afresh each time (they may still change).
    const loose: QrFlags = { values: { A3D_QR_CORE: true }, on: () => true };
    expect(withCoreOutputOff(loose)).not.toBe(withCoreOutputOff(loose));
  });

  it("parseHrefCached reuses the parse for an equal href and re-parses a different one", () => {
    const one = parseHrefCached("http://localhost/?a3d-qr=lighting");
    expect(parseHrefCached("http://localhost/?a3d-qr=lighting")).toBe(one);
    const two = parseHrefCached("http://localhost/?a3d-qr=post");
    expect(two.searchParams.get("a3d-qr")).toBe("post");
    expect(parseHrefCached("http://localhost/?a3d-qr=lighting").searchParams.get("a3d-qr")).toBe("lighting");
    // The URL option of resolveQrFlags goes through the same cache and still honours the list.
    expect(resolveQrFlags({ url: "http://localhost/?a3d-qr=lighting" }).on("A3D_QR_LIGHTING")).toBe(true);
    expect(resolveQrFlags({ url: "http://localhost/?a3d-qr=-lighting" }).on("A3D_QR_LIGHTING")).toBe(false);
  });
});
