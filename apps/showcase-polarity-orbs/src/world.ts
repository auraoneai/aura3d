/**
 * Polarity Orbs world on the public `@aura3d/engine` surface:
 * - Sleek dark-studio magnetosphere lighting: `environments.nightCinematic`, 1 shadowed directional key, and a dynamic
 *   under-ball `lights.point` snapping cleanly between crimson `+` and cyan `−` (zero `lights.ambient`).
 * - Eevee post & atmosphere stack: `contactShadows`, `ambientOcclusion`, `screenSpaceReflections` on the ferrofluid
 *   dipole slate board, overhead `auroraRibbon`, hero `trail`, `cinematicBloom`, `colorGrade`, and `vignette`.
 * - Refractive `studioGlass` outer shell + `brushedMetal` equatorial collar + paired GLSL/WGSL `plasmaOrbSpec` dipole
 *   core (`180°` gyroscopic hemisphere flip + `0.18 m` micro-hop, zero muddy lavender blend), feathered `fluxRingSpec`
 *   shockwave & grounded reticle, sinusoidal `fluxArcSpec` magnet streams, `dualEnergyFieldSpec` shield, and 32-frame
 *   `createFlipbookAtlas("plasma")` + `createGradingLut("cyber-neon")` polarity-discharge bursts.
 */
import { camera, effects, environments, geometry, lights, material, scene, type AuraApp } from "@aura3d/engine";
import { labCameraOptions, readLabFlags } from "../../../examples/shared/lab-flags";
import { Batch, CORRIDOR_BOUNDS, Slots, scrollFrameZ, type MeshData } from "../../../examples/shared/runner-kit/batch";
import { hexToLinear, type Rgb } from "../../../examples/shared/runner-kit/look-utils";
import { flatSpec, shadowSpec, toonSpec, type CustomSpec } from "../../../examples/shared/runner-kit/shaders";
import { dualEnergyFieldSpec } from "../../showcase-port-shared/dual-shaders";
import { createFlipbookAtlas, createGradingLut } from "./vfx-atlases";
import { CONFIG, type PolarityOrbsSim, type PowerupKind } from "./sim";
import { LINEAR, LOOK, mixRgb } from "./look";
import {
  CLOUD_SEA_Y,
  LAYERS,
  cloudSeaGeometry,
  cloudSeaSpec,
  deckSpec,
  fluxArcSpec,
  fluxRingSpec,
  layerGeometry,
  layerScroll,
  plasmaBurstSpec,
  plasmaOrbSpec,
  sceneSkySpec,
  sceneryGlowSpec,
  sceneryLitSpec
} from "./scenery";
import {
  BALL_RADIUS,
  DECK_WIDTH,
  SEG_LEN,
  ballMesh,
  dashMesh,
  deckHalfMesh,
  fluxArcMesh,
  fluxWaveMesh,
  orbCollarMesh,
  orbMesh,
  particleMesh,
  plasmaQuadMesh,
  powerupMesh,
  railMesh,
  reticleRingMesh,
  shadowMesh,
  symbolMesh,
  translateMesh
} from "./meshes";
import { CAMERA_FAR, chaseFov, type Shown } from "./presentation";
import { BACKDROP_GROUPS, addBackdrop, updateBackdrop } from "./backdrop";

type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;
type SceneBuilder = ReturnType<typeof scene>;

export interface WorldOptions {
  readonly sim: PolarityOrbsSim;
  readonly aspect: number;
}

export interface WorldView {
  readonly shown?: Shown;
  readonly camera?: Shown["camera"];
  readonly reducedMotion?: boolean;
  readonly symbols?: boolean;
  readonly shakeOffset?: readonly [number, number, number];
  readonly shakeRoll?: number;
  readonly fovDeltaDeg?: number;
}

export interface World {
  readonly scene: SceneBuilder;
  bind(app: AuraApp): WorldRuntime;
}

export interface WorldRuntime {
  update(sim: PolarityOrbsSim, aspect: number, view?: WorldView): void;
  readonly nodeCount: number;
  readonly uploadedVertices: number;
  /** Show every pooled program at a parked spot so warmPrograms compiles them; false hides them again. */
  warm(on: boolean): void;
}

export const NODE_IDS = [
  "sky",
  "deck-warm",
  "deck-cool",
  "rails",
  "dashes",
  "ball",
  "ball-glass",
  "ball-collar",
  "ball-reticle",
  "ball-shadow",
  "ball-symbol",
  "polarity-light",
  "shield",
  "orbs",
  "powerups",
  "particles",
  "plasma-bursts",
  "shockwave",
  "streams",
  "cloud-sea",
  "scenery-near",
  "scenery-mid",
  "scenery-far",
  "scenery-motes",
  ...BACKDROP_GROUPS.map((g) => g.id)
] as const;

/** Shared procedural 8x4 plasma flipbook sheet + 16^3 cyber-neon grading LUT (pure typed-array `texture.data`). */
const PLASMA_ATLAS = createFlipbookAtlas("plasma", [255, 236, 210]);
const CYBER_LUT = createGradingLut("cyber-neon", 16);

