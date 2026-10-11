/**
 * PRD-08 S9 lane adapter runner (three.js r0.185.1 reference side) for the six
 * `prd08-motion-*` scenes.
 *
 * C-30 `admittedAsReference` semantics: these are idiomatic three.js reference
 * cameras driven by the SAME scripted inputs as the Aura adapter
 * (`motion/subject-scripts.ts` via `motion/stage.ts`: subject path, hit time,
 * collider boxes, camera rail, fixed steps, strip schedule). They are a
 * behavioural reference for the motion review — no parity claim: the camera
 * math here is plain halflife damping, not a port of the lane-08 rigs.
 *
 *  - chase / collision: heading-yaw + distance/FOV-per-speed follow; collision
 *    raycasts look→eye against the column `Box3`s (expanded by the probe
 *    radius) and springs the eye in front of the hit;
 *  - impact: static camera + trauma² shake (sum-of-sines, decaying) and a
 *    punch FOV envelope at the scripted hit;
 *  - flight: trailing follow with roll = clamped subject bank × 0.6;
 *  - rail: closed centripetal `CatmullRomCurve3` over the same camera rail;
 *  - pacing: 60 Hz sim presented at 120 Hz with prev/curr lerp at alpha.
 */
import * as THREE from "three";
import type { CapabilityEntry, CapabilityStatus, ReadyPayload, SceneSpec } from "../../../shared/types";
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

declare const __THREE_VERSION__: string;

export interface MotionSpec extends SceneSpec {
  readonly motion: { readonly driver: MotionDriver; readonly notes: string };
}

export interface MotionRunOptions {
  readonly qrFlags?: readonly string[];
}

export function motionSpec(id: string): MotionSpec {
  const entry = motionScenes.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`unknown motion scene ${id}`);
  return entry.spec as MotionSpec;
}

class CapabilityLog {
  readonly entries: CapabilityEntry[] = [];
  add(feature: string, status: CapabilityStatus, detail: string): void {
    this.entries.push({ feature, status, detail });
  }
}

/** Exponential halflife damping (frame-rate independent). */
const damp = (from: number, to: number, halflife: number, dt: number): number =>
  halflife <= 0 ? to : to + (from - to) * Math.pow(2, -dt / halflife);
const dampAngle = (from: number, to: number, halflife: number, dt: number): number => {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + (delta - damp(delta, 0, halflife, dt));
};
const v3 = (v: Vec3) => new THREE.Vector3(v[0], v[1], v[2]);

interface RefPose {
  readonly position: THREE.Vector3;
  readonly target: THREE.Vector3;
  readonly fov: number;
  readonly roll: number;
  readonly energy: number;
}

interface RefRig {
  update(subject: MotionSubject, t: number, dt: number): RefPose;
  hit?(): void;
}

function chaseRig(o: { base: number; perSpeed: number; max: number; fovBase: number; fovPerSpeed: number; fovMax: number; collision?: readonly THREE.Box3[] }): RefRig {
  let yaw = Number.NaN;
  let dist = Number.NaN;
  let fov = Number.NaN;
  let lead = 0;
  let pulled = Number.NaN;
  const look = new THREE.Vector3();
  let first = true;
  const ray = new THREE.Ray();
  const hitPoint = new THREE.Vector3();
  return {
    update(s, _t, dt) {
      const speed = Math.hypot(s.velocity[0], s.velocity[1], s.velocity[2]);
      const heading = Math.atan2(s.forward[0], s.forward[2]);
      yaw = Number.isNaN(yaw) ? heading : dampAngle(yaw, heading, 0.12, dt);
      const fovTarget = Math.min(o.fovMax, o.fovBase + o.fovPerSpeed * speed);
      fov = Number.isNaN(fov) ? fovTarget : damp(fov, fovTarget, 0.15, dt);
      const distTarget = Math.min(o.max, o.base + o.perSpeed * speed);
      dist = Number.isNaN(dist) ? distTarget : damp(dist, distTarget, 0.1, dt);
      lead = damp(lead, Math.min(speed * 0.35, 3), 0.25, dt);
      const leadDir = speed > 1e-3 ? v3(s.velocity).normalize() : new THREE.Vector3();
      const aim = v3(s.position).addScaledVector(leadDir, lead).add(new THREE.Vector3(0, 1.2, 0));
      if (first) look.copy(aim);
      else look.set(damp(look.x, aim.x, 0.025, dt), damp(look.y, aim.y, 0.025, dt), damp(look.z, aim.z, 0.025, dt));
      first = false;
      const eye = v3(s.position).add(new THREE.Vector3(-Math.sin(yaw) * dist, 1.8, -Math.cos(yaw) * dist));
      if (o.collision) {
        // Probe: look→eye ray vs columns expanded by the 0.3 probe radius.
        const toEye = eye.clone().sub(look);
        const full = toEye.length();
        ray.set(look, toEye.normalize());
        let allowed = full;
        for (const box of o.collision) {
          const hit = ray.intersectBox(box.clone().expandByScalar(0.3), hitPoint);
          if (hit) allowed = Math.min(allowed, Math.max(0.2, hitPoint.distanceTo(look)));
        }
        pulled = Number.isNaN(pulled) ? allowed : allowed < pulled ? damp(pulled, allowed, 0.03, dt) : damp(pulled, allowed, 0.3, dt);
        eye.copy(look).addScaledVector(ray.direction, Math.min(pulled, full));
      }
      return { position: eye, target: look.clone(), fov, roll: 0, energy: 0 };
    }
  };
}

