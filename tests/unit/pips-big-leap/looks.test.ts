// GU47 WP-16 (G06): the per-world look table and its pure helpers (PBL-L1, E1, E2, E3, P1, P2, P3, C2, PRD 6.3).
import { describe, expect, it } from "vitest";
import { looks } from "@aura3d/engine";
import {
  MINIATURE_LENS,
  PIP_PALETTE,
  WORLD_IDS,
  WORLD_LOOKS,
  baseDepthFor,
  focusDistanceFor,
  heightFogFor,
  lookModeFromSearch,
  lookOverridesFor,
  miniatureFramingFor,
  presentationScale,
  worldFromSearch
} from "../../../apps/showcase-pips-big-leap/src/game/looks";
import { framingFor, horizontalFov } from "../../../apps/showcase-pips-big-leap/src/game/framing";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";

type Child = { readonly kind: string; readonly name?: string; readonly light?: string; readonly effect?: string; readonly shadow?: unknown; readonly background?: unknown; readonly mode?: string; readonly heightReference?: number; readonly output?: { readonly preset?: string } };

describe("pips-big-leap look table (PBL-L1)", () => {
  it("has one row per world, in world order", () => {
    expect(Object.keys(WORLD_LOOKS).sort()).toEqual([...WORLD_IDS].sort());
    for (const id of WORLD_IDS) expect(WORLD_LOOKS[id].id).toBe(id);
  });

  it("gives every world its own background (7 distinct; the old shared #2a5c8a is gone)", () => {
    const backgrounds = WORLD_IDS.map((id) => WORLD_LOOKS[id].background.toLowerCase());
    expect(new Set(backgrounds).size).toBe(7);
    expect(backgrounds).not.toContain("#2a5c8a");
  });

  it("uses the PRD sun angles and interior key intensities", () => {
    const angles = (id: keyof typeof WORLD_LOOKS) => [WORLD_LOOKS[id].key.elevationDeg, WORLD_LOOKS[id].key.azimuthDeg];
    expect(angles("academy")).toEqual([42, 120]);
    expect(angles("w1")).toEqual([18, 80]);
    expect(angles("w2")).toEqual([10, 250]);
    expect(angles("w3")).toEqual([24, 150]);
    expect(angles("w6")).toEqual([30, 300]);
    expect(WORLD_LOOKS.w4.key.intensity).toBe(1.1);
    expect(WORLD_LOOKS.w5.key.intensity).toBe(0.9);
  });

  it("uses the PRD catalogue HDRIs and IBL strengths", () => {
    expect(WORLD_LOOKS.academy.hdri.id).toBe("spruit_sunrise");
    expect(WORLD_LOOKS.w1.hdri.id).toBe("spruit_sunrise");
    expect(WORLD_LOOKS.w3.hdri.id).toBe("spruit_sunrise");
    expect(WORLD_LOOKS.w2.hdri.id).toBe("belfast_sunset_puresky");
    expect(WORLD_LOOKS.w4.hdri).toMatchObject({ id: "hangar_interior", intensity: 0.6 });
    expect(WORLD_LOOKS.w5.hdri).toMatchObject({ id: "warm_bar", intensity: 0.85 });
    expect(WORLD_LOOKS.w6.hdri).toMatchObject({ id: "rooftop_night", intensity: 0.55 });
    // Shared spruit_sunrise uses differ in rotation and intensity (PRD 6.1 secondary-use rule).
    const spruit = WORLD_IDS.filter((id) => WORLD_LOOKS[id].hdri.id === "spruit_sunrise").map((id) => `${WORLD_LOOKS[id].hdri.rotationDeg}/${WORLD_LOOKS[id].hdri.intensity}`);
    expect(new Set(spruit).size).toBe(spruit.length);
  });

  it("keeps sun-seed gold out of every world's backdrop, fog and base (reserved for pickups and the gate)", () => {
    for (const id of WORLD_IDS) {
      const l = WORLD_LOOKS[id];
      for (const c of [l.background, l.fog.color, l.base.felt, l.base.clay, l.base.skirt, l.base.mound]) expect(c.toLowerCase()).not.toBe(PIP_PALETTE.sunSeed);
    }
  });

  it("caps practicals at 6 point/spot lights per world", () => {
    for (const id of WORLD_IDS) {
      const practicals = WORLD_LOOKS[id].practicals;
      expect(practicals.length, id).toBeLessThanOrEqual(6);
      for (const p of practicals) expect(p.flicker).toBeGreaterThanOrEqual(0);
    }
    expect(WORLD_LOOKS.w4.practicals.filter((p) => p.type === "point" && p.flicker > 0)).toHaveLength(4);
    expect(WORLD_LOOKS.w5.practicals.some((p) => p.type === "spot")).toBe(true);
    expect(WORLD_LOOKS.w6.practicals.length).toBeGreaterThan(0);
    expect(WORLD_LOOKS.w2.lensFlare).toBeDefined();
  });
});

