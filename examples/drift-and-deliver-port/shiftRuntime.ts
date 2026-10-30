/**
 * Gridlock Courier (GU47 WP-28): the shift look's per-frame runtime, called from `main.ts` `render()`.
 *
 * - time of day (GC-L6 and the rows it drives): `daylight.ts` on the shift clock, `?at=` pinned
 * - sodium pool (GC-L4): 5 points re-picked onto the nearest lamps every 0.5 s, faded in from sunset
 * - headlight spot (GC-L5): follows the car, on with the beams; brake light glow on the tail lamps
 * - beacon (GC-V2): courier-teal pillar strength per phase; delivery ring burst
 * - VFX (GC-V1): tyre smoke while drifting, nitro streak, 20 s skid ribbon (one draw), speed lines at speed
 * - water time, cloud drift
 *
 * Presentation only: every input is a read of the sim or the shift; nothing is written back (PRD D8).
 */
import { geometry, lights, material, type AuraApp } from "@aura3d/engine";
import { createDaylight, lookFrame, type Daylight } from "./daylight";
import { GOD_RAYS, facadeMaterial, festoonMaterial, type LookRig } from "./look";
import { festoonIntensity } from "./festoons";
import { godRayStrength, phaseAt, phaseIdAt, todSeconds, type PhaseId, type PhaseRow } from "./phases";
import { COURIER_TEAL, FX_KINDS, SMOKE_RATE, DRIZZLE, SPEED_LINES, SkidMarks, deliveryKind, drizzleAt, drizzleSpawn, fxScale, registerCourierFx, skidSpec, speedLineSpawn } from "./fx";
import { HEADLIGHT, LAMP_HEAD_Y, REPICK_SECONDS, SODIUM_INTENSITY, SODIUM_POOL, nearestLamps } from "./lamps";

type Handle = ReturnType<AuraApp["nodes"]["require"]>;

export interface ShiftCarView {
  x: number;
  z: number;
  heading: number;
  speed: number;
  drifting: boolean;
  boosting: boolean;
  braking: boolean;
}

export interface ShiftRuntimeOptions {
  reducedMotion: () => boolean;
  reducedFlash: () => boolean;
  /** `?at=` pin, seconds of the 180 s clock. */
  at?: number;
}

/** The scene nodes the runtime adds next to the look (`main.ts` `buildScene`, shift look only). */
export function shiftSceneNodes(skid: SkidMarks, opts: { reducedFlash?: boolean } = {}) {
  return [
    geometry.custom(geometry.dynamic({ positions: skid.positions, normals: skid.normals, uvs: skid.uvs, indices: skid.indices }), { name: "skid-marks", material: material.custom(skidSpec()), castShadow: false, receiveShadow: false }).runtime({ id: "skid-marks" }),
    // GC-L5: headlight flare for the results orbit (hidden in play; `main.ts` placeFlare). Warm halogen, small ghosts.
    lights
      .lensFlare({
        name: "results-flare",
        position: [0, -50, 0],
        elements: [
          { size: 220, distance: 0, color: "#fff1d6" },
          { size: 36, distance: 0.45, color: "#ffb347" },
          { size: 54, distance: 0.75, color: "#9fd8c4" },
          { size: 28, distance: 1, color: "#ffd9b0" }
        ],
        intensity: opts.reducedFlash ? 0.25 : 0.55,
        edgeFade: 0.2
      })
      .runtime({ id: "results-flare" })
  ];
}

/** GC-V2: the beacon pillar material at a phase strength (courier teal, reserved). */
export const beaconMaterial = (intensity: number) => material.emissive({ color: "#8ff0f2", emissive: COURIER_TEAL, emissiveIntensity: intensity });
export const padMaterial = () => material.emissive({ color: "#7fe7ea", emissive: COURIER_TEAL, emissiveIntensity: 1.4 });

