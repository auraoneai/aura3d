import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PARK_LOOKS } from "../../../apps/showcase-aura-diamond-3d/art/look";
import { buildParkScene, DEFAULT_SCENE_CONTEXT, type DiamondSceneContext } from "../../../apps/showcase-aura-diamond-3d/src/scene";
import { PARKS, PARK_ORDER, type ParkId } from "../../../apps/showcase-aura-diamond-3d/src/rules";

const ROOT = join(__dirname, "../../..");

type Node = { readonly kind: string; readonly name?: string; readonly effect?: string; readonly children?: readonly Node[]; readonly [k: string]: unknown };

function flat(park: ParkId, ctx: DiamondSceneContext = DEFAULT_SCENE_CONTEXT): { nodes: Node[]; background: unknown } {
  const snap = buildParkScene(PARKS[park], ctx).toJSON() as { nodes: Node[]; background?: unknown };
  const out: Node[] = [];
  const walk = (list: readonly Node[]): void => {
    for (const n of list) {
      out.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(snap.nodes);
  return { nodes: out, background: snap.background };
}

const ORIGINAL: DiamondSceneContext = { variant: "original", tier: "high", skyMode: "analytic" };

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "public") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (/\.(ts|html|css|json)$/.test(name)) out.push(full);
  }
  return out;
}

