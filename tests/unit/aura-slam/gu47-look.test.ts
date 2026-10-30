/**
 * GU47 WP-11 (G01) "World Tour broadcast": the venue look table, the light rig, the runtime venue plan and the signature
 * VFX controller. Presentation only; the sim, replay and parity suites in this folder guard gameplay.
 */
import { existsSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VENUES } from "../../../examples/aura-slam/contract/venues";
import { venueHdriAssets } from "../../../examples/aura-slam/view/assets";
import { SUN_SHADOW_FIT, SUN_SHADOW_MAP_SIZE, VENUE_LIGHT_IDS, sceneLights } from "../../../examples/aura-slam/view/lighting";
import { EARTH, FLOODLIGHTS, VENUE_LOOKS, VENUE_LOOK_ORDER, lookMode, sunPosition, venueLook } from "../../../examples/aura-slam/view/look";
import { CAMERA_V2, cameraFovForAspect, projectWorldPoint } from "../../../examples/aura-slam/view/camera";
import { createPoseRig } from "../../../examples/aura-slam/view/poseRig";
import { VENUE_ENVIRONMENT_NAME, buildTennisScene } from "../../../examples/aura-slam/view/scene";
import { applyVenueRuntime, isHighTier, venueRuntimePlan } from "../../../examples/aura-slam/view/venueRuntime";
import { MARK_CAPACITY, SLAM_VFX_PRESETS, burstCount, createSlamVfx, registerSlamVfx } from "../../../examples/aura-slam/view/vfx";

type Node = { kind?: string; light?: string; name?: string; shadow?: unknown; environment?: string; texture?: { url?: string }; effect?: string; children?: Node[] };
const flat = (nodes: Node[] = []): Node[] => nodes.flatMap((n) => [n, ...flat(n.children)]);
const sceneNodes = (venue?: string, look?: "world-tour" | "original"): Node[] =>
  flat((buildTennisScene(createPoseRig(), { venue, look }).toJSON() as unknown as { nodes: Node[] }).nodes);

const angleDiff = (a: number, b: number): number => {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
};

describe("GU47 TT-L1: venue light table", () => {
  it("every contract venue has a look row, and the order covers all six", () => {
    for (const v of VENUES) expect(VENUE_LOOKS[v.id].id).toBe(v.id);
    expect([...VENUE_LOOK_ORDER].sort()).toEqual(VENUES.map((v) => v.id).sort());
    expect(venueLook("nope").id).toBe("hard");
  });

  it("sun venues use the PRD angles (grass 40/120, clay 18/250, desert 72/10, beach 8/290, moon 25/60)", () => {
    const want: Record<string, [number, number]> = { grass: [40, 120], clay: [18, 250], desert: [72, 10], beach: [8, 290], moon: [25, 60] };
    for (const [id, [el, az]] of Object.entries(want)) {
      const sun = VENUE_LOOKS[id as keyof typeof VENUE_LOOKS].sun!;
      expect([sun.elevationDeg, sun.azimuthDeg], id).toEqual([el, az]);
    }
    expect(VENUE_LOOKS.hard.sun).toBeNull();
  });

  it("sun azimuths of every pair of sun venues differ by at least 40 degrees", () => {
    const suns = VENUE_LOOK_ORDER.map((id) => VENUE_LOOKS[id].sun).filter((s) => s !== null);
    expect(suns.length).toBe(5);
    for (let i = 0; i < suns.length; i++) for (let j = i + 1; j < suns.length; j++) expect(angleDiff(suns[i]!.azimuthDeg, suns[j]!.azimuthDeg)).toBeGreaterThanOrEqual(40);
  });

  it("sun positions follow the engine look basis (azimuth 0 = +Z, 90 = +X)", () => {
    const p = sunPosition({ elevationDeg: 0, azimuthDeg: 90 }, 10);
    expect(p[0]).toBeCloseTo(10, 9);
    expect(p[1]).toBeCloseTo(0, 9);
    expect(p[2]).toBeCloseTo(0, 9);
    expect(sunPosition({ elevationDeg: 90, azimuthDeg: 0 }, 10)[1]).toBeCloseTo(10, 9);
  });

  it("the hard court has four corner floodlights aimed at the court quadrants (no centre hotspot light)", () => {
    expect(VENUE_LOOKS.hard.floodlights).toHaveLength(4);
    const xs = FLOODLIGHTS.map((f) => Math.sign(f.position[0])).sort();
    const zs = FLOODLIGHTS.map((f) => Math.sign(f.position[2])).sort();
    expect(xs).toEqual([-1, -1, 1, 1]);
    expect(zs).toEqual([-1, -1, 1, 1]);
    for (const id of VENUE_LOOK_ORDER.filter((v) => v !== "hard")) expect(VENUE_LOOKS[id].floodlights).toHaveLength(0);
  });

  it("the World Tour scene mounts no ambient, hemisphere or point light, and exactly one shadowed light (the key)", () => {
    for (const venue of VENUE_LOOK_ORDER) {
      const lights = sceneNodes(venue).filter((n) => n.kind === "light");
      expect(lights.map((l) => l.light).sort(), venue).toEqual(["directional", "spot", "spot", "spot", "spot"]);
      expect(lights.filter((l) => l.shadow === true || (typeof l.shadow === "object" && l.shadow !== null)).map((l) => l.name), venue).toEqual([VENUE_LIGHT_IDS.key]);
    }
  });

  it("?look=original keeps the 4.6.1 rig (ambient, hemisphere, directional, point)", () => {
    expect(sceneNodes(undefined, "original").filter((n) => n.kind === "light").map((n) => n.light)).toEqual(["ambient", "hemisphere", "directional", "point"]);
  });
});

