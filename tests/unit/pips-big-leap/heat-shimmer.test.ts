// GU47 WP-16 (G06) PBL-V3 heat-shimmer half: a w4-only custom post pass, mounted with the world and
// removed when the world changes; none under reduced motion (PRD 6.3) or on the Low tier.
import { describe, expect, it } from "vitest";
import { buildWorld } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";
import { HEAT_SHIMMER_GLSL, dioramaName, heatShimmerPass } from "../../../apps/showcase-pips-big-leap/src/game/diorama";
import { WORLD_IDS, WORLD_LOOKS, presentationScale } from "../../../apps/showcase-pips-big-leap/src/game/looks";
import { createDioramaPresentation } from "../../../apps/showcase-pips-big-leap/src/game/presentation";

const full = presentationScale(false);
const reduced = presentationScale(true);

function fakeApp() {
  const live = new Set<string>();
  const added: string[] = [];
  return {
    live,
    added,
    app: {
      post: {
        setEffect: () => undefined,
        addPostPass: (p: { name: string }) => {
          live.add(p.name);
          added.push(p.name);
          return () => { live.delete(p.name); };
        }
      }
    }
  };
}

describe("pips-big-leap heat shimmer (PBL-V3)", () => {
  it("builds the pass for w4 only", () => {
    for (const id of WORLD_IDS) {
      const pass = heatShimmerPass(WORLD_LOOKS[id], full);
      expect(pass !== null, id).toBe(id === "w4");
    }
    const pass = heatShimmerPass(WORLD_LOOKS.w4, full)!;
    expect(pass.name).toBe(dioramaName.heatShimmer);
    expect(pass.insertAt).toBe("before-tonemap");
    expect(pass.fragment.glsl).toBe(HEAT_SHIMMER_GLSL);
    expect(pass.uniforms).toEqual({ u_pixels: 1.6, u_band: 0.55, u_speed: 1 });
  });

  it("only resamples colour (no additive term) and never redeclares the prelude built-ins", () => {
    expect(HEAT_SHIMMER_GLSL).not.toMatch(/#version|precision|uniform sampler2D u_color|uniform float u_time|uniform vec2 u_texelSize/);
    expect(HEAT_SHIMMER_GLSL).toMatch(/outColor = c;/);
    expect(WORLD_LOOKS.w4.heatShimmer!.pixels).toBeLessThanOrEqual(2);
  });

  it("drops the pass under reduced motion and on the Low tier", () => {
    expect(heatShimmerPass(WORLD_LOOKS.w4, reduced)).toBeNull();
    expect(heatShimmerPass(WORLD_LOOKS.w4, full, true)).toBeNull();
  });

  it("adds the pass when w4 mounts and removes it when another world mounts", () => {
    const fake = fakeApp();
    const p = createDioramaPresentation(fake.app, { mode: "diorama", reducedMotion: false, heroNode: "hero", gateRingNode: "ring" });
    p.worldMounted(buildWorld(worldSpec("w3")));
    expect(fake.live.size).toBe(0);
    p.worldMounted(buildWorld(worldSpec("w4")));
    expect([...fake.live]).toEqual([dioramaName.heatShimmer]);
    expect(p.evidence().heatShimmer).toBe(true);
    p.worldMounted(buildWorld(worldSpec("w4")));
    expect(fake.live.size).toBe(1);
    p.worldMounted(buildWorld(worldSpec("w5")));
    expect(fake.live.size).toBe(0);
    expect(p.evidence().heatShimmer).toBe(false);
  });

  it("never adds the pass under reduced motion or in the original look", () => {
    for (const [mode, reducedMotion] of [["diorama", true], ["original", false]] as const) {
      const fake = fakeApp();
      const p = createDioramaPresentation(fake.app, { mode, reducedMotion, heroNode: "hero", gateRingNode: "ring" });
      p.worldMounted(buildWorld(worldSpec("w4"), mode === "original" ? { look: "original" } : {}));
      expect(fake.added, mode).toEqual([]);
    }
  });
});
