/**
 * Polarity Orbs world on the public engine surface: kit Batch/Slots for the road and pooled entities, a dual-dusk
 * sky that blends warm↔cool on flip, the flip shockwave ring and magnet attraction streams. Road segments live in
 * the scrolling frame (vertices written once, node moved by the distance); entities are small enough to rewrite
 * per frame with dirty-range uploads.
 */
import { camera, effects, environments, geometry, lights, material, scene, type AuraApp } from "@aura3d/engine";
import {
  Batch, Slots, flatSpec, shadowSpec, toonSpec, hexToLinear, scrollFrameZ,
  type CustomSpec, type MeshData, type Rgb
} from "../../../examples/shared/runner-kit/index";
import { CONFIG, type PolarityOrbsSim, type PowerupKind } from "./sim";
import { LOOK, LINEAR, mixRgb } from "./look";
import {
  LAYERS, CLOUD_SEA_Y, cloudSeaGeometry, cloudSeaSpec, deckSpec, layerGeometry, layerScroll, sceneSkySpec, sceneryGlowSpec, sceneryLitSpec
} from "./scenery";
import {
  BALL_RADIUS, SEG_LEN, DECK_WIDTH, ballMesh, orbMesh, particleMesh, powerupMesh,
  deckHalfMesh, railMesh, dashMesh, shadowMesh, shockwaveMesh, streamMesh, symbolMesh, translateMesh
} from "./meshes";
import { CAMERA_FAR, chaseFov, type Shown } from "./presentation";

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
  "sky", "deck-warm", "deck-cool", "rails", "dashes", "ball", "ball-shadow", "ball-symbol",
  "shield", "orbs", "powerups", "particles", "shockwave", "streams",
  "cloud-sea", "scenery-near", "scenery-mid", "scenery-far", "scenery-motes"
] as const;

/** Fog density / end per lit scenery layer (presentation). */
const LAYER_FOG: Record<string, readonly [number, number]> = {
  "scenery-near": [1 / 400, 380],
  "scenery-mid": [1 / 330, 380],
  "scenery-far": [1 / 230, 385]
};

