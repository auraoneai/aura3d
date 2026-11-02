// GU47 phase 3 (4.7.1): the Cross Hop vivid look keeps the 4.6 chase camera and changes only light, sky, haze,
// floor and grade; its default is per view (starting theme), and every `?look=` switch still forces a look.
import { describe, expect, it } from "vitest";
import { VIVID_LOOKS, VIVID_DEFAULT_THEMES, TURF_BAND_M, TURF_BAND_X, defaultLookFor, turfFor, vividFloorFor } from "../../../apps/showcase-cross-hop/src/game/look";
import { bindApp, buildScene, setLookMode, setP4Dress, startRun, syncVisuals } from "../../../apps/showcase-cross-hop/src/game/core";
import { STRIP_W, THEMES } from "../../../apps/showcase-cross-hop/src/game/themes";

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

// GU47 phase 8: the mint turf (striped meadow, identity colour "chalk mint") on the four green-ground day themes of the vivid look.
// Presentation only; the lane types, their order and every collision value are untouched (run-logic tests unchanged).
type Inst = { position: number[]; scale: number[] };
type Pool = { specs: Inst[]; cols: string[] };
function syncedPools(mode: "vivid" | "original", theme: number): Record<string, Pool> {
  const pools: Record<string, Pool> = {};
  const mk = (id: string) => ({
    setPosition() {}, setScale() {}, setRotation() {}, setAnimation() {}, setVisible() {}, setMaterial() {},
    setInstances(specs: Inst[], cols: string[]) {
      pools[id] = { specs: specs.map((s) => ({ position: [...s.position], scale: [...s.scale] })), cols: [...cols] };
    }
  });
  const handles = new Map<string, ReturnType<typeof mk>>();
  const get = (id: string) => { if (!handles.has(id)) handles.set(id, mk(id)); return handles.get(id)!; };
  bindApp({
    nodes: { add: () => undefined, remove: () => undefined, require: get, get },
    camera: { setPose() {} },
    output: { setOutputOverlay() {} },
    effects: { burst() {} }
  } as never);
  setLookMode(mode);
  setP4Dress(true);
  startRun("quick", null, 7, theme);
  syncVisuals(1);
  return pools;
}
const live = (p: Pool | undefined, colour: string): Inst[] =>
  (p?.specs ?? []).filter((s, i) => s.position[1] > -900 && p!.cols[i] === colour);
const liveCount = (p: Pool | undefined): number => (p?.specs ?? []).filter((s) => s.position[1] > -900).length;

