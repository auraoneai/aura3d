/**
 * PRD-08 S9 lane adapter runner (Aura side) for the six `prd08-motion-*`
 * scenes. Same capture contract as `aura3d/scenes/prd07/common.ts`
 * (createAuraApp on the production profile, autoStart off, deterministic
 * `app.step`, ReadyPayload) plus the motion evidence:
 *
 * - the hero is a runtime node moved every sim step from
 *   `motion/subject-scripts.ts` (via `motion/stage.ts`) — the same inputs the
 *   three.js reference adapter reads (C-30);
 * - the camera is the real lane-08 `app.camera` controller (A3D_QR_CAMERA)
 *   running a real rig from `@aura3d/engine/lanes` — chase (speed FOV),
 *   static + `camera.shake`/`camera.punch` (impact), flight (bank/horizon
 *   lock), chase with C-10 collision against a `createCameraProbe` AABB list
 *   (collision), closed `createRailRig` (rail), and `createFixedStepDriver` +
 *   `createInterpolationStore` presenting a 60 Hz sim at 120 Hz (pacing);
 * - a 12-tile strip is grabbed off the canvas on the strip schedule and the
 *   per-step presented pose trajectory + metrics ride `extra.motion` for
 *   `aura3d prd08 motion-report`.
 *
 * Flags: main.ts forwards the capture's `--flags` list (`?a3d-qr=camera`) as
 * `qrFlags`; it is passed to `createAuraApp({ qualityRebuild: { flags } })`.
 * With the flag off `app.camera` is the C-38 stub: the scene still renders
 * (static spec camera) and the capability log records the rig as missing.
 */
import {
  camera,
  createAuraApp,
  lights,
  primitives,
  scene,
  type AuraApp,
  type AuraMaterialSpec,
  type AuraRuntimeNodeHandle,
  type AuraSceneBuilder
} from "@aura3d/engine";
import {
  cameraQuatFromAxisAngle,
  cameraQuatMultiply,
  createCameraProbe,
  createChaseRig,
  createFixedStepDriver,
  createFlightRig,
  createInterpolationStore,
  createRailRig,
  staticRig
} from "@aura3d/engine/lanes";
import {
  resolveQrFlags,
  type AuraCameraProbe,
  type AuraCameraRig,
  type AuraCameraSubject
} from "@aura3d/engine/contracts";
import type { CapabilityEntry, CapabilityStatus, MaterialSpec, ReadyPayload, SceneSpec } from "../../../shared/types";
import type { MotionDriver } from "../../../motion/subject-scripts";
import { scenes as motionScenes } from "../../../motion/scenes";
import {
  CAMERA_RAIL_POINTS,
  IMPACT,
  RAIL_LOOP_SECONDS,
  STATIC_POSES,
  StripRecorder,
  colliderBoxes,
  motionMetrics,
  motionSchedule,
  motionSubject,
  sample,
  type MotionSample,
  type MotionSubject,
  type Vec3
} from "../../../motion/stage";

declare const __AURA3D_VERSION__: string;

/** Lane carrier (motion/scenes.ts MotionSceneSpec) — the fields this runner reads. */
export interface MotionSpec extends SceneSpec {
  readonly motion: { readonly driver: MotionDriver; readonly notes: string };
}

export interface MotionRunOptions {
  readonly qrFlags?: readonly string[];
}

class CapabilityLog {
  readonly entries: CapabilityEntry[] = [];
  add(feature: string, status: CapabilityStatus, detail: string): void {
    this.entries.push({ feature, status, detail });
  }
}

function toAuraMaterial(spec: MaterialSpec): AuraMaterialSpec {
  return { color: spec.color, roughness: spec.roughness, metallic: spec.metalness, metalness: spec.metalness };
}

