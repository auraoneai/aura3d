import { describe, expect, it } from "vitest";
import { FLARE_TOWERS, floodFlareNodes } from "../../../apps/showcase-aura-fc-3d/src/game/scene";
import { MAIN_FLOOD_TOWER, VENUE_LOOKS } from "../../../apps/showcase-aura-fc-3d/src/game/look";
import type { VenueId } from "../../../apps/showcase-aura-fc-3d/src/game/types";

const node = (b: unknown) => ((b as { toJSON?: () => unknown }).toJSON?.() ?? b) as { kind: string; name: string; elements: { color?: string }[]; intensity: number; occlusion: string };

/** GU47 WP-19 FC47-P3 (lane g09): lens flares on the two main banks at night only. */
describe("aura-fc-3d lens flares (FC47-P3)", () => {
  it("night venues flare the main-stand bank and its partner; day venues none", () => {
    expect(FLARE_TOWERS).toContain(MAIN_FLOOD_TOWER);
    for (const id of Object.keys(VENUE_LOOKS) as VenueId[]) {
      const flares = floodFlareNodes(id, "gu47").map(node);
      if (!VENUE_LOOKS[id].floodShadow) { expect(flares).toHaveLength(0); continue; }
      expect(flares).toHaveLength(2);
      for (const f of flares) {
        expect(f.kind).toBe("lensflare");
        expect(f.occlusion).toBe("frustum");
        expect(f.elements).toHaveLength(3);
        expect(f.elements.every((e) => e.color === VENUE_LOOKS[id].floodColor)).toBe(true);
      }
      expect(flares.find((f) => f.name === `fc-flood-flare-${MAIN_FLOOD_TOWER}`)!.intensity).toBeGreaterThan(flares.find((f) => f.name !== `fc-flood-flare-${MAIN_FLOOD_TOWER}`)!.intensity);
    }
  });
});