function impactRig(): RefRig {
  const pose = STATIC_POSES.impact;
  let trauma = 0;
  let punchAge = Number.POSITIVE_INFINITY;
  return {
    hit() {
      trauma = Math.min(1, trauma + IMPACT.trauma);
      punchAge = 0;
    },
    update(_s, t, dt) {
      trauma = Math.max(0, trauma - dt * 1.0);
      punchAge += dt;
      const shake = trauma * trauma;
      const n = (f: number, p: number) => Math.sin(t * f + p) * 0.6 + Math.sin(t * f * 2.13 + p * 1.7) * 0.4;
      const offset = new THREE.Vector3(n(23, 0.3), n(19, 1.1), n(29, 2.2)).multiplyScalar(0.25 * shake);
      const { attack, hold, release, punchFov } = IMPACT;
      const env = punchAge < attack ? punchAge / attack : punchAge < attack + hold ? 1 : Math.max(0, 1 - (punchAge - attack - hold) / release);
      return {
        position: v3(pose.position).add(offset),
        target: v3(pose.target),
        fov: pose.fov + punchFov * env,
        roll: ((3 * Math.PI) / 180) * shake * n(17, 0.7),
        energy: shake + env
      };
    }
  };
}

function flightRig(): RefRig {
  let eye: THREE.Vector3 | undefined;
  let roll = 0;
  return {
    update(s, _t, dt) {
      const want = v3(s.position).add(new THREE.Vector3(-s.forward[0] * 6, 1.2, -s.forward[2] * 6));
      eye = eye ? new THREE.Vector3(damp(eye.x, want.x, 0.08, dt), damp(eye.y, want.y, 0.08, dt), damp(eye.z, want.z, 0.08, dt)) : want;
      const maxRoll = (25 * Math.PI) / 180;
      roll = damp(roll, Math.max(-maxRoll, Math.min(maxRoll, s.bank * 0.6)), 0.2, dt);
      return { position: eye.clone(), target: v3(s.position), fov: 50, roll, energy: 0 };
    }
  };
}

function railRig(): RefRig {
  const curve = new THREE.CatmullRomCurve3(CAMERA_RAIL_POINTS.map(v3), true, "centripetal");
  return {
    update(s, t) {
      const u = (t % RAIL_LOOP_SECONDS) / RAIL_LOOP_SECONDS;
      return { position: curve.getPoint(u), target: v3(s.position), fov: 50, roll: 0, energy: 0 };
    }
  };
}

function staticRefRig(pose: { readonly position: Vec3; readonly target: Vec3; readonly fov: number }): RefRig {
  return { update: () => ({ position: v3(pose.position), target: v3(pose.target), fov: pose.fov, roll: 0, energy: 0 }) };
}