const PLASMA_POOL = 16;
const PLASMA_FRAMES: readonly MeshData[] = Array.from({ length: PLASMA_ATLAS.frameCount }, (_, frame) => {
  const base = plasmaQuadMesh(1);
  const col = frame % PLASMA_ATLAS.columns;
  const row = Math.floor(frame / PLASMA_ATLAS.columns);
  const u0 = col / PLASMA_ATLAS.columns;
  const u1 = (col + 1) / PLASMA_ATLAS.columns;
  const v0 = row / PLASMA_ATLAS.rows;
  const v1 = (row + 1) / PLASMA_ATLAS.rows;
  return {
    positions: base.positions,
    normals: base.normals,
    uvs: [u0, v1, u1, v1, u1, v0, u0, v0],
    indices: base.indices
  };
});

/** Fog density / end per lit scenery layer (presentation). */
const LAYER_FOG: Record<string, readonly [number, number]> = {
  "scenery-near": [1 / 410, 382],
  "scenery-mid": [1 / 335, 382],
  "scenery-far": [1 / 235, 386]
};

/** Every distinct `material.custom` program the game draws with (compiled by `shaders-compile.test.ts`). */
export function allProgramSpecs(): readonly { readonly name: string; readonly spec: CustomSpec }[] {
  return [
    { name: "sky-blend", spec: sceneSkySpec() },
    { name: "scenery-lit", spec: sceneryLitSpec(1 / 300, 380) },
    { name: "scenery-glow", spec: sceneryGlowSpec() },
    { name: "cloud-sea", spec: cloudSeaSpec() },
    { name: "deck", spec: deckSpec() },
    { name: "plasma-orb", spec: plasmaOrbSpec({ splitPole: 1 }) },
    { name: "plasma-orb-tone", spec: plasmaOrbSpec({ withTone: true }) },
    { name: "flux-ring", spec: fluxRingSpec() },
    { name: "flux-arc", spec: fluxArcSpec() },
    {
      name: "energy-shield",
      spec: dualEnergyFieldSpec({
        coreColor: LINEAR.mint,
        edgeColor: [0.75, 1.0, 0.95],
        pulseSpeed: 3.4,
        scanScale: 12.0,
        opacity: 0.52
      })
    },
    { name: "plasma-burst", spec: plasmaBurstSpec(PLASMA_ATLAS.texture, CYBER_LUT.texture) },
    { name: "toon-tone", spec: toonSpec([1, 1, 1], undefined, [0, 0, 0], true) },
    { name: "flat-tone", spec: flatSpec([1, 1, 1], 0.95, true) },
    { name: "shadow", spec: shadowSpec() }
  ];
}

const POWERUP_TONES: Record<PowerupKind, Rgb> = {
  rainbow: LINEAR.gold,
  shield: LINEAR.mint,
  x2: LINEAR.gold,
  magnet: LINEAR.purple
};

const NORTH_EDGE: Rgb = [1.0, 0.78, 0.36];
const SOUTH_EDGE: Rgb = [0.46, 0.96, 1.0];

function dynamicFrom(m: MeshData) {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = m.positions[i + k] as number;
      if (v < (min[k] as number)) min[k] = v;
      if (v > (max[k] as number)) max[k] = v;
    }
  }
  return geometry.dynamic({
    positions: Float32Array.from(m.positions),
    normals: Float32Array.from(m.normals),
    uvs: Float32Array.from(m.uvs),
    indices: Uint32Array.from(m.indices),
    bounds: { min, max }
  });
}