export interface ShiftRuntime {
  /** One render frame. `dt` in seconds (0 on manual frames). */
  frame(dt: number, shift: { elapsed: number; length: number }, car: ShiftCarView, beams: number): void;
  delivered(x: number, z: number): void;
  /** GC-P3: tilt-shift on while a menu (title or results) is up; off in play. Writes only on a change. */
  menu(on: boolean): void;
  pickup(kind: "coin" | "star" | "heart", x: number, z: number): void;
  bump(x: number, z: number): void;
  reset(): void;
  /** QA state: the current row id, time-of-day second and live counts. */
  state(): { phase: PhaseId; tod: number; skidQuads: number; skidLive: number; pool: number[]; beacon: number; writes: number };
  row(): PhaseRow;
}

export function createShiftRuntime(app: AuraApp, look: LookRig, lamps: readonly { x: number; z: number }[], skid: SkidMarks, opts: ShiftRuntimeOptions): ShiftRuntime {
  const handles = new Map<string, Handle | null>();
  const node = (id: string): Handle | undefined => {
    if (!handles.has(id)) handles.set(id, app.nodes.get(id) ?? null);
    return handles.get(id) ?? undefined;
  };
  registerCourierFx(app.effects as never);
  const daylight: Daylight = createDaylight({
    node: (id) => node(id) as never,
    setFog: (spec) => app.atmosphere?.setFog(spec),
    setPostEffect: (name, patch) => app.post?.setEffect(name, patch),
    setEnvironmentIntensity: (v) => app.lighting?.setEnvironmentIntensity(v),
    setWindows: (v) => {
      for (const f of look.facadeNodes) node(f.id)?.setMaterial(facadeMaterial(look.textures, f.key, v));
    }
  });
  let tod = 0;
  let row = phaseAt(0);
  let time = 0;
  let repick = 0;
  let pool: number[] = [];
  let smoke = 0;
  let nitro = 0;
  let lines = 0;
  let lineSeed = 0;
  let drizzle = 0;
  let drizzleSeed = 0;
  let beaconShown = -1;
  let festoonShown = -1;
  let raysShown = -1;
  let menuShown: boolean | null = null;
  let writes = 0;
  let wasDrifting = false;
  const burst = (kind: string, p: [number, number, number], count?: number) => {
    const scale = fxScale(opts.reducedMotion());
    app.effects?.burst(kind, p, { ...(count !== undefined ? { count: Math.max(1, Math.round(count * scale.count)) } : {}), camera: scale.camera });
  };

  return {
    frame(dt, shift, car, beams) {
      time += dt;
      tod = todSeconds(shift.elapsed, shift.length, opts.at);
      row = phaseAt(tod);
      const f = lookFrame(row);
      writes = daylight.apply(f);
      node("sky-dome")?.setUniform?.("skyDrift", time * 0.004);
      node("harbour")?.setUniform?.("waterTime", time);
      // GC-V2 beacon strength, quantised (setMaterial)
      const b = Math.round(f.beacon * 10) / 10;
      if (b !== beaconShown) {
        beaconShown = b;
        node("dropoff-beacon")?.setMaterial(beaconMaterial(b));
      }
      // GC-V3 festoon bulbs, quantised (setMaterial only on a step change)
      const fe = festoonIntensity(row.festoon);
      if (fe !== festoonShown) {
        festoonShown = fe;
        node("festoons")?.setMaterial(festoonMaterial(row.festoon));
      }
      // GC-S5 sunset god rays: enabled and intensity only when the quantised strength steps
      const rays = godRayStrength(row.sun.elevationDeg);
      if (rays !== raysShown) {
        raysShown = rays;
        // `enabled` is not a setEffect field (the engine throws POST_FIELD_UNSUPPORTED): the shafts go on and off
        // with setEffectEnabled, so away from sunset the warm inscatter leaves the chain instead of hazing the frame
        app.post?.setEffectEnabled("volumetricFog", rays > 0);
        if (rays > 0) app.post?.setEffect("volumetricFog", { intensity: GOD_RAYS.intensity * rays, density: GOD_RAYS.density * rays });
      }
      // GC-L4 sodium pool
      repick -= dt;
      if (repick <= 0 || pool.length === 0) {
        repick = REPICK_SECONDS;
        pool = nearestLamps(lamps, car.x, car.z, car.heading, SODIUM_POOL);
        pool.forEach((li, i) => {
          const l = lamps[li]!;
          node(`sodium-${i}`)?.setPosition(l.x, LAMP_HEAD_Y, l.z);
        });
      }
      for (let i = 0; i < SODIUM_POOL; i++) {
        const on = i < pool.length ? f.lamps : 0;
        node(`sodium-${i}`)?.setLight?.({ intensity: SODIUM_INTENSITY * on });
      }
      // GC-L5 headlight spot: on with the beams; aimed 20 m ahead
      const s = Math.sin(car.heading);
      const c = Math.cos(car.heading);
      const hl = node("headlight");
      if (hl) {
        hl.setLight?.({ intensity: HEADLIGHT.intensity * beams, position: [car.x + s * HEADLIGHT.ahead, HEADLIGHT.y, car.z + c * HEADLIGHT.ahead], direction: [s * 0.998, -0.06, c * 0.998] });
      }
      // GC-V1 tyre smoke, nitro streak and skid ribbon
      const rear: [number, number, number] = [car.x - s * 1.5, 0.25, car.z - c * 1.5];
      if (car.drifting && Math.abs(car.speed) > 7) {
        smoke -= dt;
        if (smoke <= 0) {
          smoke = 1 / SMOKE_RATE;
          burst(FX_KINDS.tyreSmoke, rear, 6);
        }
        if (skid.lay(car.x, car.z, car.heading, time) > 0) {
          const h = node("skid-marks");
          h?.updateAttribute?.("position", { array: skid.positions });
          h?.updateAttribute?.("uv", { array: skid.uvs });
        }
      } else if (wasDrifting) skid.lift();
      wasDrifting = car.drifting;
      node("skid-marks")?.setUniform?.("skidNow", time);
      if (car.boosting) {
        nitro -= dt;
        if (nitro <= 0) {
          nitro = 0.08;
          burst(FX_KINDS.nitro, [rear[0], 0.55, rear[2]], 4);
        }
      }
      // GC-V3 intro drizzle: the shower ends at 0:20 of the shift (not shown when ?at= pins the clock)
      const wet = opts.at === undefined ? drizzleAt(shift.elapsed) : 0;
      drizzle -= dt;
      if (dt > 0 && wet > 0 && drizzle <= 0) {
        drizzle = DRIZZLE.interval / wet;
        burst(FX_KINDS.drizzle, drizzleSpawn(car, drizzleSeed++), 14);
      }
      // GC-V1 speed lines: streaks ahead of the car rushing back past the camera at speed (off under reduced motion)
      lines -= dt;
      if (dt > 0 && lines <= 0) {
        const spawn = speedLineSpawn(car, lineSeed, opts.reducedMotion());
        if (spawn) {
          lines = SPEED_LINES.interval;
          lineSeed++;
          app.effects?.burst(FX_KINDS.speedLines, spawn.at, { normal: spawn.normal, camera: false });
        }
      }
    },
    menu(on) {
      if (on === menuShown) return;
      menuShown = on;
      app.post?.setEffectEnabled("depthOfField", on);
    },
    delivered(x, z) {
      burst(deliveryKind(opts.reducedMotion(), opts.reducedFlash()), [x, 0.4, z]);
    },
    pickup(kind, x, z) {
      burst(kind === "coin" ? FX_KINDS.coin : kind === "star" ? FX_KINDS.star : FX_KINDS.heart, [x, 1.2, z]);
    },
    bump(x, z) {
      burst(FX_KINDS.bump, [x, 0.6, z]);
    },
    reset() {
      skid.reset();
      const h = node("skid-marks");
      h?.updateAttribute?.("uv", { array: skid.uvs });
      smoke = 0;
      nitro = 0;
      drizzle = 0;
    },
    state() {
      return { phase: phaseIdAt(tod), tod, skidQuads: skid.written, skidLive: skid.liveCount(time), pool: [...pool], beacon: beaconShown, writes };
    },
    row: () => row
  };
}