function buildScene(spec: MotionSpec): AuraSceneBuilder {
  const built = scene();
  if (spec.background.kind === "color") built.background(spec.background.color);
  built.camera(camera.perspective({ position: spec.camera.position, target: spec.camera.target, fov: spec.camera.fov, near: spec.camera.near, far: spec.camera.far }));
  for (const light of spec.lights) {
    if (light.kind === "ambient") built.add(lights.ambient({ name: light.name, intensity: light.intensity, color: light.color }));
    else if (light.kind === "directional") {
      built.add(lights.directional({ name: light.name, position: light.position, intensity: light.intensity, color: light.color, shadow: light.castShadow }).lookAt(light.target[0], light.target[1], light.target[2]));
    }
  }
  built.add(lights.ambient({ name: "fill", intensity: 0.35, color: "#c8d4e6" }));
  for (const object of spec.objects) {
    if (object.kind !== "primitive") continue;
    let node = primitives[object.shape]({
      name: object.name,
      material: toAuraMaterial(object.material),
      size: object.size,
      castShadow: object.castShadow,
      receiveShadow: object.receiveShadow
    }).position(...object.position);
    // The hero is the scripted runtime subject every rig follows.
    if (object.name === "hero") node = node.runtime({ id: "hero" });
    built.add(node);
  }
  return built;
}

