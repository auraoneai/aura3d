import { describe, expect, it } from "vitest";
import { allMaterialLobes, registerMaterialLobe, type MaterialLobe } from "../../../packages/rendering/src/contracts/materialLobes";
import { isReplaySafePrd04Lobe, PRD04_MATERIAL_LOBES } from "../../../packages/rendering/src/materials/lobes";

describe("direct replay lobe identity", () => {
  it("enumerates unknown registrations without reading their metadata or proxy descriptors", () => {
    let metadataReads = 0;
    let descriptorReads = 0;
    const candidate = new Proxy({
      id: "prd04.replayUnknown", owner: "prd04", get flag() { metadataReads += 1; return "A3D_QR_MATERIALS"; },
      chunks: { pars: "", fragment: "" }, samplerSlots: [], feature: () => undefined, bind: () => {}
    }, {
      getOwnPropertyDescriptor() { descriptorReads += 1; throw new Error("unexpected proxy descriptor read"); }
    }) as MaterialLobe;
    const unregister = registerMaterialLobe(candidate);
    // The registry captures immutable activation metadata at registration;
    // enumeration and replay preflight must not inspect the provider again.
    metadataReads = 0;
    descriptorReads = 0;
    try {
      expect(allMaterialLobes().some(entry => entry === candidate)).toBe(true);
      expect(isReplaySafePrd04Lobe(candidate)).toBe(false);
      expect(metadataReads).toBe(0);
      expect(descriptorReads).toBe(0);
    } finally {
      unregister();
    }
  });

  it("rejects replaced data with accessors in lobe, chunk and slot objects without invoking them", () => {
    const lobe = PRD04_MATERIAL_LOBES.find(entry => entry.id === "clearcoat")!;
    const locations: readonly (readonly [object, PropertyKey])[] = [
      [lobe, "flag"], [lobe, "feature"], [lobe, "chunks"], [lobe.chunks, "pars"], [lobe.samplerSlots, "0"]
    ];
    expect(isReplaySafePrd04Lobe(lobe)).toBe(true);
    for (const [target, key] of locations) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key)!;
      let calls = 0;
      Object.defineProperty(target, key, { configurable: true, enumerable: descriptor.enumerable,
        get() { calls += 1; throw new Error("unexpected lobe getter"); } });
      try {
        expect(isReplaySafePrd04Lobe(lobe)).toBe(false);
        expect(calls).toBe(0);
      } finally {
        Object.defineProperty(target, key, descriptor);
      }
      expect(isReplaySafePrd04Lobe(lobe)).toBe(true);
    }
  });

  it("rejects cloned lobes and mutated nested data, prototypes and descriptors", () => {
    const lobe = PRD04_MATERIAL_LOBES.find(entry => entry.id === "clearcoat")!;
    expect(isReplaySafePrd04Lobe({ ...lobe })).toBe(false);
    const original = Object.getOwnPropertyDescriptor(lobe.chunks, "pars")!;
    Object.defineProperty(lobe.chunks, "pars", { ...original, value: "altered" });
    try { expect(isReplaySafePrd04Lobe(lobe)).toBe(false); }
    finally { Object.defineProperty(lobe.chunks, "pars", original); }
    const previousPrototype = Object.getPrototypeOf(lobe.samplerSlots);
    Object.setPrototypeOf(lobe.samplerSlots, null);
    try { expect(isReplaySafePrd04Lobe(lobe)).toBe(false); }
    finally { Object.setPrototypeOf(lobe.samplerSlots, previousPrototype); }
    expect(isReplaySafePrd04Lobe(lobe)).toBe(true);
  });
});
