// GU47 phase 3 (4.7.1): the Cross Hop vivid look keeps the 4.6 chase camera and changes only light, sky, haze,
// floor and grade; its default is per view (starting theme), and every `?look=` switch still forces a look.
import { describe, expect, it } from "vitest";
import { VIVID_LOOKS, VIVID_DEFAULT_THEMES, defaultLookFor } from "../../../apps/showcase-cross-hop/src/game/look";
import { buildScene, setLookMode } from "../../../apps/showcase-cross-hop/src/game/core";

type Node = { kind?: string; light?: string; name?: string; shadow?: unknown; effect?: string; children?: Node[]; position?: number[]; rotation?: number[] };
const flat = (nodes: Node[]): Node[] => nodes.flatMap((n) => [n, ...flat(n.children ?? [])]);

describe("cross-hop vivid look (GU47 phase 3)", () => {
  it("has one look row per theme", () => {
    expect(VIVID_LOOKS).toHaveLength(6);
  });

  it("explicit ?look= wins; otherwise the panel list decides by starting theme (theme 0 when none)", () => {
    expect(defaultLookFor("original", 3)).toBe("original");
    expect(defaultLookFor("diorama", null)).toBe("diorama");
    expect(defaultLookFor("vivid", 0)).toBe("vivid");
    for (let t = 0; t < 6; t++) expect(defaultLookFor(null, t)).toBe(VIVID_DEFAULT_THEMES.includes(t) ? "vivid" : "original");
    expect(defaultLookFor(null, null)).toBe(defaultLookFor(null, 0));
    expect(defaultLookFor("bogus", 0)).toBe(defaultLookFor(null, 0));
  });

  it("builds the 4.6 camera with one shadowed sun, a gradient sky, no ambient and no sky boxes", () => {
    setLookMode("vivid");
    const vivid = buildScene() as { nodes: Node[]; camera?: { position?: number[]; fov?: number } };
    setLookMode("original");
    const original = buildScene() as { nodes: Node[]; camera?: { position?: number[]; fov?: number } };
    expect(vivid.camera).toEqual(original.camera);
    const all = flat(vivid.nodes);
    expect(all.filter((n) => n.kind === "light" && n.shadow)).toHaveLength(1);
    expect(all.filter((n) => n.kind === "light" && n.light === "ambient")).toHaveLength(0);
    expect(all.some((n) => n.name === "cross-hop sky")).toBe(true);
    expect(all.some((n) => n.name === "sky-backdrop" || n.name === "sun-disc")).toBe(false);
  });

  it("no distance haze by day (the panel called it washed out); haze only at dusk and night", () => {
    for (const t of [0, 1, 2, 5]) expect(VIVID_LOOKS[t]!.fog.density).toBe(0);
    for (const t of [3, 4]) expect(VIVID_LOOKS[t]!.fog.density).toBeGreaterThan(0);
  });
});