describe("aura-diamond GU47 scene (DIA-L1, E1, E2, E3, P1)", () => {
  it("lights each park with exactly its own 1k HDRI", () => {
    for (const park of PARK_ORDER) {
      const envs = flat(park).nodes.filter((n) => n.kind === "environment");
      expect(envs.map((n) => n.name)).toEqual([`look hdri ${PARK_LOOKS[park].hdri.id}_1k`]);
    }
  });

  it("draws the analytic sky on Harbor, Canyon and Lunar and hides their HDRI; Midtown, Ivy and the Dome draw the HDRI", () => {
    for (const park of PARK_ORDER) {
      const { nodes } = flat(park);
      const skies = nodes.filter((n) => n.kind === "sky");
      const env = nodes.find((n) => n.kind === "environment");
      if (park === "sandlot" || park === "canyon" || park === "lunar") {
        expect(skies).toHaveLength(1);
        expect(env?.background).toBe(false);
      } else {
        expect(skies).toHaveLength(0);
        expect(env?.background).not.toBe(false);
      }
    }
    const dome = flat("dome").nodes.find((n) => n.kind === "environment");
    expect(dome?.background).toEqual({ visible: true, intensity: 0.85 });
    const lunarSky = flat("lunar").nodes.find((n) => n.kind === "sky") as { spec?: { stars?: { count: number }; sun?: unknown } } | undefined;
    expect(lunarSky?.spec?.stars?.count).toBe(1800);
    expect(lunarSky?.spec?.sun).toBeUndefined();
  });

  it("fogs every park but Lunar, keeps the look fog the active scene fog, and adds the Dome god rays on High only", () => {
    for (const park of PARK_ORDER) {
      const { nodes } = flat(park);
      const fogs = nodes.filter((n) => n.kind === "effect" && (n.effect === "fog" || n.effect === "volumetric-fog"));
      if (park === "lunar") {
        expect(fogs).toHaveLength(0);
        continue;
      }
      // LiveAtmosphere uses the last visible fog node in scene order: it must be the look's fog.
      expect(fogs.at(-1)?.name).toBe("look fog");
      expect(fogs.at(-1)?.color).toBe(PARK_LOOKS[park].fog ? (PARK_LOOKS[park].fog as { color: string }).color : undefined);
    }
    const godRays = (ctx: DiamondSceneContext) => flat("dome", ctx).nodes.filter((n) => n.effect === "volumetric-fog");
    expect(godRays(DEFAULT_SCENE_CONTEXT)).toHaveLength(1);
    expect(godRays({ ...DEFAULT_SCENE_CONTEXT, tier: "medium" })).toHaveLength(0);
  });

  it("grades each park with its own key, rim and broadcast grain (none on Low)", () => {
    for (const park of PARK_ORDER) {
      const { nodes, background } = flat(park);
      const key = nodes.find((n) => n.name === "look key light");
      expect(key?.color).toBe(PARK_LOOKS[park].sun.color);
      expect(key?.intensity).toBe(PARK_LOOKS[park].sun.intensity);
      expect(nodes.some((n) => n.name === "look rim light")).toBe(PARK_LOOKS[park].rim !== false);
      expect(nodes.find((n) => n.effect === "film-grain")?.intensity).toBe(0.03);
      // `effects.bloom` does not copy `name`, so the look's bloom node is found by its effect.
      const bloom = nodes.find((n) => n.effect === "bloom");
      expect(bloom?.threshold).toBe(PARK_LOOKS[park].post.bloom.threshold);
      expect(bloom?.intensity).toBe(PARK_LOOKS[park].post.bloom.intensity);
      expect(background).toBe(PARK_LOOKS[park].background);
      expect(flat(park, { ...DEFAULT_SCENE_CONTEXT, tier: "low" }).nodes.some((n) => n.effect === "film-grain")).toBe(false);
    }
  });

  it("keeps ?look=original on the 4.6.2 look: the park's engine look, no fog, no sky, the look's own backdrop", () => {
    const backdrops: Record<ParkId, string> = { sandlot: "golden-hour", skyline: "night-city", canyon: "overcast", ivy: "outdoor-day", dome: "interior-industrial", lunar: "polar-night" };
    for (const park of PARK_ORDER) {
      const { nodes, background } = flat(park, ORIGINAL);
      expect(nodes.some((n) => n.kind === "group" && n.name === `aura-look:${backdrops[park]}`)).toBe(true);
      expect(nodes.some((n) => n.kind === "sky")).toBe(false);
      expect(nodes.some((n) => n.effect === "fog" || n.effect === "film-grain" || n.effect === "volumetric-fog")).toBe(false);
      expect(typeof background).toBe("string");
    }
    expect(flat("sandlot", ORIGINAL).nodes.find((n) => n.name === "ball")?.material).toMatchObject({ color: "#f4f1e8" });
  });

  it("lights the night parks with their DIA-L2 rigs and keeps the key the only shadow caster", () => {
    const count = (park: ParkId, pred: (n: Node) => boolean, ctx: DiamondSceneContext = DEFAULT_SCENE_CONTEXT) => flat(park, ctx).nodes.filter(pred).length;
    const spot = (n: Node) => n.kind === "light" && n.light === "spot";
    const rect = (n: Node) => n.kind === "light" && n.light === "rect";
    const flare = (n: Node) => n.kind === "lensflare";
    const cone = (n: Node) => n.kind === "effect" && String(n.name ?? "").endsWith("-cone");
    expect([count("skyline", spot), count("skyline", flare), count("skyline", cone)]).toEqual([6, 2, 6]);
    expect([count("dome", rect), count("dome", (n) => n.name === "dome-truss-panels")]).toEqual([4, 1]);
    expect([count("lunar", spot), count("lunar", flare), count("lunar", cone)]).toEqual([4, 0, 4]);
    for (const park of ["sandlot", "canyon", "ivy"] as const) expect(count(park, (n) => spot(n) || rect(n))).toBe(0);
    // Ivy keeps its four light towers as dressing; the day has no lamps on.
    expect(count("ivy", (n) => n.kind === "model" && /^flood-\d$/.test(String(n.name)))).toBe(4);
    const low = { ...DEFAULT_SCENE_CONTEXT, tier: "low" as const };
    expect([count("skyline", spot, low), count("skyline", flare, low)]).toEqual([4, 0]);
    for (const park of PARK_ORDER) {
      const casters = flat(park).nodes.filter((n) => n.kind === "light" && (n.shadow === true || (typeof n.shadow === "object" && n.shadow !== null)));
      expect(casters.map((n) => n.name)).toEqual(["look key light"]);
    }
  });

  it("instances the Dome rafters and banners and the lunar regolith, and lets Canyon's rocks keep their textures (DIA-A1, M2, W2)", () => {
    const names = (park: ParkId, ctx: DiamondSceneContext = DEFAULT_SCENE_CONTEXT) => flat(park, ctx).nodes.map((n) => String(n.name));
    expect(names("dome").filter((n) => /^dome-(rafter|banner)-\d$/.test(n))).toHaveLength(0);
    expect(names("dome").filter((n) => n === "dome-rafters" || n === "dome-banners")).toHaveLength(2);
    expect(names("lunar").filter((n) => /^regolith-\d$/.test(n))).toHaveLength(0);
    expect(names("lunar").filter((n) => n === "regolith-mounds")).toHaveLength(1);
    expect(names("dome", ORIGINAL).filter((n) => /^dome-(rafter|banner)-\d$/.test(n))).toHaveLength(9);
    const rocks = flat("canyon").nodes.filter((n) => /^canyon-rock-\d$/.test(String(n.name)));
    expect(rocks).toHaveLength(5);
    for (const rock of rocks) expect((rock as { materialOverrides?: unknown }).materialOverrides).toBeUndefined();
    expect(flat("lunar").nodes.find((n) => n.name === "lunar-earth")?.runtime).toBeDefined();
  });

  it("instances the field's repeated pieces and the stadium shells in both looks (DIA-W2)", () => {
    for (const ctx of [DEFAULT_SCENE_CONTEXT, ORIGINAL]) {
      const nodes = flat("sandlot", ctx).nodes;
      const names = nodes.map((n) => String(n.name));
      for (const old of ["infield-dirt", "home-dirt", "mound", "mound-rubber", "home-plate", "dugout-l", "dugout-r", "stadium-shell-c"]) expect(names).not.toContain(old);
      expect(names.filter((n) => /^(base-dirt|base-bag|foul-line|foul-pole|foul-pole-glow|basepath)-[-\d]/.test(n))).toHaveLength(0);
      for (const merged of ["field-clay", "field-basepaths", "base-bags", "field-plates", "field-chalk", "foul-poles", "foul-pole-glows", "dugouts", "stadium-shells"]) {
        expect(names.filter((n) => n === merged)).toHaveLength(1);
      }
    }
  });

  it("drizzles over Midtown only (DIA-E4), lighter on Low and under reduced motion", () => {
    const rain = (park: ParkId, ctx: DiamondSceneContext = DEFAULT_SCENE_CONTEXT) => flat(park, ctx).nodes.filter((n) => n.effect === "rain");
    for (const park of PARK_ORDER) expect(rain(park)).toHaveLength(park === "skyline" ? 1 : 0);
    const high = rain("skyline")[0]!;
    expect(high.color).toBe(PARK_LOOKS.skyline.weather?.color);
    const calm = rain("skyline", { ...DEFAULT_SCENE_CONTEXT, reducedMotion: true })[0]!;
    expect(Number(calm.particleCount)).toBe(Number(high.particleCount) / 2);
    expect(Number(rain("skyline", { ...DEFAULT_SCENE_CONTEXT, tier: "low" })[0]!.particleCount)).toBeLessThan(Number(high.particleCount));
    expect(rain("skyline", ORIGINAL)).toHaveLength(0);
  });

  it("drops the 16-sphere fake tracer and the scene ribbon in GU47 (main.ts runs one runtime trail); the original keeps both", () => {
    const tracer = (ctx: DiamondSceneContext) => flat("sandlot", ctx).nodes.filter((n) => /^ball-trail-\d+$/.test(String(n.name)) || n.name === "ball-ribbon").length;
    expect(tracer(DEFAULT_SCENE_CONTEXT)).toBe(0);
    expect(tracer(ORIGINAL)).toBe(17);
  });

  it("paints the ball, and only the ball, in the reserved #f5f1e4", () => {
    for (const park of PARK_ORDER) {
      const owners = flat(park).nodes.filter((n) => JSON.stringify((n as { material?: unknown }).material ?? {}).toLowerCase().includes("#f5f1e4"));
      expect(owners.map((n) => n.name)).toEqual(["ball"]);
    }
  });

  it("has removed the three backdrop hexes copied from Hoops from the whole app folder (DIA-E1)", () => {
    const text = filesUnder(join(ROOT, "apps/showcase-aura-diamond-3d")).map((f) => readFileSync(f, "utf8").toLowerCase()).join("\n");
    for (const h of ["#c98a5a", "#070a12", "#9db8cf"]) expect(text.includes(h)).toBe(false);
  });
});