export function buildWorld(_options: WorldOptions): World {
  const shieldSpec = dualEnergyFieldSpec({
    coreColor: LINEAR.mint,
    edgeColor: [0.75, 1.0, 0.95],
    pulseSpeed: 3.4,
    scanScale: 12.0,
    opacity: 0.52
  });

  const builder = scene()
    .background(LOOK.background)
    .camera(
      camera.perspective({
        ...labCameraOptions(readLabFlags(), "reversed"),
        position: [0, 5.4, 9],
        target: [0, 0.9, -10],
        fov: 60,
        near: 0.1,
        far: CAMERA_FAR
      })
    )
    /* Sleek dark-studio magnetosphere lighting: 1 shadowed directional key + nightCinematic IBL + 1 dynamic unshadowed
     * polarity point light under the hero orb (zero lights.ambient). */
    .add(
      lights.directional({
        name: "dusk-key",
        position: [LOOK.sun[0] * 40, LOOK.sun[1] * 40, LOOK.sun[2] * 40],
        target: [0, 0, -10],
        intensity: 1.55,
        color: "#ffe8d8",
        shadow: { cascades: 2, maxDistance: 90, mapSize: 2048 }
      })
    )
    .add(
      lights
        .point({
          name: "polarity-light",
          position: [0, 1.3, 0],
          intensity: 2.3,
          distance: 7.5,
          color: LOOK.red
        })
        .runtime({ id: "polarity-light" })
    )
    .add(environments.nightCinematic({ name: "dusk-environment", intensity: 0.74, background: false }))
    /* Eevee post & atmosphere stack: contact shadows, SSAO, SSR on the polished ferrofluid slate deck, overhead
     * magnetosphere aurora curtains, hero ribbon trail, cinematic bloom, cyber-neon grade, and framing vignette. */
    .add(effects.contactShadows({ length: 0.3, thickness: 0.18, steps: 12, intensity: 0.6 }))
    .add(effects.ambientOcclusion({ name: "ssao", intensity: 0.42, radius: 0.65 }))
    .add(effects.screenSpaceReflections({ name: "deck-ssr", intensity: 0.58, roughness: 0.22, maxDistance: 28, thickness: 0.25 }))
    .add(
      effects.auroraRibbon({
        name: "magnetosphere-aurora",
        position: [0, 26, -115],
        color: LOOK.blue,
        colorTop: LOOK.red,
        intensity: 1.15,
        width: 160,
        height: 22,
        segments: 96,
        sway: 0.85,
        shimmer: 0.65
      })
    )
    .add(
      effects.trail({
        name: "ball-trail",
        target: "ball",
        color: LOOK.red,
        intensity: 1.2,
        width: 0.38,
        maxPoints: 34,
        life: 0.3,
        minVertexDistance: 0.06
      })
    )
    .add(effects.cinematicBloom({ name: "bloom", intensity: 0.52, threshold: 0.74, radius: 0.46, color: "#9ee8ff" }))
    .add(
      effects.colorGrade({
        name: "cyber-grade",
        contrast: 1.07,
        saturation: 1.08,
        vibrance: 0.12,
        tint: 0.03,
        temperature: -0.03
      })
    )
    .add(effects.vignette({ name: "vignette", intensity: 0.22, smoothness: 0.64 }));

  const add = (id: string, mesh: MeshData, spec: CustomSpec, castShadow = false, receiveShadow = false): void => {
    builder.add(
      geometry
        .custom(dynamicFrom(mesh), {
          name: id,
          material: material.custom(spec),
          castShadow,
          receiveShadow
        })
        .runtime({ id })
    );
  };
  const addBatch = (id: string, batch: Batch, spec: CustomSpec, castShadow = false, receiveShadow = false): void => {
    builder.add(
      geometry
        .custom(batch.geometry(), {
          name: id,
          material: material.custom(spec),
          castShadow,
          receiveShadow
        })
        .runtime({ id })
    );
  };

  add(
    "sky",
    (() => {
      const m = orbMesh();
      return {
        positions: m.positions.map((v) => v * (388 / 0.45)),
        normals: m.normals.slice(),
        uvs: m.uvs.slice(),
        indices: m.indices.slice()
      };
    })(),
    sceneSkySpec(),
    false,
    false
  );

  builder.add(
    geometry
      .custom(cloudSeaGeometry(), {
        name: "cloud-sea",
        material: material.custom(cloudSeaSpec()),
        castShadow: false,
        receiveShadow: false
      })
      .runtime({ id: "cloud-sea" })
  );
  for (const layer of LAYERS) {
    const fog = LAYER_FOG[layer.id] ?? [1 / 300, 380];
    const spec = layer.glow ? sceneryGlowSpec(layer.tile) : sceneryLitSpec(fog[0], fog[1], layer.tile);
    builder.add(
      geometry
        .custom(layerGeometry(layer).geometry, {
          name: layer.id,
          material: material.custom(spec),
          castShadow: false,
          receiveShadow: false
        })
        .runtime({ id: layer.id })
    );
  }
  addBackdrop(builder);

  /* Hero magnetic orb assembly: swirling split-hemisphere plasma core + refractive `studioGlass` shell + `brushedMetal` collar */
  add("ball", ballMesh(), plasmaOrbSpec({ baseColor: LINEAR.red, poleSouthColor: LINEAR.blue, splitPole: 1, iridescence: 1 }), true, false);
  builder.add(
    geometry
      .custom(dynamicFrom(ballMesh()), {
        name: "ball-glass",
        material: material.studioGlass({
          tint: "#e6f6ff",
          roughness: 0.025,
          thickness: 0.65,
          ior: 1.52,
          clearcoat: 1,
          clearcoatRoughness: 0.04,
          opacity: 0.32,
          envMapIntensity: 1.9
        }),
        castShadow: false,
        receiveShadow: false
      })
      .runtime({ id: "ball-glass" })
  );
  builder.add(
    geometry
      .custom(dynamicFrom(orbCollarMesh()), {
        name: "ball-collar",
        material: material.brushedMetal({
          color: "#dfe8f4",
          roughness: 0.22,
          anisotropy: 0.88,
          clearcoat: 0.42,
          envMapIntensity: 1.75
        }),
        castShadow: false,
        receiveShadow: false
      })
      .runtime({ id: "ball-collar" })
  );
  add("ball-reticle", reticleRingMesh(), fluxRingSpec(LINEAR.red, NORTH_EDGE, 0.72, 2.5), false, false);
  add("ball-shadow", shadowMesh(), shadowSpec(), false, false);
  add("shield", orbMesh(), shieldSpec, false, false);
  add("shockwave", fluxWaveMesh(), fluxRingSpec(LINEAR.red, NORTH_EDGE, LOOK.shockwave.alpha, 4.0), false, false);

  /* Scrolling road & entity batches with tight CORRIDOR_BOUNDS; road receives shadows without inflating shadow cascades */
  const deckWarm = new Batch(translateMesh(deckHalfMesh(), -DECK_WIDTH / 4, 0, 0), CONFIG.POOL_SEGMENTS, LINEAR.deckWarm, CORRIDOR_BOUNDS);
  const deckCool = new Batch(translateMesh(deckHalfMesh(), DECK_WIDTH / 4, 0, 0), CONFIG.POOL_SEGMENTS, LINEAR.deckCoolDim, CORRIDOR_BOUNDS);
  const rails = new Batch(railMesh(), CONFIG.POOL_SEGMENTS * 2, LINEAR.railWarm, CORRIDOR_BOUNDS);
  const dashes = new Batch(dashMesh(), 60, LINEAR.dash, CORRIDOR_BOUNDS);
  addBatch("deck-warm", deckWarm, deckSpec(), false, true);
  addBatch("deck-cool", deckCool, deckSpec(), false, true);
  addBatch("rails", rails, toonSpec([1, 1, 1], undefined, [0, 0, 0], true), false, true);
  addBatch("dashes", dashes, toonSpec([1, 1, 1], undefined, [0, 0, 0], true), false, false);

  const orbs = new Batch(orbMesh(), CONFIG.POOL_ORBS, LINEAR.red, CORRIDOR_BOUNDS);
  addBatch("orbs", orbs, plasmaOrbSpec({ withTone: true, iridescence: 1 }), true, false);
  const powerups = new Batch(powerupMesh(), CONFIG.POOL_POWERUPS, LINEAR.gold, CORRIDOR_BOUNDS);
  addBatch("powerups", powerups, plasmaOrbSpec({ withTone: true, iridescence: 1.2 }), true, false);
  const particles = new Batch(particleMesh(), CONFIG.POOL_PARTICLES, [1, 1, 1], CORRIDOR_BOUNDS);
  addBatch("particles", particles, toonSpec([1, 1, 1], undefined, [0, 0, 0], true), false, false);
  const plasmaBursts = new Batch(PLASMA_FRAMES[0]!, PLASMA_POOL, [1, 1, 1], CORRIDOR_BOUNDS);
  addBatch("plasma-bursts", plasmaBursts, plasmaBurstSpec(PLASMA_ATLAS.texture, CYBER_LUT.texture), false, false);
  const streams = new Batch(fluxArcMesh(), LOOK.magnet.streams, [1, 1, 1], CORRIDOR_BOUNDS);
  addBatch("streams", streams, fluxArcSpec(), false, false);

  const plus = symbolMesh("plus");
  const minus = symbolMesh("minus");
  const ballSymbol = new Batch(plus, 1, [1, 1, 1], CORRIDOR_BOUNDS);
  addBatch("ball-symbol", ballSymbol, flatSpec([1, 1, 1], 0.95, true), false, false);

  const batchEntries: readonly { readonly id: string; readonly batch: Batch; readonly tonesOnly: boolean }[] = [
    { id: "deck-warm", batch: deckWarm, tonesOnly: true },
    { id: "deck-cool", batch: deckCool, tonesOnly: true },
    { id: "rails", batch: rails, tonesOnly: true },
    { id: "dashes", batch: dashes, tonesOnly: true },
    { id: "orbs", batch: orbs, tonesOnly: true },
    { id: "powerups", batch: powerups, tonesOnly: true },
    { id: "particles", batch: particles, tonesOnly: true },
    { id: "plasma-bursts", batch: plasmaBursts, tonesOnly: false },
    { id: "streams", batch: streams, tonesOnly: false },
    { id: "ball-symbol", batch: ballSymbol, tonesOnly: false }
  ];

  return {
    scene: builder,
    bind(app: AuraApp): WorldRuntime {
      const handles = new Map<string, NodeHandle>();
      const node = (id: string): NodeHandle => {
        let h = handles.get(id);
        if (!h) handles.set(id, (h = app.nodes.require(id)));
        return h;
      };
      const maybeController = app.camera;
      if (!maybeController) throw new Error("polarity-orbs: the app exposes no camera controller");
      const controller = maybeController;

      node("shield").setVisible(false);
      node("shockwave").setVisible(false);
      node("ball-symbol").setVisible(false);

      interface Seg {
        i: number;
      }
      interface PlasmaBurst {
        active: boolean;
        x: number;
        y: number;
        z: number;
        age: number;
        maxAge: number;
        size: number;
        rgb: Rgb;
      }

      const segPool = new Map<number, Seg>();
      const segSlots = new Slots<Seg>(CONFIG.POOL_SEGMENTS);
      const dashSlots = new Slots<Seg>(60);
      const orbToneKey: string[] = Array.from({ length: CONFIG.POOL_ORBS }, () => "");
      const powerupToneKey: string[] = Array.from({ length: CONFIG.POOL_POWERUPS }, () => "");
      const particleToneKey: string[] = Array.from({ length: CONFIG.POOL_PARTICLES }, () => "");
      const bursts: PlasmaBurst[] = Array.from({ length: PLASMA_POOL }, () => ({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        age: 0,
        maxAge: 0.4,
        size: 1,
        rgb: LINEAR.red
      }));
      let nextBurst = 0;

      const spawnBurst = (x: number, y: number, z: number, size: number, maxAge: number, rgb: Rgb): void => {
        const slot = bursts[nextBurst % PLASMA_POOL]!;
        nextBurst = (nextBurst + 1) % PLASMA_POOL;
        slot.active = true;
        slot.x = x;
        slot.y = y;
        slot.z = z;
        slot.age = 0;
        slot.maxAge = maxAge;
        slot.size = size;
        slot.rgb = rgb;
      };

      const toneCache = new Map<number, Rgb>();
      const linearOfColor = (hex: number): Rgb => {
        let rgb = toneCache.get(hex);
        if (!rgb) {
          rgb = hexToLinear(`#${hex.toString(16).padStart(6, "0")}`);
          toneCache.set(hex, rgb);
        }
        return rgb;
      };

      let mix = 0;
      let appliedMix = -1;
      let lastTick = 0;
      let lastFlips = 0;
      let lastCollected = 0;
      let lastLives: number = CONFIG.MAX_LIVES;
      let lastShield = false;
      let lastPylonPulse = -1;
      let ringT = Infinity;
      let ringRgb: Rgb = LINEAR.red;
      let ringEdge: Rgb = NORTH_EDGE;
      let flipT = Infinity;
      let flipStartAngle = 0;
      let flipTargetAngle = 0;
      let flipAngle = 0;
      let streamCount = 0;
      let ballModeKey = "";
      let lightKey = "";
      let reticleKey = "";

      function applyRoadTones(live: readonly Seg[]): void {
        const warmTone = mixRgb(LINEAR.deckWarm, LINEAR.deckWarmDim, mix);
        const coolTone = mixRgb(LINEAR.deckCoolDim, LINEAR.deckCool, mix);
        const railL = mixRgb(LINEAR.railWarm, LINEAR.railCool, mix);
        const railR = mixRgb(LINEAR.railCool, LINEAR.railWarm, mix);
        for (const s of live) {
          const slot = segSlots.use(s).slot;
          if (slot < 0) continue;
          deckWarm.setTone(slot, warmTone);
          deckCool.setTone(slot, coolTone);
          rails.setTone(slot * 2, railL);
          rails.setTone(slot * 2 + 1, railR);
        }
      }

      function update(simNow: PolarityOrbsSim, _aspect: number, view: WorldView = {}): void {
        const o = simNow.o;
        const shown = view.shown;
        const reducedMotion = view.reducedMotion ?? false;
        const elapsed = o.tick / 60;
        const rawDt = (o.tick - lastTick) / 60;
        const dt = rawDt < 0 ? 0 : Math.min(0.1, rawDt);
        if (rawDt < 0) {
          lastFlips = o.flips;
          lastCollected = o.orbsCollected;
          lastLives = o.lives;
          lastShield = o.shieldActive;
          lastPylonPulse = -1;
          flipTargetAngle = o.polarity === 1 ? 0 : Math.PI;
          flipStartAngle = flipTargetAngle;
          flipAngle = flipTargetAngle;
          flipT = Infinity;
          ringT = Infinity;
          for (const b of bursts) b.active = false;
        }
        lastTick = o.tick;

        /* Dual-tone world blend: sky + deck dominance shifts smoothly while hero orb flips crisp 180° gyroscope */
        const target = o.polarity === 1 ? 0 : 1;
        mix += (target - mix) * Math.min(1, 6.5 * Math.max(dt, 1 / 60));
        node("sky").setUniform?.("uMix", mix);
        node("sky").setUniform?.("uDrift", elapsed);
        const clouds = node("cloud-sea");
        clouds.setUniform?.("uMix", mix);
        clouds.setUniform?.("uScroll", o.distance);
        clouds.setUniform?.("uDrift", elapsed);
        clouds.setPosition(0, CLOUD_SEA_Y, -250);
        node("deck-warm").setUniform?.("uMix", mix);
        node("deck-warm").setUniform?.("uDrift", elapsed);
        node("deck-cool").setUniform?.("uMix", mix);
        node("deck-cool").setUniform?.("uDrift", elapsed);
        for (const layer of LAYERS) {
          const h = node(layer.id);
          h.setUniform?.("uScroll", layerScroll(layer, o.distance));
          if (!layer.glow) h.setUniform?.("uMix", mix);
        }
        updateBackdrop(node, o.distance, elapsed, mix, reducedMotion);

        /* Road in scrolling frame */
        const distance = o.distance;
        const iMin = Math.floor((distance - 14) / SEG_LEN);
        const iMax = Math.floor((distance + CONFIG.SPAWN_AHEAD + 20) / SEG_LEN);
        const live: Seg[] = [];
        const liveDashes: Seg[] = [];
        for (let i = iMin; i <= iMax; i++) {
          let seg = segPool.get(i);
          if (!seg) {
            seg = { i };
            segPool.set(i, seg);
          }
          live.push(seg);
          if (((i % 4) + 4) % 4 === 0) liveDashes.push(seg);
        }
        for (const key of [...segPool.keys()]) if (key < iMin || key > iMax) segPool.delete(key);
        segSlots.retain(live, (slot) => {
          deckWarm.collapse(slot);
          deckCool.collapse(slot);
          rails.collapse(slot * 2);
          rails.collapse(slot * 2 + 1);
        });
        dashSlots.retain(liveDashes, (slot) => dashes.collapse(slot));
        for (const s of live) {
          const { slot, fresh } = segSlots.use(s);
          if (slot < 0) continue;
          if (fresh) {
            const z = scrollFrameZ(-s.i * SEG_LEN, 0);
            deckWarm.place(slot, 0, -0.15, z, 0, 1, 1, 1);
            deckCool.place(slot, 0, -0.15, z, 0, 1, 1, 1);
            rails.place(slot * 2, -DECK_WIDTH / 2 - 0.15, 0.05, z, 0, 1, 1, 1);
            rails.place(slot * 2 + 1, DECK_WIDTH / 2 + 0.15, 0.05, z, 0, 1, 1, 1);
          }
        }
        for (const s of liveDashes) {
          const { slot, fresh } = dashSlots.use(s);
          if (slot >= 0 && fresh) dashes.place(slot, 0, 0.01, scrollFrameZ(-s.i * SEG_LEN, 0), 0, 1, 1, 1);
        }
        if (Math.abs(mix - appliedMix) > 0.01) {
          applyRoadTones(live);
          appliedMix = mix;
        }
        node("deck-warm").setPosition(0, 0, distance);
        node("deck-cool").setPosition(0, 0, distance);
        node("rails").setPosition(0, 0, distance);
        node("dashes").setPosition(0, 0, distance);

        /* Hero ball: crisp 180° gyroscopic shell flip + 0.18 m magnetic micro-hop + glass shell + brushed collar */
        const p = shown?.player ?? {
          x: o.laneOffset,
          y: BALL_RADIUS * o.ballScale,
          z: 0,
          rotX: -distance / BALL_RADIUS,
          scale: o.ballScale
        };
        if (o.flips !== lastFlips) {
          lastFlips = o.flips;
          ringT = 0;
          flipT = 0;
          flipStartAngle = flipAngle;
          flipTargetAngle = o.polarity === 1 ? 0 : Math.PI;
          if (Math.abs(flipTargetAngle - flipStartAngle) < 0.2) {
            flipStartAngle = o.polarity === 1 ? Math.PI : 0;
          }
          ringRgb = o.polarity === 1 ? LINEAR.red : LINEAR.blue;
          ringEdge = o.polarity === 1 ? NORTH_EDGE : SOUTH_EDGE;
          node("shockwave").setUniform?.("baseColor", [...ringRgb]);
          node("shockwave").setUniform?.("edgeColor", [...ringEdge]);
          if (!reducedMotion) {
            spawnBurst(p.x, p.y + 0.12, p.z, 1.85 * p.scale, 0.34, ringRgb);
          }
        }
        flipT += dt;
        const flipDur = 0.18;
        let hopY = 0;
        if (flipT < flipDur && !reducedMotion) {
          const u = flipT / flipDur;
          const ease = 1 - Math.pow(1 - u, 3);
          flipAngle = flipStartAngle + (flipTargetAngle - flipStartAngle) * ease;
          hopY = 0.18 * Math.sin(Math.PI * u);
        } else {
          flipAngle = o.polarity === 1 ? 0 : Math.PI;
        }

        const ballY = p.y + hopY;
        const alive = o.phase !== "gameOver";
        const ball = node("ball");
        ball.setPosition(p.x, ballY, p.z).setRotation(p.rotX, 0, 0).setScale(p.scale).setVisible(alive);
        ball.setUniform?.("uFlipAngle", flipAngle);

        const nextBallMode = o.rainbowTimer > 0 ? "rainbow" : "split";
        if (nextBallMode !== ballModeKey) {
          if (nextBallMode === "rainbow") {
            ball.setUniform?.("baseColor", [...LINEAR.gold]);
            ball.setUniform?.("uSplitPole", 0);
          } else {
            ball.setUniform?.("baseColor", [...LINEAR.red]);
            ball.setUniform?.("poleSouthColor", [...LINEAR.blue]);
            ball.setUniform?.("uSplitPole", 1);
          }
          ballModeKey = nextBallMode;
        }

        node("ball-glass")
          .setVisible(alive)
          .setPosition(p.x, ballY, p.z)
          .setScale(p.scale * 1.032);
        node("ball-collar")
          .setVisible(alive)
          .setPosition(p.x, ballY, p.z)
          .setRotation(p.rotX * 0.18, elapsed * 1.1, flipAngle)
          .setScale(p.scale);

        /* Dynamic under-ball polarity light (snaps cleanly to crimson +, cyan −, or gold rainbow) */
        const pLight = node("polarity-light");
        pLight.setVisible(alive).setPosition(p.x, ballY + 0.65, p.z - 0.15);
        const targetLightColor = o.rainbowTimer > 0 ? LOOK.gold : o.polarity === 1 ? LOOK.red : LOOK.blue;
        if (targetLightColor !== lightKey) {
          pLight.setLight?.({ color: targetLightColor, intensity: o.rainbowTimer > 0 ? 2.6 : 2.3 });
          lightKey = targetLightColor;
        }

        /* Grounded live magnetic polarity reticle ring at y = 0.03 */
        const reticle = node("ball-reticle");
        const reticleRgb = o.rainbowTimer > 0 ? LINEAR.gold : o.polarity === 1 ? LINEAR.red : LINEAR.blue;
        const reticleEdge = o.rainbowTimer > 0 ? ([1, 0.96, 0.72] as Rgb) : o.polarity === 1 ? NORTH_EDGE : SOUTH_EDGE;
        reticle
          .setVisible(alive)
          .setPosition(p.x, 0.03, p.z)
          .setScale([p.scale * 1.12, 1, p.scale * 1.12]);
        reticle.setUniform?.("uSpin", elapsed * (o.polarity === 1 ? 0.35 : -0.35));
        if (targetLightColor !== reticleKey) {
          reticle.setUniform?.("baseColor", [...reticleRgb]);
          reticle.setUniform?.("edgeColor", [...reticleEdge]);
          reticleKey = targetLightColor;
        }

        const shadow = node("ball-shadow");
        shadow.setVisible(alive).setPosition(p.x, 0.018, p.z).setScale(p.scale * (0.68 - 0.12 * hopY));

        const shield = node("shield");
        shield.setVisible(o.shieldActive && alive);
        if (o.shieldActive) {
          shield.setPosition(p.x, ballY, p.z).setScale(BALL_RADIUS * 2.65 * o.ballScale * (1 + 0.045 * Math.sin(8 * elapsed)));
        }

        /* Live +/- polarity badge above hero orb */
        const wantSymbol = view.symbols !== false && alive;
        node("ball-symbol").setVisible(wantSymbol);
        if (wantSymbol) {
          const kind = o.polarity === 1 ? "plus" : "minus";
          ballSymbol.place(0, p.x, ballY + 0.86 * p.scale, p.z, 0, 1, 1, 1, kind === "plus" ? plus : minus);
          ballSymbol.setTone(0, reticleRgb);
        }

        /* Orbs (dielectric glass + swirling dipole plasma core) */
        for (let i = 0; i < simNow.orbs.length; i++) {
          const orb = simNow.orbs[i];
          if (!orb || !orb.active) {
            orbs.collapse(i);
            orbToneKey[i] = "";
            continue;
          }
          const pulse = 1 + 0.05 * Math.sin(elapsed * 4 + i);
          orbs.place(i, orb.x, 0.9, orb.z, elapsed * 1.5 + i, pulse, pulse, pulse);
          const toneKey = o.rainbowTimer > 0 ? "gold" : orb.polarity === 1 ? "red" : "blue";
          if (toneKey !== orbToneKey[i]) {
            orbs.setTone(i, toneKey === "gold" ? LINEAR.gold : toneKey === "red" ? LINEAR.red : LINEAR.blue);
            orbToneKey[i] = toneKey;
          }
        }

        /* Power-up gems */
        for (let i = 0; i < simNow.powerups.length; i++) {
          const pu = simNow.powerups[i];
          if (!pu || !pu.active) {
            powerups.collapse(i);
            powerupToneKey[i] = "";
            continue;
          }
          powerups.place(i, pu.x, 1 + 0.12 * Math.sin(elapsed * 3 + i), pu.z, elapsed * 2 + i, 1, 1, 1);
          if (pu.kind !== powerupToneKey[i]) {
            powerups.setTone(i, POWERUP_TONES[pu.kind]);
            powerupToneKey[i] = pu.kind;
          }
        }

        /* Sim-driven particles */
        for (let i = 0; i < simNow.particles.length; i++) {
          const pt = simNow.particles[i];
          if (!pt || !pt.active) {
            particles.collapse(i);
            particleToneKey[i] = "";
            continue;
          }
          const k = Math.max(0.15, pt.life / pt.maxLife);
          particles.place(i, pt.x, pt.y, pt.z, 0, k, k, k);
          const colorKey = String(pt.color);
          if (colorKey !== particleToneKey[i]) {
            particles.setTone(i, linearOfColor(pt.color));
            particleToneKey[i] = colorKey;
          }
        }

        /* Trigger `createFlipbookAtlas("plasma")` polarity-discharge bursts on absorption, shield block, wrong hit & trackside coils */
        if (o.orbsCollected > lastCollected) {
          if (!reducedMotion) {
            const burstTone = o.rainbowTimer > 0 ? LINEAR.gold : o.polarity === 1 ? LINEAR.red : LINEAR.blue;
            spawnBurst(p.x, ballY + 0.15, p.z - 0.55, 1.55 + Math.min(0.8, o.mult * 0.12), 0.36, burstTone);
          }
          lastCollected = o.orbsCollected;
        }
        if (o.lives < lastLives) {
          if (!reducedMotion) spawnBurst(p.x, ballY + 0.2, p.z, 2.75, 0.48, [1.0, 0.28, 0.22]);
          lastLives = o.lives;
        } else if (o.lives > lastLives) {
          lastLives = o.lives;
        }
        if (lastShield && !o.shieldActive && o.phase === "playing") {
          if (!reducedMotion) spawnBurst(p.x, ballY + 0.2, p.z, 2.5, 0.44, LINEAR.mint);
        }
        lastShield = o.shieldActive;

        const pylonPulse = Math.floor(elapsed * 2.2);
        if (!reducedMotion && o.phase === "playing" && pylonPulse !== lastPylonPulse) {
          lastPylonPulse = pylonPulse;
          const side = pylonPulse % 2 === 0 ? -1 : 1;
          spawnBurst(side * 7.6, 2.1, -18 - ((pylonPulse * 13) % 28), 2.1, 0.42, side < 0 ? LINEAR.red : LINEAR.blue);
        }

        for (let i = 0; i < PLASMA_POOL; i++) {
          const b = bursts[i]!;
          if (!b.active) {
            plasmaBursts.collapse(i);
            continue;
          }
          b.age += Math.max(dt, 1 / 120);
          if (b.age >= b.maxAge) {
            b.active = false;
            plasmaBursts.collapse(i);
            continue;
          }
          const tNorm = b.age / b.maxAge;
          const frameIdx = Math.min(PLASMA_FRAMES.length - 1, Math.floor(tNorm * PLASMA_FRAMES.length));
          const scale = b.size * (0.65 + 0.75 * Math.pow(tNorm, 0.55));
          plasmaBursts.place(i, b.x, b.y, b.z, 0, scale, scale, scale, PLASMA_FRAMES[frameIdx]);
          plasmaBursts.setTone(i, b.rgb);
        }

        /* Feathered radial Fresnel flip shockwave ring */
        ringT += dt;
        const ring = node("shockwave");
        if (ringT < LOOK.shockwave.seconds && !reducedMotion) {
          const k = ringT / LOOK.shockwave.seconds;
          const ease = 1 - Math.pow(1 - k, 2.2);
          const radius = 0.65 + (LOOK.shockwave.maxRadius - 0.65) * ease;
          ring.setVisible(true).setPosition(p.x, 0.08, p.z).setScale([radius, 1, radius]);
          ring.setUniform?.("uAlpha", LOOK.shockwave.alpha * Math.pow(1 - k, 1.25));
          ring.setUniform?.("uSpin", elapsed * 0.5);
        } else {
          ring.setVisible(false);
        }

        /* Curved sinusoidal dipole flux arcs during magnet attraction */
        let count = 0;
        if (o.magnetTimer > 0) {
          const arcCore = o.polarity === 1 ? LINEAR.red : LINEAR.blue;
          const arcEdge = o.polarity === 1 ? NORTH_EDGE : SOUTH_EDGE;
          node("streams").setUniform?.("coreColor", [...mixRgb(LINEAR.purple, arcCore, 0.45)]);
          node("streams").setUniform?.("edgeColor", [...arcEdge]);
          for (const orb of simNow.orbs) {
            if (!orb.active || orb.z >= 0 || (orb.polarity !== o.polarity && o.rainbowTimer <= 0)) continue;
            const dx = p.x - orb.x, dz = -orb.z;
            const len = Math.hypot(dx, dz);
            if (len > CONFIG.MAGNET_RADIUS || len < 0.2 || count >= LOOK.magnet.streams) continue;
            const yaw = Math.atan2(dx, dz);
            streams.place(count, orb.x + dx / 2, 0.88, orb.z + dz / 2, yaw, 1, 1, len);
            count++;
          }
        }
        for (let i = count; i < streamCount; i++) streams.collapse(i);
        streamCount = count;

        for (const entry of batchEntries) {
          entry.batch.flush(node(entry.id), entry.tonesOnly);
        }

        /* Chase camera + optional real-time impact shake / FOV kick */
        const c = view.camera ?? {
          x: 0.5 * o.laneOffset,
          y: 5.4,
          z: 9,
          lookX: o.laneOffset,
          lookY: 0.9,
          lookZ: -10
        };
        const sx = view.shakeOffset?.[0] ?? 0;
        const sy = view.shakeOffset?.[1] ?? 0;
        const roll = view.shakeRoll ?? 0;
        const fovDelta = view.fovDeltaDeg ?? 0;
        const up: [number, number, number] = roll !== 0 ? [Math.sin(roll), Math.cos(roll), 0] : [0, 1, 0];
        controller.setPose(
          {
            position: [c.x + sx, c.y + sy, c.z],
            target: [c.lookX + sx * 0.35, c.lookY + sy * 0.35, c.lookZ],
            up,
            fov: Math.min(82, Math.max(52, chaseFov(o.speed, reducedMotion) + fovDelta))
          },
          { cut: false }
        );
      }

      function warm(on: boolean): void {
        if (on) {
          for (let i = 0; i < CONFIG.POOL_ORBS; i++) {
            orbs.place(i, (i % 3) * 2.3 - 2.3, 0.9, -40 - Math.floor(i / 3), 0, 1, 1, 1);
            orbs.setTone(i, i % 2 === 0 ? LINEAR.red : LINEAR.blue);
          }
          const kinds: PowerupKind[] = ["rainbow", "shield", "x2", "magnet"];
          for (let i = 0; i < CONFIG.POOL_POWERUPS; i++) {
            powerups.place(i, 0, 1, -50 - i, 0, 1, 1, 1);
            powerups.setTone(i, POWERUP_TONES[kinds[i % 4] as PowerupKind]);
          }
          for (let i = 0; i < 6; i++) {
            particles.place(i, 0, 1 + i * 0.2, -38, 0, 1, 1, 1);
            particles.setTone(i, LINEAR.gold);
          }
          plasmaBursts.place(0, 0, 1.4, -39, 0, 1.5, 1.5, 1.5, PLASMA_FRAMES[4]);
          plasmaBursts.setTone(0, LINEAR.red);
          streams.place(0, 0, 0.9, -36, 0, 1, 1, 2);
          ballSymbol.place(0, 0, 1.6, -34, 0, 1, 1, 1, plus);
          node("shockwave").setVisible(true).setPosition(0, 0.12, -35).setScale([2, 1, 2]);
          node("shield").setVisible(true).setPosition(0, 0.9, -37).setScale(1);
          node("ball-symbol").setVisible(true);
        } else {
          for (let i = 0; i < CONFIG.POOL_ORBS; i++) {
            orbs.collapse(i);
            orbToneKey[i] = "";
          }
          for (let i = 0; i < CONFIG.POOL_POWERUPS; i++) {
            powerups.collapse(i);
            powerupToneKey[i] = "";
          }
          for (let i = 0; i < CONFIG.POOL_PARTICLES; i++) {
            particles.collapse(i);
            particleToneKey[i] = "";
          }
          for (let i = 0; i < PLASMA_POOL; i++) {
            plasmaBursts.collapse(i);
            bursts[i]!.active = false;
          }
          for (let i = 0; i < LOOK.magnet.streams; i++) streams.collapse(i);
          streamCount = 0;
          ballSymbol.collapse(0);
          node("shockwave").setVisible(false);
          node("shield").setVisible(false);
          node("ball-symbol").setVisible(false);
        }
        for (const entry of batchEntries) {
          entry.batch.flush(node(entry.id), entry.tonesOnly);
        }
      }

      const runtime: WorldRuntime = {
        update,
        nodeCount: NODE_IDS.length,
        get uploadedVertices(): number {
          return batchEntries.reduce((sum, e) => sum + e.batch.uploadedVertices, 0);
        },
        warm
      };
      return runtime;
    }
  };
}
