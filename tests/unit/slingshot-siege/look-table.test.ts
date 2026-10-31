// GU47 WP-22 (lane g12): the slingshot-siege look table, stage lighting/post/sky per chapter, the VFX preset pack
// and the reduced-motion path (PRD §6.3). Static checks on authored nodes; pixels are phase 2.
import { describe, expect, it } from "vitest";
import { CHAPTERS } from "../../../apps/showcase-slingshot-siege/src/game/levels";
import { CHAPTER_LOOKS, SIEGE_PALETTE, chapterLook, sunDirection } from "../../../apps/showcase-slingshot-siege/src/game/look";
import { SIEGE_AO_NODE, SIEGE_DOF_NODE, SOLID_BLOCK_MATERIALS, buildStage } from "../../../apps/showcase-slingshot-siege/src/game/stage";
import { AMMO_TRAIL_COLOR, SIEGE_VFX, abilityPreset, breakPreset, siegeVfxPresets } from "../../../apps/showcase-slingshot-siege/src/game/vfx";

type Node = { kind?: string; name?: string; light?: string; effect?: string; shadow?: unknown; spec?: { model?: string }; children?: readonly Node[]; [key: string]: unknown };
const walk = (nodes: readonly unknown[]): Node[] => nodes.flatMap((n) => {
  const node = (typeof (n as { toJSON?: unknown }).toJSON === "function" ? (n as { toJSON(): Node }).toJSON() : n) as Node;
  return [node, ...walk(node.children ?? [])];
});
const stage = (chapter: number, reducedMotion = false) => walk(buildStage(CHAPTERS[chapter]!, { reducedMotion }).nodes);