describe("GU47 TT-L2: PCSS key fitted to the court", () => {
  it("the key casts with PCSS, a 2048 map and the court fit; the light size is the venue's", () => {
    for (const venue of VENUE_LOOK_ORDER) {
      const key = sceneLights(venue)[0]!.toJSON() as { shadow?: { filter?: string; mapSize?: number; lightSize?: number; fit?: { center: number[]; extent: number } } };
      expect(key.shadow?.filter, venue).toBe("pcss");
      expect(key.shadow?.mapSize).toBe(SUN_SHADOW_MAP_SIZE);
      expect(key.shadow?.fit).toEqual({ center: [...SUN_SHADOW_FIT.center], extent: 22 });
      expect(key.shadow?.lightSize).toBe((VENUE_LOOKS[venue].sun ?? VENUE_LOOKS[venue].nightKey)!.lightSize);
    }
  });

  it("the scene adds a contact-shadow pass", () => {
    expect(sceneNodes("clay").some((n) => n.kind === "effect" && n.effect === "contact-shadows")).toBe(true);
  });
});

describe("GU47 TT-E1: one venue HDRI each", () => {
  const LOOK_HDRIS = ["autumn_field_puresky", "kloppenheim_06_puresky", "studio_small_08"];

  it("six different catalogue HDRIs, none of them a look-preset HDRI, each file committed and under 6.5 MB", () => {
    const ids = VENUE_LOOK_ORDER.map((v) => VENUE_LOOKS[v].hdri);
    expect(new Set(ids).size).toBe(6);
    expect(ids).toEqual(["rooftop_night", "kloppenheim_02", "venice_sunset", "outdoor-midday", "sunset-dramatic", "deep_space_starfield"]);
    for (const id of ids) {
      expect(LOOK_HDRIS).not.toContain(id);
      const url = venueHdriAssets[id].url;
      expect(url).toBe(`/hdri/${id}_1k.hdr`);
      expect(existsSync(`public${url}`), url).toBe(true);
      expect(statSync(`public${url}`).size).toBeLessThanOrEqual(6.5 * 1024 * 1024);
    }
  });

  it("the authored scene carries the boot venue's HDRI as environment and background; the backdrop wall is gone", () => {
    for (const venue of VENUE_LOOK_ORDER) {
      const envs = sceneNodes(venue).filter((n) => n.kind === "environment");
      expect(envs, venue).toHaveLength(1);
      expect(envs[0]!.name).toBe(VENUE_ENVIRONMENT_NAME);
      expect(envs[0]!.texture?.url).toBe(`/hdri/${VENUE_LOOKS[venue].hdri}_1k.hdr`);
      expect(sceneNodes(venue).some((n) => n.name === "stadium-backdrop")).toBe(false);
    }
  });
});