describe("pips-big-leap look overrides on the merged E-A looks.preset", () => {
  it("lowers every world to its HDRI (IBL only), a PCSS 3-cascade key, a rim, base height fog and the post preset", () => {
    for (const id of WORLD_IDS) {
      const look = WORLD_LOOKS[id];
      const baseTop = -baseDepthFor(worldSpec(id));
      const group = looks.preset(look.baseLook, lookOverridesFor(look, baseTop)).toJSON() as unknown as { readonly name: string; readonly background: string; readonly children: readonly Child[] };
      expect(group.name).toBe(`aura-look:${look.baseLook}`);
      expect(group.background).toBe(look.background);
      const byName = (name: string) => group.children.find((c) => c.name === name);
      const hdri = group.children.find((c) => c.kind === "environment");
      expect(hdri?.name, id).toBe(`look hdri ${look.hdri.id}_1k`);
      expect(hdri?.background).toBe(false);
      expect(byName("look key light")?.shadow).toMatchObject({ filter: "pcss", cascades: 3 });
      expect(byName("look rim light")?.light).toBe("directional");
      const fog = byName("look fog");
      expect(fog?.mode).toBe("height");
      expect(fog?.heightReference).toBe(baseTop);
      expect(byName("look ambient occlusion")).toBeDefined();
      expect(group.children.find((c) => c.output?.preset !== undefined)?.output?.preset).toBe(look.post.preset);
    }
  });

  it("assigns the PRD post presets: daylight-outdoor x4, arena-fight, cinematic-film, space", () => {
    expect(WORLD_IDS.map((id) => WORLD_LOOKS[id].post.preset)).toEqual(["daylight-outdoor", "daylight-outdoor", "daylight-outdoor", "daylight-outdoor", "arena-fight", "cinematic-film", "space"]);
  });

  it("pools the height fog at the base top", () => {
    const fog = heightFogFor(WORLD_LOOKS.w1, -5.5);
    expect(fog).toMatchObject({ mode: "height", heightReference: -5.5 });
    expect(fog.maxOpacity).toBeLessThan(1);
  });
});

describe("pips-big-leap diorama base and atmosphere (PBL-E1, E2, E3, P3)", () => {
  it("puts the base 3-6 m below the course and never below the fall line", () => {
    for (const id of WORLD_IDS) {
      const spec = worldSpec(id);
      const depth = baseDepthFor(spec);
      expect(depth, id).toBeGreaterThanOrEqual(3);
      expect(depth, id).toBeLessThanOrEqual(6);
      expect(-depth, id).toBeGreaterThan(spec.lowerBound);
    }
  });

  it("gives w2 a Preetham sky, w3 a peach-lilac gradient, w6 a starry gradient, and no other world a sky", () => {
    expect(WORLD_LOOKS.w2.sky?.model).toBe("preetham");
    expect(WORLD_LOOKS.w3.sky?.model).toBe("gradient");
    const w6 = WORLD_LOOKS.w6.sky;
    expect(w6?.model === "gradient" && w6.stars !== undefined && w6.stars.count > 0).toBe(true);
    for (const id of ["academy", "w1", "w4", "w5"] as const) expect(WORLD_LOOKS[id].sky).toBeUndefined();
  });

  it("gives every world exactly one ambient kind, all different, within the 600-particle budget", () => {
    const kinds = WORLD_IDS.map((id) => WORLD_LOOKS[id].ambient.kind);
    expect(kinds).toEqual(["petals", "spores", "motes", "fluff", "embers", "dust", "fireflies"]);
    for (const id of WORLD_IDS) expect(WORLD_LOOKS[id].ambient.maxParticles).toBeLessThanOrEqual(600);
  });

  it("runs no sun-shaft stage (phase 2: on software WebGL2 it only added extinction)", () => {
    expect(WORLD_IDS.filter((id) => WORLD_LOOKS[id].shafts !== undefined)).toEqual([]);
  });
});

describe("pips-big-leap miniature lens and framing (PBL-P2, PBL-C2)", () => {
  it("uses f/2, 50 mm and maxBlur 4", () => {
    expect(MINIATURE_LENS).toEqual({ fStop: 2, focalLength: 50, maxBlur: 4 });
  });

  it("frames Pip from 1.7 m with fov 46 on desktop and keeps >= 34 deg horizontal in a 390x844 portrait", () => {
    const desktop = miniatureFramingFor(1280 / 720);
    expect(desktop).toEqual({ fov: 46, boom: 4.5, lift: 1.7 });
    const portrait = miniatureFramingFor(390 / 844);
    expect(horizontalFov(portrait.fov, 390 / 844)).toBeGreaterThanOrEqual(34);
  });

  it("focuses about 4.6 m away on desktop and 5.7 m in portrait", () => {
    expect(focusDistanceFor(miniatureFramingFor(16 / 9))).toBeCloseTo(4.63, 1);
    expect(focusDistanceFor(miniatureFramingFor(390 / 844))).toBeCloseTo(5.7, 1);
    // A shortened boom (camera clearance) pulls the focus in with it.
    expect(focusDistanceFor(miniatureFramingFor(16 / 9), 0.5)).toBeLessThan(3);
  });

  it("leaves the original framing untouched (?look=original keeps C18)", () => {
    expect(framingFor(16 / 9)).toEqual({ fov: 52, boom: 4.5 });
  });
});

describe("pips-big-leap variants and accessibility", () => {
  it("reads ?look= and ?world= (4.6.2 look by default since the blind-panel pass)", () => {
    expect(lookModeFromSearch("?look=original")).toBe("original");
    expect(lookModeFromSearch("?look=diorama")).toBe("diorama");
    expect(lookModeFromSearch("")).toBe("original");
    expect(lookModeFromSearch("?look=carnival")).toBe("original");
    expect(worldFromSearch("?world=w4")).toBe("w4");
    expect(worldFromSearch("?world=w9")).toBeNull();
  });

  it("reduced motion halves emission, caps secondary motion at 30%, stops flicker and camera sequences (PRD 6.3)", () => {
    expect(presentationScale(true)).toEqual({ emission: 0.5, motion: 0.3, flicker: false, cameraSequences: false });
    expect(presentationScale(false)).toEqual({ emission: 1, motion: 1, flicker: true, cameraSequences: true });
  });
});
