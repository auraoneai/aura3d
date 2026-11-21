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
import { effects, geometry, lights, material, type AuraApp } from "@aura3d/engine";
import { createFlipbookAtlas } from "@aura3d/engine/game";
import { dualEnergyFieldSpec } from "../../apps/showcase-port-shared/dual-shaders";
import { createDaylight, followHeading, lookFrame, turnKey, type Daylight } from "./daylight";
import { facadeMaterial, festoonMaterial, type LookRig } from "./look";
import { festoonIntensity } from "./festoons";
import { phaseAt, phaseIdAt, todSeconds, type PhaseId, type PhaseRow } from "./phases";
import { COURIER_TEAL, FX_KINDS, SMOKE_RATE, DRIZZLE, SPEED_LINES, SkidMarks, deliveryKind, drizzleAt, drizzleSpawn, fxScale, registerCourierFx, skidSpec, speedLineSpawn } from "./fx";
import { HEADLIGHT, LAMP_HEAD_Y, REPICK_SECONDS, SODIUM_INTENSITY, SODIUM_POOL, nearestLamps } from "./lamps";

type Handle = ReturnType<AuraApp["nodes"]["require"]>;
type HiddenFlipbookOptions = NonNullable<Parameters<typeof effects.flipbook>[0]> & { readonly visible?: boolean };
const flipbookNode = (options: HiddenFlipbookOptions) => effects.flipbook(options);

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
  /** 5.x A5 lab: the headlight carries an IES profile (absolute candela), so beams-off hides the light instead of dimming it. */
  iesHeadlight?: boolean;
}

/** The scene nodes the runtime adds next to the look (`main.ts` `buildScene`, shift look only). */
export function shiftSceneNodes(skid: SkidMarks, opts: { reducedFlash?: boolean } = {}) {
  const dustAtlas = createFlipbookAtlas("dust", [228, 234, 242]);
  const sparksAtlas = createFlipbookAtlas("sparks", [255, 206, 112]);
  const rippleAtlas = createFlipbookAtlas("ripple", [34, 195, 201]);
  return [
    geometry.custom(geometry.dynamic({ positions: skid.positions, normals: skid.normals, uvs: skid.uvs, indices: skid.indices }), { name: "skid-marks", material: material.custom(skidSpec()), castShadow: false, receiveShadow: false }).runtime({ id: "skid-marks" }),
    flipbookNode({ name: "drift-smoke-l", texture: dustAtlas.texture, spriteColumns: dustAtlas.columns, spriteRows: dustAtlas.rows, frameRate: 28, size: 1.65, color: "#e4eaf2", blend: "alpha", visible: false, position: [0, -60, 0] }).runtime({ id: "drift-smoke-l" }),
    flipbookNode({ name: "drift-smoke-r", texture: dustAtlas.texture, spriteColumns: dustAtlas.columns, spriteRows: dustAtlas.rows, frameRate: 28, size: 1.65, color: "#e4eaf2", blend: "alpha", visible: false, prewarm: 0.35, position: [0, -60, 0] }).runtime({ id: "drift-smoke-r" }),
    flipbookNode({ name: "bump-sparks", texture: sparksAtlas.texture, spriteColumns: sparksAtlas.columns, spriteRows: sparksAtlas.rows, frameRate: 36, size: 1.45, color: "#ffce70", blend: "additive", visible: false, position: [0, -60, 0] }).runtime({ id: "bump-sparks" }),
    flipbookNode({ name: "delivery-ripple", texture: rippleAtlas.texture, spriteColumns: rippleAtlas.columns, spriteRows: rippleAtlas.rows, frameRate: 26, size: 5.2, color: COURIER_TEAL, blend: "additive", visible: false, position: [0, -60, 0] }).runtime({ id: "delivery-ripple" }),
    // GC-L5: headlight flare for the results orbit (hidden in play; `main.ts` placeFlare). Crisp halogen-white, small cool ghosts.
    lights
      .lensFlare({
        name: "results-flare",
        position: [0, -50, 0],
        elements: [
          { size: 220, distance: 0, color: "#f8fbff" },
          { size: 36, distance: 0.45, color: "#cfe6ff" },
          { size: 54, distance: 0.75, color: "#8ee5ea" },
          { size: 28, distance: 1, color: "#e4f0ff" }
        ],
        intensity: opts.reducedFlash ? 0.25 : 0.55,
        edgeFade: 0.2
      })
      .runtime({ id: "results-flare" })
  ];
}

/** GC-V2: paired GLSL+WGSL Fresnel + scanline energy-field beacon & objective ring in reserved courier teal. */
export const beaconMaterial = (intensity: number) =>
  material.custom(
    dualEnergyFieldSpec({
      coreColor: [0.06, 0.68, 0.74],
      edgeColor: [0.58, 0.98, 1.0],
      pulseSpeed: 2.8,
      scanScale: 0.28,
      opacity: Math.min(0.84, 0.34 + intensity * 0.16)
    })
  );