/** Every distinct `material.custom` program the game draws with (for the GLSL compile test). */
export function allProgramSpecs(): readonly { readonly name: string; readonly spec: CustomSpec }[] {
  return [
    { name: "sky-blend", spec: sceneSkySpec() },
    { name: "scenery-lit", spec: sceneryLitSpec(1 / 300, 380) },
    { name: "scenery-glow", spec: sceneryGlowSpec() },
    { name: "cloud-sea", spec: cloudSeaSpec() },
    { name: "deck", spec: deckSpec() },
    { name: "toon", spec: toonSpec(LINEAR.red) },
    { name: "toon-tone", spec: toonSpec([1, 1, 1], undefined, [0, 0, 0], true) },
    { name: "flat", spec: flatSpec(LINEAR.mint, 0.25) },
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

export function buildWorld(options: WorldOptions): World {
  const builder = scene()
    .background(LOOK.background)
    .camera(camera.perspective({ position: [0, 5.4, 9], target: [0, 0.9, -10], fov: 60, near: 0.1, far: CAMERA_FAR }))
    /* Authored key + IBL fill (art direction contract): the toon programs shade themselves, but the scene still
     * mounts exactly one shadowed directional key and a preset environment, never an ambient light. */
    .add(lights.directional({
      name: "dusk-key",
      position: [LOOK.sun[0] * 40, LOOK.sun[1] * 40, LOOK.sun[2] * 40],
      target: [0, 0, 0],
      intensity: 1.4,
      color: "#ffe8d8",
      shadow: { cascades: 1, maxDistance: 120 }
    }))
    .add(environments.preset("sunset", { name: "dusk-environment", intensity: 0.55, background: false }))
    /* Post: emissive crystals, arch strips and orbs bloom; a gentle grade and vignette frame the dusk. */
    .add(effects.bloom({ name: "bloom", intensity: 0.55, threshold: 0.82, radius: 0.55 }))
    .add(effects.vignette({ name: "vignette", intensity: 0.2, smoothness: 0.6 }));

  const add = (id: string, mesh: MeshData, spec: CustomSpec, shadows = true): void => {
    builder.add(geometry.custom(dynamicFrom(mesh), { name: id, material: material.custom(spec), ...(shadows ? {} : { castShadow: false, receiveShadow: false }) }).runtime({ id }));
  };
  const addBatch = (id: string, batch: Batch, spec: CustomSpec): void => {
    builder.add(geometry.custom(batch.geometry(), { name: id, material: material.custom(spec) }).runtime({ id }));
  };

  add("sky", (() => {
    // Sky dome: a coarse sphere is enough for a per-direction gradient.
    const m = orbMesh();
    const scaled: MeshData = {
      positions: m.positions.map((v) => v * (388 / 0.45)),
      normals: m.normals.slice(),
      uvs: m.uvs.slice(),
      indices: m.indices.slice()
    };
    return scaled;
  })(), sceneSkySpec(), false);

  /* Scenery never casts or receives engine shadows (its programs light themselves); a 1400-unit cloud plane in the
   * shadow pass alone cost about three quarters of the frame rate. */
  builder.add(geometry.custom(cloudSeaGeometry(), { name: "cloud-sea", material: material.custom(cloudSeaSpec()), castShadow: false, receiveShadow: false }).runtime({ id: "cloud-sea" }));
  for (const layer of LAYERS) {
    const fog = LAYER_FOG[layer.id] ?? [1 / 300, 380];
    const spec = layer.glow ? sceneryGlowSpec(layer.tile) : sceneryLitSpec(fog[0], fog[1], layer.tile);
    builder.add(geometry.custom(layerGeometry(layer).geometry, { name: layer.id, material: material.custom(spec), castShadow: false, receiveShadow: false }).runtime({ id: layer.id }));
  }

  add("ball", ballMesh(), toonSpec(LINEAR.red));
  add("ball-shadow", shadowMesh(), shadowSpec(), false); // a blob shadow must not itself cast (DEPTH_ALPHA_HASH_DEGRADED)
  add("shield", orbMesh(), flatSpec(LINEAR.mint, 0.25), false); // translucent bubble: no opaque shadow
  add("shockwave", shockwaveMesh(), flatSpec([1, 1, 1], LOOK.shockwave.alpha), false);

  const deckWarm = new Batch(translateMesh(deckHalfMesh(), -DECK_WIDTH / 4, 0, 0), CONFIG.POOL_SEGMENTS, LINEAR.deckWarm);
  const deckCool = new Batch(translateMesh(deckHalfMesh(), DECK_WIDTH / 4, 0, 0), CONFIG.POOL_SEGMENTS, LINEAR.deckCoolDim);
  const rails = new Batch(railMesh(), CONFIG.POOL_SEGMENTS, LINEAR.railWarm);
  const dashes = new Batch(dashMesh(), 60, LINEAR.dash);
  addBatch("deck-warm", deckWarm, deckSpec());
  addBatch("deck-cool", deckCool, deckSpec());
  addBatch("rails", rails, toonSpec([1, 1, 1], undefined, [0, 0, 0], true));
  addBatch("dashes", dashes, toonSpec([1, 1, 1], undefined, [0, 0, 0], true));

  const orbs = new Batch(orbMesh(), CONFIG.POOL_ORBS, LINEAR.red);
  addBatch("orbs", orbs, toonSpec([1, 1, 1], undefined, [0, 0, 0], true));
  const powerups = new Batch(powerupMesh(), CONFIG.POOL_POWERUPS, LINEAR.gold);
  addBatch("powerups", powerups, toonSpec([1, 1, 1], undefined, [0, 0, 0], true));
  const particles = new Batch(particleMesh(), CONFIG.POOL_PARTICLES, [1, 1, 1]);
  addBatch("particles", particles, toonSpec([1, 1, 1], undefined, [0, 0, 0], true));
  const streams = new Batch(streamMesh(), LOOK.magnet.streams);
  addBatch("streams", streams, flatSpec(LINEAR.purple, LOOK.magnet.alpha));

  const plus = symbolMesh("plus");
  const minus = symbolMesh("minus");
  const ballSymbol = new Batch(plus, 1, [1, 1, 1]);
  addBatch("ball-symbol", ballSymbol, flatSpec([1, 1, 1], 0.95, true));

  const batches = [deckWarm, deckCool, rails, dashes, orbs, powerups, particles, streams, ballSymbol];

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

      interface Seg { i: number }
      const segPool = new Map<number, Seg>();
      const segSlots = new Slots<Seg>(CONFIG.POOL_SEGMENTS);
      const dashSlots = new Slots<Seg>(60);
      const orbToneKey: string[] = Array.from({ length: CONFIG.POOL_ORBS }, () => "");
      const powerupToneKey: string[] = Array.from({ length: CONFIG.POOL_POWERUPS }, () => "");
      const particleToneKey: string[] = Array.from({ length: CONFIG.POOL_PARTICLES }, () => "");
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
      let ringT = Infinity;
      let ringRgb: Rgb = LINEAR.red;
      let streamCount = 0;
      let ballKey = "";
      let symbolKind = "";

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
        const dt = Math.min(0.1, Math.max(0, (o.tick - lastTick) / 60));
        lastTick = o.tick;

        /* dual-tone blend: red polarity = warm dominant, blue = cool dominant */
        const target = o.polarity === 1 ? 0 : 1;
        mix += (target - mix) * Math.min(1, 6 * Math.max(dt, 1 / 60));
        node("sky").setUniform?.("uMix", mix);
        node("sky").setUniform?.("uDrift", elapsed);
        const clouds = node("cloud-sea");
        clouds.setUniform?.("uMix", mix);
        clouds.setUniform?.("uScroll", o.distance);
        clouds.setUniform?.("uDrift", elapsed);
        clouds.setPosition(0, CLOUD_SEA_Y, -250);
        node("deck-warm").setUniform?.("uMix", mix);
        node("deck-cool").setUniform?.("uMix", mix);
        for (const layer of LAYERS) {
          const h = node(layer.id);
          h.setUniform?.("uScroll", layerScroll(layer, o.distance));
          if (!layer.glow) h.setUniform?.("uMix", mix);
        }

        /* road in the scrolling frame: vertices written once at run-space z, nodes moved by -distance */
        const distance = o.distance;
        const iMin = Math.floor((distance - 14) / SEG_LEN);
        const iMax = Math.floor((distance + CONFIG.SPAWN_AHEAD + 20) / SEG_LEN);
        const live: Seg[] = [];
        const liveDashes: Seg[] = [];
        for (let i = iMin; i <= iMax; i++) {
          let seg = segPool.get(i);
          if (!seg) { seg = { i }; segPool.set(i, seg); }
          live.push(seg);
          if (((i % 4) + 4) % 4 === 0) liveDashes.push(seg);
        }
        for (const key of [...segPool.keys()]) if (key < iMin || key > iMax) segPool.delete(key);
        segSlots.retain(live, (slot) => { deckWarm.collapse(slot); deckCool.collapse(slot); rails.collapse(slot * 2); rails.collapse(slot * 2 + 1); });
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

        /* ball */
        const p = shown?.player ?? { x: o.laneOffset, y: BALL_RADIUS * o.ballScale, z: 0, rotX: -distance / BALL_RADIUS, scale: o.ballScale };
        const ball = node("ball");
        ball.setPosition(p.x, p.y, p.z).setRotation(p.rotX, 0, 0).setScale(p.scale).setVisible(o.phase !== "gameOver");
        const ownRgb = o.rainbowTimer > 0 ? LINEAR.gold : mixRgb(LINEAR.red, LINEAR.blue, mix);
        const key = o.rainbowTimer > 0 ? "rainbow" : `${Math.round(mix * 50)}`;
        if (key !== ballKey) {
          ball.setUniform?.("baseColor", [...ownRgb]);
          ball.setUniform?.("emissive", [0.08 * ownRgb[0], 0.08 * ownRgb[1], 0.08 * ownRgb[2]]);
          ballKey = key;
        }
        const shadow = node("ball-shadow");
        shadow.setVisible(o.phase !== "gameOver").setPosition(p.x, 0.05, p.z).setScale(p.scale * 0.66);
        const shield = node("shield");
        shield.setVisible(o.shieldActive && o.phase !== "gameOver");
        if (o.shieldActive) shield.setPosition(p.x, p.y, p.z).setScale(BALL_RADIUS * 2.6 * o.ballScale * (1 + 0.05 * Math.sin(8 * elapsed)));

        /* polarity symbol over the ball (setting) */
        const wantSymbol = view.symbols === true && o.phase !== "gameOver";
        node("ball-symbol").setVisible(wantSymbol);
        if (wantSymbol) {
          const kind = o.polarity === 1 ? "plus" : "minus";
          ballSymbol.place(0, p.x, p.y + 0.85 * p.scale, p.z, 0, 1, 1, 1, kind === "plus" ? plus : minus);
          if (kind !== symbolKind) { symbolKind = kind; }
        }

        /* orbs */
        for (let i = 0; i < simNow.orbs.length; i++) {
          const orb = simNow.orbs[i];
          if (!orb || !orb.active) { orbs.collapse(i); orbToneKey[i] = ""; continue; }
          const pulse = 1 + 0.05 * Math.sin(elapsed * 4 + i);
          orbs.place(i, orb.x, 0.9, orb.z, elapsed * 1.5 + i, pulse, pulse, pulse);
          const toneKey = o.rainbowTimer > 0 ? "gold" : orb.polarity === 1 ? "red" : "blue";
          if (toneKey !== orbToneKey[i]) {
            orbs.setTone(i, toneKey === "gold" ? LINEAR.gold : toneKey === "red" ? LINEAR.red : LINEAR.blue);
            orbToneKey[i] = toneKey;
          }
        }

        /* powerups */
        for (let i = 0; i < simNow.powerups.length; i++) {
          const pu = simNow.powerups[i];
          if (!pu || !pu.active) { powerups.collapse(i); powerupToneKey[i] = ""; continue; }
          powerups.place(i, pu.x, 1 + 0.12 * Math.sin(elapsed * 3 + i), pu.z, elapsed * 2 + i, 1, 1, 1);
          if (pu.kind !== powerupToneKey[i]) {
            powerups.setTone(i, POWERUP_TONES[pu.kind]);
            powerupToneKey[i] = pu.kind;
          }
        }

        /* particles (sim-driven, world space) */
        for (let i = 0; i < simNow.particles.length; i++) {
          const pt = simNow.particles[i];
          if (!pt || !pt.active) { particles.collapse(i); particleToneKey[i] = ""; continue; }
          const k = Math.max(0.15, pt.life / pt.maxLife);
          particles.place(i, pt.x, pt.y, pt.z, 0, k, k, k);
          const colorKey = String(pt.color);
          if (colorKey !== particleToneKey[i]) {
            particles.setTone(i, linearOfColor(pt.color));
            particleToneKey[i] = colorKey;
          }
        }

        /* flip shockwave ring */
        if (o.flips !== lastFlips) {
          lastFlips = o.flips;
          ringT = 0;
          ringRgb = o.polarity === 1 ? LINEAR.red : LINEAR.blue;
          node("shockwave").setUniform?.("baseColor", [...ringRgb]);
        }
        ringT += dt;
        const ring = node("shockwave");
        if (ringT < LOOK.shockwave.seconds && !reducedMotion) {
          const k = ringT / LOOK.shockwave.seconds;
          const radius = 0.5 + (LOOK.shockwave.maxRadius - 0.5) * k;
          ring.setVisible(true).setPosition(o.laneOffset, 0.12, 0).setScale([radius, 1, radius]);
          ring.setUniform?.("alpha", LOOK.shockwave.alpha * (1 - k));
        } else {
          ring.setVisible(false);
        }

        /* magnet attraction streams: matching orbs inside the radius get a glowing line to the player */
        let count = 0;
        if (o.magnetTimer > 0) {
          for (const orb of simNow.orbs) {
            if (!orb.active || orb.z >= 0 || orb.polarity !== o.polarity) continue;
            const dx = o.laneOffset - orb.x, dz = -orb.z;
            const len = Math.hypot(dx, dz);
            if (len > CONFIG.MAGNET_RADIUS || len < 0.2 || count >= LOOK.magnet.streams) continue;
            const yaw = Math.atan2(dx, dz);
            streams.place(count, orb.x + dx / 2, 0.9, orb.z + dz / 2, yaw, 1, 1, len);
            count++;
          }
        }
        for (let i = count; i < streamCount; i++) streams.collapse(i);
        streamCount = count;

        for (const b of batches) b.flush(node(b === deckWarm ? "deck-warm" : b === deckCool ? "deck-cool" : b === rails ? "rails" : b === dashes ? "dashes" : b === orbs ? "orbs" : b === powerups ? "powerups" : b === particles ? "particles" : b === streams ? "streams" : "ball-symbol"), b !== streams && b !== ballSymbol);

        /* chase camera */
        const c = view.camera ?? {
          x: 0.5 * o.laneOffset, y: 5.4, z: 9, lookX: o.laneOffset, lookY: 0.9, lookZ: -10
        };
        controller.setPose(
          { position: [c.x, c.y, c.z], target: [c.lookX, c.lookY, c.lookZ], up: [0, 1, 0], fov: chaseFov(o.speed, reducedMotion) },
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
          streams.place(0, 0, 0.9, -36, 0, 1, 1, 2);
          ballSymbol.place(0, 0, 1.6, -34, 0, 1, 1, 1, plus);
          node("shockwave").setVisible(true).setPosition(0, 0.12, -35).setScale([2, 1, 2]);
          node("shield").setVisible(true).setPosition(0, 0.9, -37).setScale(1);
          node("ball-symbol").setVisible(true);
        } else {
          for (let i = 0; i < CONFIG.POOL_ORBS; i++) { orbs.collapse(i); orbToneKey[i] = ""; }
          for (let i = 0; i < CONFIG.POOL_POWERUPS; i++) { powerups.collapse(i); powerupToneKey[i] = ""; }
          for (let i = 0; i < CONFIG.POOL_PARTICLES; i++) { particles.collapse(i); particleToneKey[i] = ""; }
          for (let i = 0; i < LOOK.magnet.streams; i++) streams.collapse(i);
          streamCount = 0;
          ballSymbol.collapse(0);
          node("shockwave").setVisible(false);
          node("shield").setVisible(false);
          node("ball-symbol").setVisible(false);
        }
        for (const b of batches) b.flush(node(b === deckWarm ? "deck-warm" : b === deckCool ? "deck-cool" : b === rails ? "rails" : b === dashes ? "dashes" : b === orbs ? "orbs" : b === powerups ? "powerups" : b === particles ? "particles" : b === streams ? "streams" : "ball-symbol"), b !== streams && b !== ballSymbol);
      }

      const runtime: WorldRuntime = {
        update,
        nodeCount: NODE_IDS.length,
        get uploadedVertices(): number {
          return batches.reduce((sum, b) => sum + b.uploadedVertices, 0);
        },
        warm
      };
      return runtime;
    }
  };
}