function refRigFor(driver: MotionDriver, columns: readonly THREE.Box3[], log: CapabilityLog): RefRig {
  switch (driver) {
    case "chase":
      log.add("ref:chase", "supported", "halflife follow, distance 4.5+0.12/u·s (max 7), fov 55+0.9/u·s (max 72)");
      return chaseRig({ base: 4.5, perSpeed: 0.12, max: 7, fovBase: 55, fovPerSpeed: 0.9, fovMax: 72 });
    case "impact":
      log.add("ref:impact", "supported", `static camera + trauma² shake (${IMPACT.trauma}) + punch fov ${IMPACT.punchFov}`);
      return impactRig();
    case "flight":
      log.add("ref:flight", "supported", "trailing follow, roll = bank × 0.6 (max 25°)");
      return flightRig();
    case "collision":
      log.add("ref:collision", "supported", `follow + THREE.Ray.intersectBox probe vs ${columns.length} columns (radius 0.3)`);
      return chaseRig({ base: 4, perSpeed: 0, max: 4, fovBase: 55, fovPerSpeed: 0, fovMax: 55, collision: columns });
    case "rail":
      log.add("ref:rail", "supported", `closed centripetal CatmullRomCurve3 (${CAMERA_RAIL_POINTS.length} knots), ${RAIL_LOOP_SECONDS} s loop`);
      return railRig();
    case "pacing":
      log.add("ref:pacing", "supported", "static wide shot; 60 Hz sim presented at 120 Hz with prev/curr lerp");
      return staticRefRig(STATIC_POSES.pacing);
  }
}

function applyPose(cameraObject: THREE.PerspectiveCamera, pose: RefPose): void {
  cameraObject.position.copy(pose.position);
  cameraObject.up.set(0, 1, 0);
  cameraObject.lookAt(pose.target);
  if (pose.roll !== 0) cameraObject.rotateZ(pose.roll);
  if (cameraObject.fov !== pose.fov) {
    cameraObject.fov = pose.fov;
    cameraObject.updateProjectionMatrix();
  }
  cameraObject.updateMatrixWorld();
}