describe("slingshot-siege look table (SS47-E1, L1, P2, P3)", () => {
  it("has one row per chapter, in chapter order", () => {
    expect(CHAPTER_LOOKS.map((r) => r.chapter)).toEqual(CHAPTERS.map((c) => c.id));
    expect(chapterLook(99).chapter).toBe(5);
    expect(chapterLook(-3).chapter).toBe(0);
  });

  it("walks the sun through one day: elevations 38/62/48/22/16/30", () => {
    expect(CHAPTER_LOOKS.map((r) => r.sun.elevationDeg)).toEqual([38, 62, 48, 22, 16, 30]);
    const d = sunDirection({ elevationDeg: 90, azimuthDeg: 0 });
    expect(d[1]).toBeCloseTo(1, 6);
  });

  it("names its own preset and environment per chapter, with at least 4 distinct environment sources", () => {
    expect(CHAPTER_LOOKS.map((r) => r.preset)).toEqual(["outdoor-day", "outdoor-day", "outdoor-day", "golden-hour", "golden-hour", "polar-night"]);
    expect(CHAPTER_LOOKS.map((r) => r.hdri ?? `${r.preset} default`)).toEqual([
      "spruit_sunrise", "outdoor-midday", "spruit_sunrise", "kloppenheim_06_puresky", "belfast_sunset_puresky", "deep_space_starfield"
    ]);
    expect(new Set(CHAPTER_LOOKS.map((r) => r.hdri ?? r.preset)).size).toBeGreaterThanOrEqual(4);
    expect(CHAPTER_LOOKS[2]!.environmentIntensity).toBe(1.0);
    expect(CHAPTER_LOOKS[5]!.environmentIntensity).toBe(1.8);
  });

  it("neighbouring chapters differ in sky model or colour, sun, fog and grade", () => {
    for (let i = 1; i < CHAPTER_LOOKS.length; i += 1) {
      const a = CHAPTER_LOOKS[i - 1]!;
      const b = CHAPTER_LOOKS[i]!;
      expect(a.sun.color, `ch${i - 1}/ch${i} sun`).not.toBe(b.sun.color);
      expect(a.fog.color, `ch${i - 1}/ch${i} fog`).not.toBe(b.fog.color);
      expect(JSON.stringify(a.sky), `ch${i - 1}/ch${i} sky`).not.toBe(JSON.stringify(b.sky));
      expect(a.grade.temperature, `ch${i - 1}/ch${i} grade`).not.toBe(b.grade.temperature);
    }
  });

  it("output preset per chapter; warm grade at golden hour and sunset, cool at night", () => {
    expect(CHAPTER_LOOKS.map((r) => r.post)).toEqual(["daylight-outdoor", "daylight-outdoor", "daylight-outdoor", "cinematic-film", "cinematic-film", "neon-night"]);
    expect(CHAPTER_LOOKS[3]!.grade.temperature).toBeGreaterThan(0.2);
    expect(CHAPTER_LOOKS[4]!.grade.temperature).toBeGreaterThan(0.2);
    expect(CHAPTER_LOOKS[5]!.grade.temperature).toBeLessThan(-0.1);
  });

  it("bloom threshold 0.95 by day and 0.6 at night; vignette 0.18 by day and 0.3 at night", () => {
    expect(CHAPTER_LOOKS[0]!.bloom.threshold).toBe(0.95);
    expect(CHAPTER_LOOKS[1]!.bloom.threshold).toBe(0.95);
    expect(CHAPTER_LOOKS[5]!.bloom.threshold).toBe(0.6);
    expect(CHAPTER_LOOKS[0]!.vignette).toBe(0.18);
    expect(CHAPTER_LOOKS[5]!.vignette).toBe(0.3);
  });

  it("pennant red by day, lantern amber at night; one island palette", () => {
    expect(CHAPTER_LOOKS.slice(0, 5).every((r) => r.accent === SIEGE_PALETTE.pennantRed)).toBe(true);
    expect(CHAPTER_LOOKS[5]!.accent).toBe(SIEGE_PALETTE.lanternAmber);
    expect(CHAPTER_LOOKS.every((r) => r.terrain.sand === "#e9d6a8" && r.terrain.sea === "#2f8f9d")).toBe(true);
  });

  it("GU47 phase 3: every day sun is on the camera side (lights the cliff faces, never in frame); fog is past the horizon", () => {
    for (const r of CHAPTER_LOOKS.slice(0, 5)) {
      const d = sunDirection(r.sun);
      expect(d[2], `ch${r.chapter} sun z`).toBeGreaterThan(0.25);
      expect(r.fog.near, `ch${r.chapter} fog near`).toBeGreaterThanOrEqual(300);
      expect(r.flare).toBe(false);
      expect(r.weather === "mist" || r.weather === "drizzle").toBe(false);
      expect(r.worldWater && r.rockTexture && r.solidBlocks).toBe(false);
      expect(r.rockTexture && r.solidBlocks && !r.worldWater && !r.skyFog).toBe(true);
    }
    const night = CHAPTER_LOOKS[5]!;
    expect([night.worldWater, night.rockTexture, night.solidBlocks, night.skyFog]).toEqual([true, false, false, true]);
  });
});