describe("cross-hop mint turf (GU47 phase 8)", () => {
  const hex = /^#[0-9a-f]{6}$/;

  it("has a turf row on the four green-ground day themes and none on the dusk and night themes", () => {
    for (const t of [0, 1, 2, 5]) {
      const turf = VIVID_LOOKS[t]!.turf!;
      expect(turf, `theme ${t}`).toBeDefined();
      for (const c of [turf.meadow, turf.stripe, turf.floor]) expect(c).toMatch(hex);
      expect(turf.stripe).not.toBe(turf.meadow);
      expect(vividFloorFor(t)).toBe(turf.floor);
    }
    for (const t of [3, 4]) {
      expect(VIVID_LOOKS[t]!.turf).toBeUndefined();
      expect(vividFloorFor(t)).toBe(VIVID_LOOKS[t]!.floor);
    }
  });

  it("is mint, not the olive lawn of pips-big-leap: every turf colour is cyan-ward of green", () => {
    // Hue of the spec colour. The vivid light lowers blue most (0.55-0.72 against 0.70-0.77 for red, sampled on the
    // g14p7-c1 frames), so a spec hue of 150 or more renders at about 133 (golden hour) to 168 degrees (candy dusk), against
    // Pip's lawn at a rendered hue of about 92.
    const hue = (c: string): number => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255) as [number, number, number];
      const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
      return mx === g ? 60 * (2 + (b - r) / d) : mx === r ? 60 * (((g - b) / d) % 6) : 60 * (4 + (r - g) / d);
    };
    for (const t of [0, 1, 2, 5]) {
      const turf = VIVID_LOOKS[t]!.turf!;
      for (const c of [turf.meadow, turf.stripe, turf.floor]) {
        expect(hue(c), `theme ${t} ${c}`).toBeGreaterThanOrEqual(150);
        expect(hue(c), `theme ${t} ${c}`).toBeLessThanOrEqual(175);
      }
    }
  });

  it("answers only in the vivid look, so the 4.6 and diorama looks keep the theme palette", () => {
    for (let t = 0; t < 6; t++) {
      expect(turfFor("original", t)).toBeUndefined();
      expect(turfFor("diorama", t)).toBeUndefined();
      expect(turfFor("vivid", t)).toBe(VIVID_LOOKS[t]!.turf);
    }
  });

  it("bands tile the lane strip exactly: 17 flush 2 m bands, symmetric about the start column", () => {
    expect(TURF_BAND_M).toBe(2);
    expect(TURF_BAND_X).toHaveLength(17);
    expect(TURF_BAND_X[8]).toBe(0);
    for (let i = 0; i < TURF_BAND_X.length; i++) expect(TURF_BAND_X[i]! + TURF_BAND_X[TURF_BAND_X.length - 1 - i]!).toBe(0);
    for (let i = 1; i < TURF_BAND_X.length; i++) expect(TURF_BAND_X[i]! - TURF_BAND_X[i - 1]!).toBe(TURF_BAND_M);
    expect(TURF_BAND_X[0]! - TURF_BAND_M / 2).toBe(-STRIP_W / 2);
    expect(TURF_BAND_X[TURF_BAND_X.length - 1]! + TURF_BAND_M / 2).toBe(STRIP_W / 2);
  });

  it("draws each vivid meadow row as 9 base and 8 lighter bands, and keeps the 4.6 look on one full-width strip", () => {
    for (const t of [0, 1, 2, 5]) {
      const turf = VIVID_LOOKS[t]!.turf!;
      const vivid = syncedPools("vivid", t);
      const base = live(vivid["pool-ground"], turf.meadow);
      const light = live(vivid["pool-ground"], turf.stripe);
      const rows = base.length / 9;
      expect(rows, `theme ${t} meadow rows`).toBeGreaterThan(0);
      expect(Number.isInteger(rows)).toBe(true);
      expect(light).toHaveLength(8 * rows);
      for (const b of [...base, ...light]) expect(b.scale[0]).toBe(TURF_BAND_M);
      // The theme's own meadow colour is not drawn in the vivid look: lanes, banks and tufts all use the turf.
      expect(live(vivid["pool-ground"], THEMES[t]!.palette.meadow)).toHaveLength(0);

      const original = syncedPools("original", t);
      const strips = live(original["pool-ground"], THEMES[t]!.palette.meadow);
      expect(strips).toHaveLength(rows);
      for (const s of strips) expect(s.scale[0]).toBe(STRIP_W);
      expect(live(original["pool-ground"], turf.meadow)).toHaveLength(0);
      expect(live(original["pool-ground"], turf.stripe)).toHaveLength(0);
    }
  });

  it("leaves the dusk and night themes as before: one full-width strip in the palette meadow, no turf colour", () => {
    for (const t of [3, 4]) {
      const vivid = syncedPools("vivid", t);
      const original = syncedPools("original", t);
      const meadow = THEMES[t]!.palette.meadow;
      const strips = live(vivid["pool-ground"], meadow);
      expect(strips.length).toBeGreaterThan(0);
      expect(strips).toHaveLength(live(original["pool-ground"], meadow).length);
      for (const s of strips) expect(s.scale[0]).toBe(STRIP_W);
      for (const row of VIVID_LOOKS) if (row.turf) {
        expect(live(vivid["pool-ground"], row.turf.meadow)).toHaveLength(0);
        expect(live(vivid["pool-ground"], row.turf.stripe)).toHaveLength(0);
      }
    }
  });

  it("does not touch the detail pool, which Emberline and Neon already overflow at 260: same demand in the vivid and 4.6 looks", () => {
    for (let t = 0; t < 6; t++) {
      const vivid = liveCount(syncedPools("vivid", t)["pool-detail"]);
      const original = liveCount(syncedPools("original", t)["pool-detail"]);
      expect(vivid, `theme ${t}`).toBe(original);
      expect(vivid).toBeLessThanOrEqual(260);
    }
  });
});