export async function runMotionThreeScene(spec: MotionSpec, host: HTMLElement, opts: MotionRunOptions = {}): Promise<ReadyPayload> {
  const started = performance.now();
  const log = new CapabilityLog();
  const errors: string[] = [];
  const driver = spec.motion.driver;
  if (THREE.REVISION !== "185") errors.push(`Expected three r185 (0.185.1); loaded r${THREE.REVISION}.`);
  log.add("reference", "not-applicable", "C-30 admittedAsReference: behavioural three.js reference on identical scripted inputs; no parity claim");

  const { width, height } = spec.resolution;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(spec.resolution.devicePixelRatio);
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = spec.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";

  const scene = new THREE.Scene();
  if (spec.background.kind === "color") scene.background = new THREE.Color(spec.background.color);
  const cameraObject = new THREE.PerspectiveCamera(spec.camera.fov, width / height, spec.camera.near, spec.camera.far);
  cameraObject.position.set(...spec.camera.position);
  cameraObject.lookAt(v3(spec.camera.target));

  const sceneLights: THREE.Light[] = [];
  for (const light of spec.lights) {
    if (light.kind !== "directional") continue;
    const directional = new THREE.DirectionalLight(new THREE.Color(light.color), light.intensity);
    directional.position.set(...light.position);
    directional.target.position.set(...light.target);
    directional.castShadow = light.castShadow;
    directional.shadow.mapSize.set(2048, 2048);
    const cam = directional.shadow.camera;
    cam.left = -16;
    cam.right = 16;
    cam.top = 16;
    cam.bottom = -16;
    cam.near = 0.1;
    cam.far = 40;
    scene.add(directional, directional.target);
    sceneLights.push(directional);
  }
  const fill = new THREE.AmbientLight(new THREE.Color("#c8d4e6"), 0.35);
  scene.add(fill);
  sceneLights.push(fill);

  let hero: THREE.Mesh | undefined;
  for (const object of spec.objects) {
    if (object.kind !== "primitive" || object.shape !== "box") continue;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(object.size[0], object.size[1], object.size[2]),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(object.material.color), roughness: object.material.roughness, metalness: object.material.metalness })
    );
    mesh.name = object.name;
    mesh.position.set(...object.position);
    mesh.castShadow = object.castShadow;
    mesh.receiveShadow = object.receiveShadow;
    scene.add(mesh);
    if (object.name === "hero") hero = mesh;
  }
  if (!hero) throw new Error(`${spec.id}: hero object missing from spec`);

  const boxes = driver === "collision" ? colliderBoxes() : [];
  const columns = boxes.map((b) => new THREE.Box3(v3(b.min), v3(b.max)));
  const rig = refRigFor(driver, columns, log);
  const schedule = motionSchedule(driver, spec.time, spec.strip ?? { frames: 12, intervalMs: 66 });
  const strip = new StripRecorder(schedule.stripSteps.length);
  const samples: MotionSample[] = [];
  log.add("subject-script", "supported", `motion/subject-scripts.ts driver "${driver}" @ ${Math.round(1 / schedule.dt)} Hz, ${schedule.steps} steps to t=${spec.time}s`);

  const place = (s: MotionSubject, at: Vec3 = s.position) => {
    hero!.position.set(at[0], at[1], at[2]);
    hero!.rotation.set(0, s.yaw, driver === "flight" ? s.bank : 0, "YXZ");
  };
  let stripCursor = 0;
  const present = (index: number, t: number, s: MotionSubject, shown: Vec3) => {
    place(s, shown);
    const pose = rig.update(s, t, schedule.dt);
    applyPose(cameraObject, pose);
    renderer.render(scene, cameraObject);
    samples.push(sample(t, shown, [pose.position.x, pose.position.y, pose.position.z], [pose.target.x, pose.target.y, pose.target.z], pose.fov, pose.roll, pose.energy));
    while (stripCursor < schedule.stripSteps.length && schedule.stripSteps[stripCursor] === index) {
      strip.grab(renderer.domElement);
      stripCursor += 1;
    }
  };

  let current = motionSubject(driver, 0);
  if (driver === "pacing") {
    // Fixed 60 Hz sim, presented every 1/120 s at alpha = accumulator / fixedDt.
    const fixedDt = 1 / 60;
    let accumulator = 0;
    let simTime = 0;
    let previous = current;
    for (let n = 1; n <= schedule.steps; n += 1) {
      accumulator += schedule.dt;
      while (accumulator >= fixedDt - 1e-9) {
        accumulator -= fixedDt;
        simTime += fixedDt;
        previous = current;
        current = motionSubject(driver, simTime, current.yaw);
      }
      const alpha = Math.max(0, Math.min(1, accumulator / fixedDt));
      const a = previous.position;
      const b = current.position;
      present(n, n * schedule.dt, current, [a[0] + (b[0] - a[0]) * alpha, a[1] + (b[1] - a[1]) * alpha, a[2] + (b[2] - a[2]) * alpha]);
    }
  } else {
    let hitFired = false;
    for (let n = 1; n <= schedule.steps; n += 1) {
      const t = n * schedule.dt;
      current = motionSubject(driver, t, current.yaw);
      if (driver === "impact" && !hitFired && current.frame.extras?.hit === true) {
        hitFired = true;
        rig.hit?.();
        log.add("impact-hit", "supported", `scripted hit at t=${t.toFixed(3)}s`);
      }
      present(n, t, current, current.position);
    }
  }

  // Final READY frame: re-render the last pose (preserveDrawingBuffer keeps it for the screenshot).
  renderer.info.autoReset = true;
  renderer.render(scene, cameraObject);
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  const drawCalls = renderer.info.render.calls;
  window.__QR_THREE_GRAPH__ = { scene, camera: cameraObject, renderer, lights: sceneLights };

  return {
    engine: "three",
    scene: spec.id,
    engineVersion: __THREE_VERSION__,
    capabilityLog: log.entries,
    drawCalls,
    triangles: renderer.info.render.triangles,
    warnings: [],
    errors,
    loadMs: Math.round(performance.now() - started),
    qrFlags: [...(opts.qrFlags ?? [])],
    extra: {
      motion: {
        driver,
        rig: `three-reference:${driver}`,
        dt: schedule.dt,
        stripTimes: schedule.stripTimes,
        metrics: motionMetrics(samples, schedule.dt, boxes),
        samples,
        strip: strip.result()
      }
    }
  };
}
