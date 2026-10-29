import { describe, expect, it } from "vitest";
import { engineVoice } from "../../../examples/heatsink-port/audio";
import { MODELS, MODELS_LITE, modelSet } from "../../../examples/heatsink-port/models";
import { STRIKE } from "../../../examples/heatsink-port/operation";
import { Track } from "../../../examples/heatsink-port/track";
import { BLOOM, buildWorld } from "../../../examples/heatsink-port/world";

interface JsonNode { readonly kind?: string; readonly name?: string; readonly effect?: string; readonly primitive?: string; readonly postAuthored?: readonly string[]; readonly threshold?: number; readonly intensity?: number; readonly asset?: { readonly url?: string }; readonly [k: string]: unknown }

const nodes = (quality: "high" | "low" = "high"): JsonNode[] => ((buildWorld(new Track(), quality).scene.toJSON() as unknown as { nodes?: JsonNode[] }).nodes ?? []);
const byName = (list: JsonNode[], name: string): JsonNode | undefined => list.find((n) => n.name === name);

describe("heatsink-port scene fixes", () => {
  it("bloom authors no deprecated radius, a threshold at HDR white and an intensity under the noise-risk line (HP-19)", () => {
    const bloom = nodes().find((n) => n.effect === "bloom")!;
    expect(bloom).toBeDefined();
    expect(bloom.postAuthored ?? []).not.toContain("radius");
    expect(bloom.threshold).toBeGreaterThanOrEqual(1);
    expect(BLOOM.intensity).toBeLessThanOrEqual(0.62);
  });

  it("puts a contact-shadow blob under the drone (HP-08)", () => {
    expect(byName(nodes(), "drone-blob")).toBeDefined();
  });

  it("gives heavy targets their own silhouette and every target a health ring (HP-17)", () => {
    const list = nodes();
    const heavyIds = Array.from({ length: STRIKE.perLap }, (_, i) => i).filter((i) => i % 4 === 3);
    for (const id of heavyIds) expect(byName(list, `target-ring2-${id}`), `heavy ${id}`).toBeDefined();
    expect(byName(list, "target-ring2-0")).toBeUndefined();
    for (let id = 0; id < STRIKE.perLap; id++) expect(byName(list, `target-hp-${id}`)).toBeDefined();
    const heavyCore = JSON.stringify(byName(list, `target-${heavyIds[0]}`));
    const sentryCore = JSON.stringify(byName(list, "target-0"));
    expect(heavyCore).not.toEqual(sentryCore.replace(/target-0/g, `target-${heavyIds[0]}`));
  });

  it("the low tier loads the lite model set, the high tier the full one (HP-12)", () => {
    expect(modelSet("low")).toBe(MODELS_LITE);
    expect(modelSet("high")).toBe(MODELS);
    for (const key of Object.keys(MODELS) as (keyof typeof MODELS)[]) {
      expect(String(MODELS_LITE[key].url)).toContain("/models-lite/");
      expect(String(MODELS[key].url)).not.toContain("/models-lite/");
    }
    expect(JSON.stringify(nodes("low"))).toContain("/models-lite/");
    expect(JSON.stringify(nodes("high"))).not.toContain("/models-lite/");
  });
});

describe("engine voice (HP-16)", () => {
  it("rises in pitch with speed, stays quiet, and is silent when stopped or inactive", () => {
    const idle = engineVoice(0, 0, true), slow = engineVoice(0.3, 1, true), fast = engineVoice(1, 1, true);
    expect(idle.gain).toBe(0);
    expect(fast.freq).toBeGreaterThan(slow.freq);
    expect(slow.freq).toBeGreaterThanOrEqual(70);
    expect(fast.gain).toBeLessThan(0.06);
    expect(engineVoice(1, 1, false).gain).toBe(0);
  });
});
