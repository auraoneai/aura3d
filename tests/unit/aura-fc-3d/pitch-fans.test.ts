import { describe, expect, it } from "vitest";
import { buildFcScene, pitchFanClip, tickWorld, PITCH_FANS } from "../../../apps/showcase-aura-fc-3d/src/game/scene";
import type { VenueId } from "../../../apps/showcase-aura-fc-3d/src/game/types";

/**
 * Meshy-07 (FC47-AN1): six rigged fans stand at the far rail on the bowl venues, mounted visible at full scale (the
 * hidden-skinned-model trap), idle by default and cheer / fist-pump while the crowd cheers. The original look and the
 * venues without a bowl do not mount them.
 */
function fans(venue: VenueId, lookMode?: "original" | "hybrid" | "gu47") {
  const j = JSON.parse(JSON.stringify(buildFcScene(venue, lookMode ? { lookMode } : {})));
  const out: any[] = [];
  const walk = (n: any) => { out.push(n); for (const c of n.children ?? []) walk(c); };
  (j.nodes as any[]).forEach(walk);
  return out.filter((n) => /^fc-fan-\d+$/.test(n.name ?? ""));
}

describe("aura-fc-3d front-row fans", () => {
  it("bowl venues mount six visible, idling fan models on the default (hybrid) and gu47 looks", () => {
    for (const venue of ["munich", "kyoto", "lagos", "glacier"] as const) {
      for (const look of [undefined, "gu47"] as const) {
        const f = fans(venue, look);
        expect(f.length).toBe(PITCH_FANS.length);
        for (const n of f) {
          expect(n.kind).toBe("model");
          expect(n.visible).not.toBe(false);
          expect(n.animation).toMatchObject({ clip: "idle", loop: true });
        }
      }
    }
  });

  it("the original look and the venues without a bowl mount none", () => {
    expect(fans("munich", "original")).toEqual([]);
    expect(fans("favela")).toEqual([]);
    expect(fans("uyuni")).toEqual([]);
  });

  it("fans idle, then cheer and pump alternately while the crowd cheers, switching clip only on a change", () => {
    expect(pitchFanClip(0, false)).toBe("idle");
    expect([0, 1, 2, 3].map((i) => pitchFanClip(i, true))).toEqual(["cheer", "pump", "cheer", "pump"]);
    const calls: any[][] = PITCH_FANS.map(() => []);
    const h: any = { nets: [], netBacks: [], fans: PITCH_FANS.map((_, i) => ({ setAnimation: (a: any) => calls[i]!.push(a) })), fanClips: [] };
    tickWorld(h, 10, { cheering: false, ripple: 0 });
    tickWorld(h, 10.1, { cheering: false, ripple: 0 });
    expect(calls.every((c) => c.length === 1 && c[0].clip === "idle")).toBe(true);
    tickWorld(h, 11, { cheering: true, ripple: 0 });
    expect(calls.map((c) => c.at(-1).clip)).toEqual(PITCH_FANS.map((_, i) => (i % 2 === 0 ? "cheer" : "pump")));
    expect(calls[0]!.at(-1)).toMatchObject({ loop: true, startTime: 11 });
  });
});