describe("slingshot-siege stage per chapter (SS47-L1, L2, L3, E1, E2, E3, P1)", () => {
  it("no ambient or hemisphere light; exactly one shadowed light (the look's PCSS sun, 2 cascades fitted to the island)", () => {
    for (const c of CHAPTERS) {
      const lights = stage(c.id).filter((n) => n.kind === "light");
      expect(lights.some((l) => l.light === "ambient" || l.light === "hemisphere"), `ch${c.id}`).toBe(false);
      const shadowed = lights.filter((l) => l.shadow);
      expect(shadowed, `ch${c.id}`).toHaveLength(1);
      expect(shadowed[0]!.name).toBe("look key light");
      expect(shadowed[0]!.shadow).toMatchObject({ filter: "pcss", cascades: 2, fit: { extent: 13.5 } });
    }
  });

  it("fog is back on in every chapter (no fogDensityScale 0)", () => {
    for (const c of CHAPTERS) {
      const fog = stage(c.id).filter((n) => n.name === "look fog");
      expect(fog, `ch${c.id}`).toHaveLength(1);
      expect(fog[0]!.color).toBe(CHAPTER_LOOKS[c.id]!.fog.color);
    }
  });

  it("points only on ch4/ch5, the lighthouse spot only on ch5, no sun flare (GU47 phase 2: it drew a screen-wide glow blob)", () => {
    const names = (c: number) => stage(c).map((n) => n.name ?? "");
    CHAPTERS.forEach((c) => {
      const n = names(c.id);
      expect(n.includes("siege window gatehouse"), `ch${c.id} windows`).toBe(c.id === 4 || c.id === 5);
      expect(n.includes("siege lighthouse"), `ch${c.id} lighthouse`).toBe(c.id === 5);
      expect(n.includes("siege sun flare"), `ch${c.id} flare`).toBe(false);
    });
  });

  it("a real sky per chapter: gradient by day, Preetham at golden hour and sunset, stars at night", () => {
    const models = CHAPTERS.map((c) => stage(c.id).find((n) => n.kind === "sky")?.spec?.model);
    expect(models).toEqual(["gradient", "gradient", "gradient", "gradient", "gradient", "gradient"]);
    const night = stage(5).find((n) => n.kind === "sky")!.spec as unknown as { stars?: { count: number } };
    expect(night.stars?.count).toBeGreaterThan(500);
  });

  it("the night sea is one world-water ocean with shoreline foam; the day chapters show the flat seabed sea", () => {
    for (let c = 0; c <= 4; c += 1) {
      const day = stage(c);
      expect(day.some((n) => n.kind === "water"), `ch${c}`).toBe(false);
      expect(day.some((n) => n.name === "stage-ocean"), `ch${c}`).toBe(true);
    }
    const nodes = stage(5);
    const sea = nodes.filter((n) => n.kind === "water");
    expect(sea).toHaveLength(1);
    expect(sea[0]!.options).toMatchObject({ kind: "ocean", shape: { kind: "infinite" }, waves: "calm", foam: { shoreDepth: 0.35 } });
    expect(nodes.some((n) => n.name === "shore-foam")).toBe(false);
  });

  it("signature tilt-shift DOF, miniature AO radius and sun contact shadows; the look's own AO and bloom are replaced", () => {
    const nodes = stage(0);
    const dof = nodes.find((n) => n.name === SIEGE_DOF_NODE)!;
    expect(dof.effect).toBe("depth-of-field");
    expect(dof.tiltShift).toMatchObject({ bandWidth: CHAPTER_LOOKS[0]!.dof.bandWidth });
    const ao = nodes.find((n) => n.name === SIEGE_AO_NODE)!;
    expect(ao.radius as number).toBeLessThan(0.74);
    expect(nodes.some((n) => n.effect === "contact-shadows")).toBe(true);
    expect(nodes.some((n) => n.name === "look ambient occlusion" || n.name === "look bloom")).toBe(false);
    expect(nodes.find((n) => n.name === "siege bloom")!.threshold).toBe(0.95);
    expect(stage(5).find((n) => n.name === "siege bloom")!.threshold).toBe(0.6);
  });
});

describe("slingshot-siege reduced motion (PRD §6.3)", () => {
  it("drops the vignette, keeps FXAA and the signature DOF, slows the sea", () => {
    const calm = stage(0, true);
    const full = stage(0, false);
    expect(calm.some((n) => n.effect === "vignette")).toBe(false);
    expect(full.some((n) => n.effect === "vignette")).toBe(true);
    expect(calm.some((n) => n.effect === "anti-alias")).toBe(true);
    expect(calm.some((n) => n.name === SIEGE_DOF_NODE)).toBe(true);
    const night = { calm: stage(5, true), full: stage(5, false) };
    const speed = (nodes: Node[]) => (nodes.find((n) => n.kind === "water")!.options as { normalSpeed: number }).normalSpeed;
    expect(speed(night.calm)).toBeCloseTo(speed(night.full) * 0.3, 6);
  });

  it("halves particle counts and drops camera layers; reduced flash caps light layers at 0.3 for 200 ms", () => {
    const full = siegeVfxPresets({ reducedMotion: false });
    const calm = siegeVfxPresets({ reducedMotion: true, reducedFlash: true });
    const count = (spec: (typeof full)[keyof typeof full]) => spec.layers.reduce((sum, l) => sum + ((l as { count?: number }).count ?? 0), 0);
    expect(count(calm[SIEGE_VFX.breakWood])).toBeLessThanOrEqual(Math.ceil(count(full[SIEGE_VFX.breakWood]) / 2) + 1);
    expect(full[SIEGE_VFX.boarHit].layers.some((l) => l.type === "camera")).toBe(true);
    expect(calm[SIEGE_VFX.boarHit].layers.some((l) => l.type === "camera")).toBe(false);
    for (const spec of Object.values(calm)) {
      for (const layer of spec.layers.filter((l) => l.type === "light")) {
        expect((layer as unknown as { intensity: number }).intensity).toBeLessThanOrEqual(0.3);
        expect((layer as unknown as { duration: number }).duration).toBeLessThanOrEqual(0.2);
      }
    }
  });
});