export const ringMaterial = () =>
  material.custom(
    dualEnergyFieldSpec({
      coreColor: [0.12, 0.78, 0.82],
      edgeColor: [0.72, 1.0, 1.0],
      pulseSpeed: 3.6,
      scanScale: 1.6,
      opacity: 0.78
    })
  );
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
  registerCourierFx(app.effects);
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
  let menuShown: boolean | null = null;
  let writes = 0;
  let wasDrifting = false;
  let smokeFlipbookOn = false;
  let sparkTimer = 0;
  let rippleTimer = 0;
  let keyHeading: number | undefined;
  const burst = (kind: string, p: [number, number, number], count?: number) => {
    const scale = fxScale(opts.reducedMotion());
    app.effects?.burst(kind, p, { ...(count !== undefined ? { count: Math.max(1, Math.round(count * scale.count)) } : {}), camera: scale.camera });
  };

  return {
    frame(dt, shift, car, beams) {
      time += dt;
      tod = todSeconds(shift.elapsed, shift.length, opts.at);
      row = phaseAt(tod);
      // GU47 phase 4: the key follows the chase heading (smoothed), so it always lights the avenue ahead
      keyHeading = keyHeading === undefined ? car.heading : followHeading(keyHeading, car.heading, dt);
      const authored = lookFrame(row);
      const f = { ...authored, key: { ...authored.key, direction: turnKey(authored.key.direction, keyHeading) } };
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
        // a measured profile replaces the scalar intensity, so the beams fade by visibility (pops on at 2% instead of ramping)
        if (opts.iesHeadlight) hl.setVisible?.(beams > 0.02);
        hl.setLight?.({ intensity: HEADLIGHT.intensity * beams, position: [car.x + s * HEADLIGHT.ahead, HEADLIGHT.y, car.z + c * HEADLIGHT.ahead], direction: [s * 0.998, -0.06, c * 0.998] });
      }
      // GC-V1 tyre smoke, flipbook smoke plumes, nitro streak and skid ribbon
      const rear: [number, number, number] = [car.x - s * 1.5, 0.25, car.z - c * 1.5];
      const activeDrift = car.drifting && Math.abs(car.speed) > 7;
      if (activeDrift) {
        smoke -= dt;
        if (smoke <= 0) {
          smoke = 1 / SMOKE_RATE;
          burst(FX_KINDS.tyreSmoke, rear, 6);
        }
        if (!opts.reducedMotion()) {
          const sl = node("drift-smoke-l");
          const sr = node("drift-smoke-r");
          sl?.setPosition(car.x - s * 1.48 - c * 0.78, 0.56, car.z - c * 1.48 + s * 0.78);
          sr?.setPosition(car.x - s * 1.48 + c * 0.78, 0.56, car.z - c * 1.48 - s * 0.78);
          sl?.setVisible(true);
          sr?.setVisible(true);
          smokeFlipbookOn = true;
        }
        if (skid.lay(car.x, car.z, car.heading, time) > 0) {
          const h = node("skid-marks");
          h?.updateAttribute?.("position", { array: skid.positions });
          h?.updateAttribute?.("uv", { array: skid.uvs });
        }
      } else {
        if (wasDrifting) skid.lift();
        if (smokeFlipbookOn) {
          const sl = node("drift-smoke-l");
          const sr = node("drift-smoke-r");
          sl?.setPosition(0, -60, 0);
          sr?.setPosition(0, -60, 0);
          sl?.setVisible(false);
          sr?.setVisible(false);
          smokeFlipbookOn = false;
        }
      }
      wasDrifting = car.drifting;
      if (sparkTimer > 0) {
        sparkTimer -= dt;
        if (sparkTimer <= 0) {
          const sp = node("bump-sparks");
          sp?.setPosition(0, -60, 0);
          sp?.setVisible(false);
        }
      }
      if (rippleTimer > 0) {
        rippleTimer -= dt;
        if (rippleTimer <= 0) {
          const rp = node("delivery-ripple");
          rp?.setPosition(0, -60, 0);
          rp?.setVisible(false);
        }
      }
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
    },
    delivered(x, z) {
      burst(deliveryKind(opts.reducedMotion(), opts.reducedFlash()), [x, 0.4, z]);
      if (!opts.reducedMotion() && !opts.reducedFlash()) {
        rippleTimer = 0.65;
        const rp = node("delivery-ripple");
        rp?.setPosition(x, 0.85, z);
        rp?.setVisible(true);
      }
    },
    pickup(kind, x, z) {
      burst(kind === "coin" ? FX_KINDS.coin : kind === "star" ? FX_KINDS.star : FX_KINDS.heart, [x, 1.2, z]);
    },
    bump(x, z) {
      burst(FX_KINDS.bump, [x, 0.6, z]);
      if (!opts.reducedMotion()) {
        sparkTimer = 0.24;
        const sp = node("bump-sparks");
        sp?.setPosition(x, 0.62, z);
        sp?.setVisible(true);
      }
    },
    reset() {
      skid.reset();
      const h = node("skid-marks");
      h?.updateAttribute?.("uv", { array: skid.uvs });
      for (const id of ["drift-smoke-l", "drift-smoke-r", "bump-sparks", "delivery-ripple"]) {
        const n = node(id);
        n?.setPosition(0, -60, 0);
        n?.setVisible(false);
      }
      smokeFlipbookOn = false;
      sparkTimer = 0;
      rippleTimer = 0;
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