describe("GU47 TT-E2 / TT-P1: the runtime venue plan", () => {
  it("fog: desert strongest with the volumetric stage at High+ only; no fog on the Moon", () => {
    const densities = VENUE_LOOK_ORDER.filter((v) => VENUE_LOOKS[v].fog).map((v) => VENUE_LOOKS[v].fog!.density);
    expect(VENUE_LOOKS.desert.fog!.density).toBe(Math.max(...densities));
    expect(VENUE_LOOKS.desert.fog!.color).toBe("#e8d2b0");
    expect(VENUE_LOOKS.hard.fog!.color).toBe("#0b1426");
    expect(VENUE_LOOKS.hard.fog!.lightCones).toBe(4);
    expect(venueRuntimePlan(VENUE_LOOKS.moon).fog).toBeNull();
    expect(sceneNodes("moon").some((n) => n.kind === "effect" && n.effect === "fog")).toBe(false);
    expect(venueRuntimePlan(VENUE_LOOKS.desert, "high").volumetricFog).toBe(true);
    expect(venueRuntimePlan(VENUE_LOOKS.desert, "medium").volumetricFog).toBe(false);
    for (const v of VENUE_LOOK_ORDER.filter((id) => id !== "desert")) expect(venueRuntimePlan(VENUE_LOOKS[v], "ultra").volumetricFog, v).toBe(false);
    expect(isHighTier("ultra") && isHighTier("high") && !isHighTier("low")).toBe(true);
  });

  it("output presets per venue (hard arena-fight, grass daylight, clay cinematic, desert daylight x1.3, beach cinematic, moon space)", () => {
    const presets = VENUE_LOOK_ORDER.map((v) => venueRuntimePlan(VENUE_LOOKS[v]).output.preset);
    expect(presets).toEqual(["arena-fight", "daylight-outdoor", "cinematic-film", "daylight-outdoor", "cinematic-film", "space"]);
    expect(venueRuntimePlan(VENUE_LOOKS.desert).output.exposure).toBeCloseTo(1.3, 9);
    expect(venueRuntimePlan(VENUE_LOOKS.moon).output.toneMapping).toBe("aces");
    expect(venueRuntimePlan(VENUE_LOOKS.grass).output.toneMapping).toBe("agx");
  });

  it("TT-E2 / TT-E3: haze cones on the night court only, the Earth on the Moon only", () => {
    for (const v of VENUE_LOOK_ORDER) {
      const plan = venueRuntimePlan(VENUE_LOOKS[v]);
      expect(plan.cones, v).toBe(v === "hard");
      expect(plan.earth, v).toBe(v === "moon");
    }
    type Fx = Node & { visible?: boolean; scale?: number[]; runtime?: { id?: string } };
    const hardCones = (sceneNodes("hard") as Fx[]).filter((n) => n.effect === "lightCone");
    expect(hardCones).toHaveLength(4);
    expect(hardCones.every((n) => n.visible !== false)).toBe(true);
    expect((sceneNodes("grass") as Fx[]).filter((n) => n.effect === "lightCone").every((n) => n.visible === false)).toBe(true);
    const earthOn = (sceneNodes("moon") as Fx[]).find((n) => n.name === "moon-earth");
    const earthOff = (sceneNodes("clay") as Fx[]).find((n) => n.name === "moon-earth");
    expect(earthOn?.scale).toEqual([1, 1, 1]);
    expect(earthOff?.scale?.[0]).toBeLessThan(0.01);
  });

  it("TT-E3: the Earth sits 150 m from the v2 eye, inside the 1280x720 and 390x844 frames, >= 4% of their width", () => {
    const rig = CAMERA_V2;
    const d = Math.hypot(EARTH.position[0] - rig.eye[0], EARTH.position[1] - rig.eye[1], EARTH.position[2] - rig.eye[2]);
    expect(d).toBeGreaterThan(145);
    expect(d).toBeLessThan(155);
    for (const [w, h] of [[1280, 720], [390, 844]] as const) {
      const fov = cameraFovForAspect(w / h, rig);
      const c = projectWorldPoint(w, h, ...EARTH.position, fov, rig);
      expect(c.visible, `${w}x${h}`).toBe(true);
      // Its edge (radius 3 m) stays inside the frame too, and the disc is >= 4% of the frame width.
      const left = projectWorldPoint(w, h, EARTH.position[0] - EARTH.radius, EARTH.position[1], EARTH.position[2], fov, rig);
      const right = projectWorldPoint(w, h, EARTH.position[0] + EARTH.radius, EARTH.position[1], EARTH.position[2], fov, rig);
      expect(left.x, `${w}x${h}`).toBeGreaterThan(0);
      expect(right.x, `${w}x${h}`).toBeLessThan(w);
      expect(c.y - (right.x - left.x) / 2, `${w}x${h}`).toBeGreaterThan(0);
      expect((right.x - left.x) / w, `${w}x${h}`).toBeGreaterThanOrEqual(0.04);
    }
    // The line of sight to the Earth's lowest point clears the far edge of the ground (z -29) and the scoreboard gantry.
    const low = [EARTH.position[0], EARTH.position[1] - EARTH.radius, EARTH.position[2]] as const;
    const t = rig.eye[1] / (rig.eye[1] - low[1]); // where the ray meets y = 0
    expect(rig.eye[2] + (low[2] - rig.eye[2]) * t).toBeLessThan(-29);
    expect(Math.abs(Math.atan2(EARTH.position[0], rig.eye[2] - EARTH.position[2]) * 180 / Math.PI)).toBeGreaterThan(4 + 1.2);
    // The classic camera's position is kept for `?cam=classic` (tall canvases only).
    expect(EARTH.classicPosition).toEqual([-20, -18, -125]);
  });

  it("only the night court shows the floodlights; the key is always visible", () => {
    for (const v of VENUE_LOOK_ORDER) {
      const plan = venueRuntimePlan(VENUE_LOOKS[v]);
      expect(plan.key.visible).toBe(true);
      expect(plan.floods.filter((f) => f.visible).length, v).toBe(v === "hard" ? 4 : 0);
    }
  });

  it("applyVenueRuntime writes lights, environment, fog, output and post to the app; the boot venue swaps nothing", () => {
    const log: string[] = [];
    const handle = (id: string) => ({
      setVisible: (on: boolean) => { log.push(`${id}.visible=${on}`); return handle(id); },
      setLight: (p: { intensity: number }) => { log.push(`${id}.setLight(${p.intensity})`); }
    });
    const app = {
      nodes: { get: (id: string) => handle(id) as never },
      lighting: { setEnvironment: (t: { url?: string }, o?: { intensity?: number }) => { log.push(`env ${t.url} ${o?.intensity}`); } },
      atmosphere: { setFog: (spec: Record<string, unknown> | null) => { log.push(`fog ${spec ? String(spec.color) : "none"}`); } },
      post: { setEffect: (name: string) => { log.push(`post ${name}`); }, setEffectEnabled: (name: string, on: boolean) => { log.push(`post ${name}=${on}`); } },
      setOutput: (o: Record<string, unknown>) => { log.push(`output ${String(o.preset)} ${String(o.toneMapping)}`); }
    };
    applyVenueRuntime(app, venueRuntimePlan(VENUE_LOOKS.clay), { initial: true });
    expect(log.some((l) => l.startsWith("env") || l.startsWith("fog"))).toBe(false);
    expect(log).toContain("venue-key.visible=true");
    expect(log).toContain("flood-far-left.visible=false");
    expect(log).toContain("output cinematic-film agx");
    log.length = 0;
    applyVenueRuntime(app, venueRuntimePlan(VENUE_LOOKS.moon));
    expect(log).toContain("env /hdri/deep_space_starfield_1k.hdr 0.05");
    expect(log).toContain("fog none");
    log.length = 0;
    applyVenueRuntime(app, venueRuntimePlan(VENUE_LOOKS.hard));
    expect(log).toContain("flood-near-right.visible=true");
    expect(log).toContain("fog #0b1426");
    expect(log.filter((l) => l.startsWith("post ")).length).toBeGreaterThanOrEqual(3);
  });

  it("a build without the runtime surfaces degrades to no-ops (no throw)", () => {
    expect(() => applyVenueRuntime({ nodes: {} }, venueRuntimePlan(VENUE_LOOKS.beach))).not.toThrow();
  });
});