async function nextFrame(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Camera subject from the scripted frame (real velocity/forward/bank). */
function toSubject(s: MotionSubject): AuraCameraSubject & { readonly rotation: readonly [number, number, number, number] } {
  const [x, y, z] = s.position;
  const yawQ = cameraQuatFromAxisAngle([0, 1, 0], Math.atan2(s.forward[0], s.forward[2]));
  const rollQ = cameraQuatFromAxisAngle([0, 0, 1], s.bank);
  return {
    position: [x, y, z],
    velocity: [s.velocity[0], s.velocity[1], s.velocity[2]],
    forward: [s.forward[0], s.forward[1], s.forward[2]],
    bounds: { min: [x - 0.5, y - 0.5, z - 0.5], max: [x + 0.5, y + 0.5, z + 0.5] },
    rotation: cameraQuatMultiply(yawQ, rollQ) as unknown as readonly [number, number, number, number]
  };
}

/**
 * Wraps a lane rig so its context subject is the scripted subject (identical
 * input to the three reference) and, for collision, its probe is the AABB
 * list of the scene's columns. Pure C-22 `AuraCameraRig` composition.
 */
function scriptedRig(inner: AuraCameraRig, current: () => MotionSubject, probe?: AuraCameraProbe): AuraCameraRig {
  return {
    id: `motion:${inner.id}`,
    continuous: true,
    reset: (pose) => inner.reset?.(pose),
    update: (ctx) =>
      inner.update({
        dt: ctx.dt,
        time: ctx.time,
        aspect: ctx.aspect,
        previous: ctx.previous,
        probe: probe ?? ctx.probe,
        subject: () => toSubject(current())
      })
  };
}

function rigFor(driver: MotionDriver, current: () => MotionSubject, log: CapabilityLog): AuraCameraRig {
  switch (driver) {
    case "chase":
      log.add("rig:chase", "supported", "createChaseRig distance 4.5+0.12/u·s (max 7), fov 55+0.9/u·s (max 72), look-ahead 0.35 s");
      return scriptedRig(createChaseRig({ target: "hero", distance: { base: 4.5, perSpeed: 0.12, max: 7 }, height: 1.8, fov: { base: 55, perSpeed: 0.9, max: 72 } }), current);
    case "impact": {
      const pose = STATIC_POSES.impact;
      log.add("rig:static+feel", "supported", `staticRig + camera.shake.add(${IMPACT.trauma}) + camera.punch.trigger(fov ${IMPACT.punchFov}) at the scripted hit`);
      return staticRig({ position: pose.position, target: pose.target, fov: pose.fov }, "impact-static");
    }
    case "flight":
      log.add("rig:flight", "supported", "createFlightRig horizonLock 0.6, bank gain 0.6 max 25°, distance 6 height 1.2");
      return scriptedRig(createFlightRig({ target: "hero", distance: 6, height: 1.2, horizonLock: 0.6, bank: { gain: 0.6, maxDeg: 25 } }), current);
    case "collision": {
      const boxes = colliderBoxes();
      const probe = createCameraProbe({ bounds: () => boxes.map((b) => ({ id: b.id, min: [...b.min] as [number, number, number], max: [...b.max] as [number, number, number] })) });
      log.add("rig:chase+collision", "supported", `createChaseRig collision radius 0.3 against createCameraProbe AABB list (${boxes.length} columns)`);
      log.add("occluder-fade", "partial", "createOccluderFade contributor not wired in the bench page (probe pull-in only)");
      return scriptedRig(createChaseRig({ target: "hero", distance: 4, height: 1.8, fov: 55, collision: { radius: 0.3 } }), current, probe);
    }
    case "rail":
      log.add("rig:rail", "supported", `createRailRig closed loop (${CAMERA_RAIL_POINTS.length} knots, catmull-rom α 0.5), ${RAIL_LOOP_SECONDS} s, linear ease, lookAt hero`);
      return scriptedRig(createRailRig({ points: CAMERA_RAIL_POINTS.map((p) => [p[0], p[1], p[2]] as [number, number, number]), lookAt: "hero", duration: RAIL_LOOP_SECONDS, loop: "loop", ease: "linear", fov: 50 }), current);
    case "pacing": {
      const pose = STATIC_POSES.pacing;
      log.add("rig:static", "supported", "staticRig wide shot; motion comes from the 120 Hz interpolated presenter");
      return staticRig({ position: pose.position, target: pose.target, fov: pose.fov }, "pacing-static");
    }
  }
}

type MotionCamera = NonNullable<AuraApp["camera"]>;

function layerEnergy(cam: MotionCamera): number {
  return cam.evidence().layers.reduce((sum, layer) => sum + layer.energy, 0);
}

export async function runMotionAuraScene(spec: MotionSpec, host: HTMLElement, opts: MotionRunOptions = {}): Promise<ReadyPayload> {
  const started = performance.now();
  const log = new CapabilityLog();
  const driver = spec.motion.driver;
  const urlFlags = [...(opts.qrFlags ?? [])];
  const cameraFlag = resolveQrFlags({ options: urlFlags }).on("A3D_QR_CAMERA");
  // Pacing presents through the L-4/L-7 loop seam: its sub-flags ride on the
  // camera flag (same set the lane-08 frame-pacing harness mounts with).
  const appFlags = cameraFlag && driver === "pacing" ? [...urlFlags, "camera.loop", "camera.interpolation"] : urlFlags;
  const app = createAuraApp(host, {
    scene: buildScene(spec),
    renderer: { qualityProfile: "production" },
    pixelRatio: spec.resolution.devicePixelRatio,
    resize: false,
    autoStart: false,
    ...(appFlags.length > 0 ? { qualityRebuild: { flags: appFlags } } : {})
  });
  await app.ready();

  const drawDeadline = performance.now() + 90_000;
  while (performance.now() < drawDeadline) {
    app.step(0);
    const diagnostics = app.diagnostics();
    if (diagnostics.drawCalls > 0 || diagnostics.errors.length > 0) break;
    await sleep(50);
  }

  const hero = app.nodes.get("hero") as AuraRuntimeNodeHandle | undefined;
  if (!hero) throw new Error(`${spec.id}: runtime node "hero" missing`);
  const canvas = host.querySelector("canvas");
  if (!canvas) throw new Error(`${spec.id}: no canvas mounted in the stage host`);

  const schedule = motionSchedule(driver, spec.time, spec.strip ?? { frames: 12, intervalMs: 66 });
  const strip = new StripRecorder(schedule.stripSteps.length);
  const samples: MotionSample[] = [];
  let current = motionSubject(driver, 0);
  const placeHero = (s: MotionSubject, at: Vec3 = s.position) => {
    hero.setPosition(at[0], at[1], at[2]);
    hero.setRotation(0, s.yaw, driver === "flight" ? s.bank : 0);
  };
  placeHero(current);

  const cam = app.camera;
  if (!cam) throw new Error(`${spec.id}: app.camera is undefined (C-38 extension not installed)`);
  const cameraLive = cam.evidence().rig !== "stub";
  if (cameraLive) {
    cam.use(rigFor(driver, () => current, log), { blend: 0 });
  } else {
    log.add(`rig:${driver}`, "missing", "app.camera is the C-38 stub (A3D_QR_CAMERA off) — static spec camera");
  }
  log.add("subject-script", "supported", `motion/subject-scripts.ts driver "${driver}" @ ${Math.round(1 / schedule.dt)} Hz, ${schedule.steps} steps to t=${spec.time}s`);

  let stripCursor = 0;
  const afterPresent = (stepIndex: number, t: number, presentedSubject: Vec3) => {
    const pose = cam.presented();
    samples.push(sample(t, presentedSubject, pose.position, pose.target, pose.fov, pose.roll, cameraLive ? layerEnergy(cam) : 0));
    while (stripCursor < schedule.stripSteps.length && schedule.stripSteps[stripCursor] === stepIndex) {
      strip.grab(canvas);
      stripCursor += 1;
    }
  };

  if (driver === "pacing" && cameraFlag) {
    // 60 Hz fixed sim presented at 120 Hz: the FixedStepDriver substeps the
    // sim, the InterpolationStore resolves the hero at the loop alpha and the
    // resolved transform is what each presented frame draws.
    const store = createInterpolationStore();
    store.attachTimeExtension(hero);
    (hero as { interpolate?: boolean }).interpolate = true;
    let simTime = 0;
    let presentIndex = 0;
    const fsd = createFixedStepDriver(
      {
        advance: (dt: number) => {
          simTime += dt;
          current = motionSubject(driver, simTime, current.yaw);
          placeHero(current);
          app.advance(dt);
        },
        step: (dt: number) => {
          const resolved = store.resolveHandle(hero.id, fsd.snapshot().alpha);
          const shown: Vec3 = resolved ? [resolved.position[0], resolved.position[1], resolved.position[2]] : current.position;
          placeHero(current, shown);
          app.step(dt);
          presentIndex += 1;
          afterPresent(presentIndex, presentIndex * schedule.dt, shown);
          placeHero(current);
        }
      },
      { useRaf: false, autoStart: false, fixedDt: 1 / 60, interpolation: true, interpolationStore: store, flags: resolveQrFlags({ options: appFlags }) }
    );
    for (let i = 0; i < schedule.steps; i += 1) fsd.step(schedule.dt);
    log.add("pacing-interpolation", "supported", "createFixedStepDriver fixedDt 1/60 + createInterpolationStore, presented at 1/120 s");
  } else {
    let hitFired = false;
    for (let n = 1; n <= schedule.steps; n += 1) {
      const t = n * schedule.dt;
      current = motionSubject(driver, t, current.yaw);
      placeHero(current);
      if (driver === "impact" && !hitFired && current.frame.extras?.hit === true) {
        hitFired = true;
        if (cameraLive) {
          cam.shake.add(IMPACT.trauma);
          cam.punch.trigger({ fov: IMPACT.punchFov, attack: IMPACT.attack, hold: IMPACT.hold, release: IMPACT.release });
        }
        log.add("impact-hit", cameraLive ? "supported" : "missing", `scripted hit at t=${t.toFixed(3)}s`);
      }
      app.step(schedule.dt);
      afterPresent(n, t, current.position);
    }
    if (driver === "pacing") log.add("pacing-interpolation", "missing", "A3D_QR_CAMERA off — 120 Hz sim without the loop seam");
  }

  for (let frame = 0; frame < spec.settleFrames; frame += 1) {
    await nextFrame();
    app.step(0);
  }
  await nextFrame();

  const diagnostics = app.diagnostics();
  const boxes = driver === "collision" ? colliderBoxes() : [];
  const metrics = motionMetrics(samples, schedule.dt, boxes);
  if (driver === "flight") log.add("bank-roll-pixels", "partial", "presented roll is in camera.evidence().viewProjection; the scene camera spec written by prd08.camera carries no up/roll, so bank is not yet visible in Aura pixels");
  return {
    engine: "aura3d",
    scene: spec.id,
    engineVersion: __AURA3D_VERSION__,
    capabilityLog: log.entries,
    drawCalls: diagnostics.drawCalls,
    warnings: [...diagnostics.warnings],
    errors: [...diagnostics.errors],
    loadMs: Math.round(performance.now() - started),
    qrFlags: appFlags,
    extra: {
      backend: diagnostics.backend,
      renderSize: diagnostics.renderSize,
      qrFlags: appFlags,
      motion: {
        driver,
        cameraLive,
        rig: cam.evidence().rig,
        dt: schedule.dt,
        stripTimes: schedule.stripTimes,
        metrics,
        samples,
        strip: strip.result()
      }
    }
  };
}

/** Spec lookup from the lane index (motion/scenes.ts) — throws on an unknown id. */
export function motionSpec(id: string): MotionSpec {
  const entry = motionScenes.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`unknown motion scene ${id}`);
  return entry.spec as MotionSpec;
}