describe("slingshot-siege VFX pack (SS47-V1, V2)", () => {
  it("one break preset per block material, ability presets per ammo, ammo-tinted trails", () => {
    expect(["wood", "stone", "glass", "ice", "obsidian"].map(breakPreset)).toEqual([
      SIEGE_VFX.breakWood, SIEGE_VFX.breakStone, SIEGE_VFX.breakGlass, SIEGE_VFX.breakIce, SIEGE_VFX.breakObsidian
    ]);
    expect(breakPreset("unknown")).toBe(SIEGE_VFX.breakWood);
    expect(abilityPreset("ember")).toBe(SIEGE_VFX.emberBlast);
    expect(abilityPreset("squid")).toBe(SIEGE_VFX.yankPoof);
    expect(new Set(Object.values(AMMO_TRAIL_COLOR)).size).toBe(5);
    const presets = siegeVfxPresets({ reducedMotion: false });
    for (const name of Object.values(SIEGE_VFX)) expect(presets[name]?.name).toBe(name);
  });

  it("the sphere puff pool is gone from the stage", () => {
    expect(stage(0).some((n) => (n.name ?? "").startsWith("v-puff-"))).toBe(false);
  });
});

describe("slingshot-siege block families (SS47-M1)", () => {
  it("five distinct looks: painted wood, chalky stone, clearcoat glass at 0.55, pale-emissive ice, glossy obsidian", async () => {
    const { BLOCK_LOOKS } = await import("../../../apps/showcase-slingshot-siege/src/game/stage");
    const glass = BLOCK_LOOKS.glass[0]!;
    expect(glass.opacity).toBe(0.55);
    expect(glass.clearcoat).toBeGreaterThan(0.5);
    expect(glass.transmission).toBeGreaterThan(0);
    expect(BLOCK_LOOKS.ice[0]!.emissiveIntensity).toBeGreaterThan(0);
    expect(BLOCK_LOOKS.obsidian[0]!.roughness).toBeLessThan(0.2);
    expect(BLOCK_LOOKS.wood[0]!.roughness).toBeGreaterThan(0.6);
    const keys = Object.values(BLOCK_LOOKS).map((l) => JSON.stringify(l));
    expect(new Set(keys).size).toBe(5);
  });
});

describe("slingshot-siege chapter weather (SS47-E4)", () => {
  const names = (c: number, rm = false) => stage(c, rm).map((n) => n.name ?? "");
  // GU47 phase 3: the ch2 sea mist and the ch4 drizzle are off (the blind panel read them as haze over the play area).
  it("dust only on ch1; no drizzle and no mist on any chapter", () => {
    for (let c = 0; c < 6; c += 1) {
      expect(names(c).includes("siege drizzle")).toBe(false);
      expect(names(c).includes("siege dust motes")).toBe(c === 1);
      expect(names(c).includes("siege sea mist")).toBe(false);
    }
  });
  it("reduced motion drops the motes", () => {
    expect(names(1, true)).not.toContain("siege dust motes");
  });
});

describe("slingshot-siege solid blocks (GU47 phase 3)", () => {
  it("day chapters pool rounded solid blocks; the night keeps the stone-bridge GLB pool", () => {
    const blocks = (c: number) => stage(c).filter((n) => n.name === "v-block-0");
    expect(blocks(0)[0]!.primitive).toBe("roundedBox");
    expect(blocks(5)[0]!.kind).toBe("model");
    for (const id of ["wood", "stone", "glass", "ice", "obsidian"] as const) expect(SOLID_BLOCK_MATERIALS[id].color).toBeTruthy();
    expect(SOLID_BLOCK_MATERIALS.glass.opacity).toBeLessThan(1);
  });
});