describe("GU47 ?look=original", () => {
  it("lookMode reads ?look=original only", () => {
    expect(lookMode("?look=original")).toBe("original");
    expect(lookMode("?venue=clay")).toBe("world-tour");
    expect(lookMode("")).toBe("world-tour");
  });
});

describe("GU47 TT-V1 / TT-V2: signature VFX controller", () => {
  type Burst = { kind: string; position: number[]; count?: number; color?: string };
  function fakeEffects(runtime: "on" | "off" = "on") {
    const bursts: Burst[] = [];
    const decals: { color?: string; lifetime?: number; stopped: boolean }[] = [];
    const trails: string[] = [];
    const registered: string[] = [];
    return {
      bursts, decals, trails, registered,
      effects: {
        runtime,
        registerPreset: (kind: string) => { registered.push(kind); },
        burst: (kind: string, position: number[], o?: { count?: number; color?: string }) => { bursts.push({ kind, position, count: o?.count, color: o?.color }); return { id: "b", alive: true, stop() {}, setPosition() {} }; },
        decal: (_at: unknown, o: { color?: string; lifetime?: number }) => { const d = { color: o.color, lifetime: o.lifetime, stopped: false }; decals.push(d); return { id: "d", alive: true, stop() { d.stopped = true; }, setPosition() {} }; },
        trail: (target: string) => { trails.push(target); return { id: "t", alive: true, length: 0, pointCount: 0, stop() {}, setPosition() {}, clear() {} }; }
      }
    };
  }
  const rally = (n: number) => Array.from({ length: n }, (_, i) => ({ x: -0.5 + i * 0.17, y: (i % 2 ? 1 : -1) * 0.6, life: 4 }));

  it("registers one preset per surface family plus the out ring and the ace flash", () => {
    const f = fakeEffects();
    expect(registerSlamVfx(f.effects as never)).toEqual(Object.keys(SLAM_VFX_PRESETS));
    expect(f.registered).toEqual(["clay-puff", "grass-flick", "hard-skid", "regolith-drift", "out-ring", "ace-flash", "win-confetti"]);
  });

  it("a 6-bounce clay rally leaves 6 clay marks and 6 clay puffs in the venue particle colour; marks outlive the point", () => {
    const f = fakeEffects();
    const vfx = createSlamVfx(f.effects as never);
    const clay = VENUE_LOOKS.clay;
    const marks: { x: number; y: number; life: number }[] = [];
    for (const mark of rally(6)) {
      marks.push(mark);
      vfx.update({ mode: "playing", phase: "rally", marks: [...marks].slice(-8), score: { playerGames: 1, aiGames: 2, playerPoints: 0, aiPoints: 0 } }, clay);
      vfx.update({ mode: "playing", phase: "rally", marks: [...marks].slice(-8), score: { playerGames: 1, aiGames: 2, playerPoints: 0, aiPoints: 0 } }, clay);
    }
    expect(f.bursts.filter((b) => b.kind === "clay-puff")).toHaveLength(6);
    expect(new Set(f.bursts.map((b) => b.color))).toEqual(new Set([VENUES.find((v) => v.id === "clay")!.particleColor]));
    expect(f.decals.filter((d) => !d.stopped)).toHaveLength(6);
    expect(f.decals[0]!.lifetime).toBe(clay.signature.markLifetime);
    // After the point (sim marks expire after 4 s) the decals stay.
    vfx.update({ mode: "playing", phase: "point", marks: [], score: { playerGames: 1, aiGames: 2, playerPoints: 1, aiPoints: 0 } }, clay);
    expect(vfx.events.marks).toBe(6);
    // A new set clears them.
    vfx.update({ mode: "playing", phase: "serve", marks: [], score: { playerGames: 0, aiGames: 0, playerPoints: 0, aiPoints: 0 } }, clay);
    expect(vfx.events.marks).toBe(0);
  });

  it("each surface uses its own burst kind and colour", () => {
    for (const venue of VENUE_LOOK_ORDER) {
      const f = fakeEffects();
      const vfx = createSlamVfx(f.effects as never);
      vfx.update({ mode: "playing", marks: rally(1) }, VENUE_LOOKS[venue]);
      expect(f.bursts[0]!.kind, venue).toBe(VENUE_LOOKS[venue].signature.burst);
      expect(f.bursts[0]!.color, venue).toBe(VENUES.find((v) => v.id === venue)!.particleColor);
    }
    expect(VENUE_LOOKS.moon.signature.burst).toBe("regolith-drift");
    expect(VENUE_LOOKS.grass.signature.burst).toBe("grass-flick");
  });

  it("an out call flashes the red ring once; an ace adds the flash", () => {
    const f = fakeEffects();
    const vfx = createSlamVfx(f.effects as never);
    vfx.update({ mode: "playing", marks: rally(1), outFeedback: { remaining: 1.3 } }, VENUE_LOOKS.hard);
    vfx.update({ mode: "playing", marks: rally(1), outFeedback: { remaining: 1.2 } }, VENUE_LOOKS.hard);
    expect(f.bursts.filter((b) => b.kind === "out-ring")).toHaveLength(1);
    vfx.update({ mode: "playing", phase: "point", lastCall: "ACE", marks: rally(1), score: { playerPoints: 1, aiPoints: 0 } }, VENUE_LOOKS.hard);
    vfx.update({ mode: "playing", phase: "point", lastCall: "ACE", marks: rally(1), score: { playerPoints: 1, aiPoints: 0 } }, VENUE_LOOKS.hard);
    expect(f.bursts.filter((b) => b.kind === "ace-flash")).toHaveLength(1);
  });

  it("reduced motion halves the bursts and skips the ace flash (PRD §6.3)", () => {
    const f = fakeEffects();
    const vfx = createSlamVfx(f.effects as never, { reducedMotion: () => true });
    vfx.update({ mode: "playing", marks: rally(1) }, VENUE_LOOKS.clay);
    expect(f.bursts[0]!.count).toBe(burstCount("clay-puff", true));
    expect(burstCount("clay-puff", true)).toBe(Math.floor(burstCount("clay-puff", false) / 2));
    vfx.update({ mode: "playing", phase: "point", lastCall: "ACE", marks: rally(1), score: { playerPoints: 1 } }, VENUE_LOOKS.clay);
    expect(f.bursts.some((b) => b.kind === "ace-flash")).toBe(false);
    expect(vfx.events.aces).toBe(1);
  });

  it("?vfx=off (runtime effects off) spawns no bursts, marks or trail", () => {
    const f = fakeEffects("off");
    const vfx = createSlamVfx(f.effects as never);
    vfx.startTrail("tennis-ball");
    vfx.update({ mode: "playing", marks: rally(3), outFeedback: { remaining: 1 } }, VENUE_LOOKS.clay);
    expect(f.bursts).toHaveLength(0);
    expect(f.decals).toHaveLength(0);
    expect(f.trails).toHaveLength(0);
  });

  it("TT-V3: the match end fires one confetti burst (halved under reduced motion); a new match re-arms it", () => {
    const f = fakeEffects();
    const vfx = createSlamVfx(f.effects as never);
    vfx.update({ mode: "playing", phase: "point" }, VENUE_LOOKS.grass);
    vfx.update({ mode: "gameover", phase: "complete" }, VENUE_LOOKS.grass);
    vfx.update({ mode: "gameover", phase: "complete" }, VENUE_LOOKS.grass);
    expect(f.bursts.filter((b) => b.kind === "win-confetti")).toHaveLength(1);
    expect(f.bursts.find((b) => b.kind === "win-confetti")!.count).toBe(burstCount("win-confetti", false));
    vfx.update({ mode: "menu" }, VENUE_LOOKS.grass);
    vfx.update({ mode: "gameover" }, VENUE_LOOKS.grass);
    expect(vfx.events.wins).toBe(2);
    const r = fakeEffects();
    createSlamVfx(r.effects as never, { reducedMotion: () => true }).update({ mode: "gameover" }, VENUE_LOOKS.grass);
    expect(r.bursts[0]!.count).toBe(burstCount("win-confetti", true));
    const off = fakeEffects("off");
    createSlamVfx(off.effects as never).update({ mode: "gameover" }, VENUE_LOOKS.grass);
    expect(off.bursts).toHaveLength(0);
  });

  it("the trail follows the ball node; marks are capped", () => {
    const f = fakeEffects();
    const vfx = createSlamVfx(f.effects as never);
    vfx.startTrail("tennis-ball");
    vfx.startTrail("tennis-ball");
    expect(f.trails).toEqual(["tennis-ball"]);
    for (let i = 0; i < MARK_CAPACITY + 10; i++) vfx.update({ mode: "playing", marks: [{ x: i / 1000, y: 0.5, life: 4 }] }, VENUE_LOOKS.clay);
    expect(vfx.events.marks).toBe(MARK_CAPACITY);
  });
});
