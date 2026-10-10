// Lane adapter `prd06-character-hero` (PRD-06 T4.4), aura side: the §17.2
// hero bar — lane hero (`auraClashPlayerRig`) on a receive-shadow ground,
// C-10 lighting, a scripted `camera.follow` rig, and the 8 s scripted
// sequence (idle → walk → run → stop → jump → land → idle) driven through
// `bindCharacterHero` (T4.2 characterAnimation binding + T4.3 spec).
//
// Per-PRD wiring:
//  - foot IK on both leg chains against flat analytic ground (spec.footIk)
//  - distributed look-at spine_03/neck_01/Head at a scripted moving target
//    node (spec.lookAt → ik.add)
//  - one spring chain (ball_l → ball_leaf_l toe leaf — the rig ships no
//    accessory bones; toe lag is the measurable settle signal)
//  - morph visemes: N/A — the lane hero has 0 morph targets (§6.9 clause
//    applies only when the hero has them)
//
// Bespoke runner (not runAuraScene): the scene needs a follow camera, a
// live driver advancing the scripted controller + kinematic hero position,
// and a per-frame `motionFrame`/`animationState` sampler published on
// `window.__PRD06_CHARACTER_HERO__` for the §17.2 gate evaluation.

import {
  camera,
  createAuraApp,
  defineAuraAssets,
  environments,
  lights,
  model,
  nodeHandleExtensionFor,
  primitives,
  scene,
  type AuraApp,
  type AuraActorAnimationApi,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";
import { setCharacterAnimationAppTimeScale } from "@aura3d/engine/lanes";
import { createHeightFieldGround } from "@aura3d/animation";
import { motionFrame, type MotionFrame } from "@aura3d/animation/lanes";
import { modelAssets, hdriAssets } from "../../../shared/assets";
import { modelSpaceHeightAt } from "../../../shared/terrain";
import type { CapabilityEntry, ReadyPayload } from "../../../shared/types";
import {
  characterHeroPhaseAt,
  CHARACTER_HERO_DURATION,
  prd06CharacterHero,
  type CharacterHeroSpec
} from "../../../scenes/prd06/character-hero";
import { bindCharacterHero, characterHeroAnimationSpec } from "./characterHero";

declare const __AURA3D_VERSION__: string;

/** Bones sampled per frame for §17.3 metric evaluation (MotionMetrics). */
const HERO_MOTION_BONES = [
  "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head",
  "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
  "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
  "thigh_l", "calf_l", "foot_l", "ball_l", "ball_leaf_l",
  "thigh_r", "calf_r", "foot_r", "ball_r", "ball_leaf_r",
  "root"
] as const;

export interface CharacterHeroFrameSample {
  readonly t: number;
  readonly phase: string;
  readonly controllerSpeed: number;
  readonly grounded: boolean;
  /** animationState() raw — clip names, times, weights, layer. */
  readonly actions: readonly { clip: string; layer: string; time: number; weight: number }[];
  /** MotionMetrics frames: world rotation+position per HERO_MOTION_BONES bone. */
  readonly motion: MotionFrame;
  /** Look-at target world position this frame. */
  readonly lookTarget: readonly [number, number, number];
  /**
   * Hero model-node world transform this frame — bone sockets are sampled in
   * GLB-local space, so gates that need world-frame values compose with this.
   */
  readonly modelPosition: readonly [number, number, number];
  readonly modelYawRad: number;
}

export interface CharacterHeroProbe {
  status: "installing" | "ready" | "running" | "done" | "error";
  error?: string;
  readonly duration: number;
  readonly frames: CharacterHeroFrameSample[];
  /** Pre-binding rest pose (captured before the first `binding.update`). */
  rest?: MotionFrame;
}

declare global {
  interface Window {
    __PRD06_CHARACTER_HERO__?: CharacterHeroProbe;
  }
}

interface ScriptedControllerState {
  [key: string]: unknown;
  speed: number;
  grounded: boolean;
  jumped: boolean;
  turnRate: number;
  state: string;
}

/**
 * Scripted 8 s controller: `speed` follows the phase table, `grounded` drops
 * only inside `air`, `jumped` pulses on the air-phase entry frame. The
 * kinematic root motion (travelAxis) is applied by the driver — the
 * controller itself is a pure state bag, exactly what a real character
 * controller exposes (speed/grounded/jumped/state).
 */
class ScriptedHeroController {
  private t = 0;
  private airborneFrames = 0;
  readonly state: ScriptedControllerState = { speed: 0, grounded: true, jumped: false, turnRate: 0, state: "idle" };

  constructor(private readonly sequence: CharacterHeroSpec["characterHero"]["sequence"]) {}

  /** Advance script time; returns the active phase. */
  advance(dt: number): void {
    this.t += dt;
    const phase = characterHeroPhaseAt(this.t);
    this.state.speed = phase.speed;
    this.state.state = phase.name;
    const airborne = phase.name === "air";
    if (airborne) {
      // `jumped` is the leading-edge pulse the binding keys `jumpStart` on.
      this.state.jumped = this.airborneFrames === 0;
      this.airborneFrames += 1;
    } else {
      this.state.jumped = false;
      this.airborneFrames = 0;
    }
    this.state.grounded = !airborne;
  }

  get time(): number {
    return this.t;
  }
}

/**
 * Jump arc: parabola peaking at `jumpHeight` across the air phase; 0 outside.
 */
function jumpHeightAt(t: number, sequence: CharacterHeroSpec["characterHero"]["sequence"], jumpHeight: number): number {
  const air = sequence.find((phase) => phase.name === "air");
  if (!air || t < air.from || t > air.to) return 0;
  const p = (t - air.from) / Math.max(1e-6, air.to - air.from);
  return 4 * jumpHeight * p * (1 - p);
}

export default async function run(host: HTMLElement, opts?: { variant?: string; dpr?: 1 | 2; qrFlags?: readonly string[] }): Promise<ReadyPayload> {
  const started = performance.now();
  const spec = prd06CharacterHero;
  const hero = spec.characterHero;
  const capabilityLog: CapabilityEntry[] = [];
  const log = (feature: string, status: CapabilityEntry["status"], detail: string) => {
    capabilityLog.push({ feature, status, detail });
  };

  const auraAssets = defineAuraAssets({
    auraClashPlayerRig: {
      type: "model",
      format: "glb",
      url: modelAssets.auraClashPlayerRig.url,
      hash: modelAssets.auraClashPlayerRig.sha256,
      bounds: modelAssets.auraClashPlayerRig.worldSize,
      metadata: { animations: modelAssets.auraClashPlayerRig.animations, license: modelAssets.auraClashPlayerRig.provenance, sourcePath: modelAssets.auraClashPlayerRig.repoPath }
    },
    studioSmall08: {
      type: "texture",
      format: "hdr",
      url: hdriAssets.studioSmall08.url,
      hash: hdriAssets.studioSmall08.sha256,
      metadata: { license: hdriAssets.studioSmall08.provenance, sourcePath: hdriAssets.studioSmall08.repoPath }
    }
  } as const);

  const built = scene();
  if (spec.background.kind === "color") built.background(spec.background.color);

  // C-22 scripted follow camera: trails the hero runtime node.
  built.camera(camera.follow({
    targetNode: hero.runtimeId,
    distance: hero.followCamera.distance,
    // `position` would pin the eye statically — `offset` keeps it trailing
    // the node each frame (follow mode), aimed at mid-body via targetOffset.
    offset: [2.4, hero.followCamera.height, 2.6],
    targetOffset: [0, 1.0, 0],
    fov: spec.camera.fov,
    near: spec.camera.near,
    far: spec.camera.far
  }));
  log("camera:follow", "supported", `camera.follow(targetNode=${hero.runtimeId}, distance=${hero.followCamera.distance})`);

  built.add(environments.hdri({ texture: auraAssets.studioSmall08, intensity: spec.environment!.intensity, rotation: spec.environment!.rotation }));
  for (const light of spec.lights) {
    if (light.kind !== "directional") continue;
    built.add(lights.directional({ name: light.name, position: light.position, intensity: light.intensity, color: light.color, shadow: light.castShadow })
      .lookAt(light.target[0], light.target[1], light.target[2]));
  }

  const ground = spec.objects[0] as Extract<typeof spec.objects[number], { kind: "primitive" }>;
  built.add(primitives.box({
    name: ground.name,
    material: { color: ground.material.color, roughness: ground.material.roughness, metalness: ground.material.metalness },
    size: ground.size,
    castShadow: false,
    receiveShadow: true
  }).position(...ground.position));

  const targetObject = spec.objects[1] as Extract<typeof spec.objects[number], { kind: "primitive" }>;
  const lookTargetRuntimeId = `${spec.id}-look-target`;
  built.add(primitives.sphere({
    name: hero.lookAt.targetNodeName,
    material: {
      color: targetObject.material.color,
      roughness: targetObject.material.roughness,
      metalness: targetObject.material.metalness,
      emissive: targetObject.material.emissive,
      emissiveIntensity: targetObject.material.emissiveIntensity
    },
    size: targetObject.size,
    castShadow: false,
    receiveShadow: false
  }).position(...targetObject.position).runtime({ id: lookTargetRuntimeId }));

  built.add(model(auraAssets.auraClashPlayerRig, {
    name: hero.modelName,
    scaleMode: "world",
    castShadow: true,
    receiveShadow: true
  }).position(...hero.startPosition).rotate(0, Math.PI / 2, 0).runtime({ id: hero.runtimeId }));

  const app = createAuraApp(host, {
    scene: built,
    renderer: { qualityProfile: "production" },
    pixelRatio: opts?.dpr ?? spec.resolution.devicePixelRatio,
    resize: false,
    // Live rAF loop — the §17.2 sequence runs in real time so the T4.8 burst
    // capture sees genuinely moving frames.
    autoStart: true,
    qualityRebuild: { flags: opts?.qrFlags && opts.qrFlags.length > 0 ? [...opts.qrFlags] : [...(spec.qrFlags ?? ["animation"])] },
    animation: { mixer: "pose", defaults: "3.1" }
  });
  await app.ready();

  const probe: CharacterHeroProbe = { status: "installing", duration: CHARACTER_HERO_DURATION, frames: [] };
  window.__PRD06_CHARACTER_HERO__ = probe;

  const captureRest = (api: AuraActorAnimationApi): void => {
    probe.rest = motionFrame(0, HERO_MOTION_BONES, (bone) => {
      const socket = api.socket(bone);
      return socket.valid ? socket.worldMatrix() : undefined;
    });
  };

  // C-23: per-actor dt composition reads app.time.scale (stub 1 today).
  setCharacterAnimationAppTimeScale(() => {
    const timeExt = (app as unknown as { time?: { readonly scale?: number } }).time;
    return typeof timeExt?.scale === "number" ? timeExt.scale : 1;
  });

  // Wait for the actor's first draw so the runtime node + animation api exist.
  const drawDeadline = performance.now() + 90_000;
  while (performance.now() < drawDeadline) {
    const diagnostics = app.diagnostics();
    if (diagnostics.drawCalls > 0 || diagnostics.errors.length > 0) break;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  const handle = app.nodes.get(hero.runtimeId) as AuraRuntimeNodeHandle | undefined;
  if (!handle) {
    probe.status = "error";
    probe.error = `runtime node ${hero.runtimeId} missing`;
    log("character-hero:binding", "missing", probe.error);
    return payload(app, spec, started, capabilityLog, opts, { frames: 0 });
  }

  const animationApi = nodeHandleExtensionFor("animation")?.create(handle, app) as AuraActorAnimationApi | undefined;
  if (!animationApi?.ik || !animationApi.springBones || !animationApi.animationState || !animationApi.socket) {
    probe.status = "error";
    probe.error = "node.animation api unavailable (flag off or actor not loaded)";
    log("character-hero:api", "missing", probe.error);
    return payload(app, spec, started, capabilityLog, opts, { frames: 0 });
  }
  log("character-hero:api", "supported", "ik/springBones/animationState/socket resolved");
  captureRest(animationApi);

  const controller = new ScriptedHeroController(hero.sequence);
  const heroSpec = {
    ...characterHeroAnimationSpec(hero.clipMap),
    footIk: {
      legs: hero.footIk.legs.map((leg) => ({
        root: leg.hip,
        mid: leg.knee,
        tip: leg.ankle,
        ankleHeight: leg.ankleHeight
      })),
      ground: createHeightFieldGround(
        modelSpaceHeightAt(
          () => ({ height: 0, normal: [0, 1, 0] as const }),
          { position: hero.startPosition, rotation: [0, Math.PI / 2, 0] as const }
        )
      ),
      pelvis: hero.footIk.pelvis,
      lockOnContact: true
    },
    lookAt: {
      bones: hero.lookAt.bones,
      yawLimitDeg: hero.lookAt.yawLimitDeg,
      pitchLimitDeg: hero.lookAt.pitchLimitDeg,
      halfLife: hero.lookAt.halfLife,
      // Resolved per frame by prd06ConstraintTargetPosition via node name.
      target: hero.lookAt.targetNodeName
    }
  };

  let binding: ReturnType<typeof bindCharacterHero>;
  try {
    // The controller IS its own state bag — the character-controller
    // template's `{ speed }` path (Q-13-3) reads fields straight off it.
    binding = bindCharacterHero(controller.state, handle, heroSpec, { app });
    log("character-hero:binding", "supported", `characterAnimation bound (locomotion ${heroSpec.locomotion.clips.length} clips, footIk + lookAt)`);
  } catch (error) {
    probe.status = "error";
    probe.error = `bindCharacterHero threw: ${error instanceof Error ? error.message : String(error)}`;
    log("character-hero:binding", "missing", probe.error);
    return payload(app, spec, started, capabilityLog, opts, { frames: 0 });
  }

  try {
    animationApi.springBones.add({
      chains: [{
        name: "toe-leaf-l",
        bones: hero.springChain.bones,
        stiffness: hero.springChain.stiffness,
        damping: hero.springChain.damping,
        relativeDamping: hero.springChain.relativeDamping,
        gravityScale: hero.springChain.gravityScale,
        substepHz: hero.springChain.substepHz
      }]
    });
    log("character-hero:spring", "supported", `springBones chain [${hero.springChain.bones.join(" → ")}]`);
  } catch (error) {
    log("character-hero:spring", "missing", `springBones.add threw: ${error instanceof Error ? error.message : String(error)}`);
  }

  const lookTargetHandle = app.nodes.get(lookTargetRuntimeId) as { setPosition?: (x: number, y: number, z: number) => unknown } | undefined;
  const heroState = { x: hero.startPosition[0], y: hero.startPosition[1], z: hero.startPosition[2] };
  let lookTarget: readonly [number, number, number] = [heroState.x + 1.2, 1.5, heroState.z + 1.4];

  probe.status = "running";
  const sampleEvery = 1 / 60;
  let lastSampleTime = -1;

  const unsubscribe = app.onFrame(({ dt }) => {
    if (controller.time >= CHARACTER_HERO_DURATION) return;
    // `onFrame` dt is wall time since the previous frame — the first callback
    // after actor load spans the whole load (30 s+ measured here), which would
    // jump the script past its duration. Clamp to 100 ms so controller time
    // still tracks real pacing while skips stay bounded.
    const step = Math.min(dt, 0.1);
    controller.advance(step);

    // The pose this callback samples was rendered last frame — pair it with
    // the model position/target that produced it, not the values written now.
    const renderedModelPosition: readonly [number, number, number] = [heroState.x, heroState.y, heroState.z];

    // Kinematic root motion along travelAxis; vertical from the jump arc.
    const [ax, az] = hero.travelAxis;
    heroState.x += ax * controller.state.speed * step;
    heroState.z += az * controller.state.speed * step;
    heroState.y = hero.startPosition[1] + jumpHeightAt(controller.time, hero.sequence, 0.55);
    handle.setPosition(heroState.x, heroState.y, heroState.z);

    // Scripted look target: a slow figure-eight ahead of the hero so the
    // look-at has something worth tracking. Kept ≥1.4 m ahead with gentle
    // sweeps so its azimuth/pitch demands stay inside the ±75°/±60° cones —
    // a target that whips past the head or overhead is untrackable by
    // design, not by constraint quality, and breaks the ≤5° §17.2 gate.
    // The pose sampled below was rendered against the PREVIOUS frame's
    // target, so `renderedLookTarget` — not the fresh value — pairs with it.
    const renderedLookTarget = lookTarget;
    const tt = controller.time;
    lookTarget = [
      heroState.x + 2.2 + 0.8 * Math.sin(tt),
      1.45 + 0.25 * Math.sin(tt * 1.3),
      heroState.z + 1.1 * Math.cos(tt)
    ];
    lookTargetHandle?.setPosition?.(lookTarget[0], lookTarget[1], lookTarget[2]);

    binding.update(step);

    if (controller.time - lastSampleTime >= sampleEvery - 1e-6) {
      lastSampleTime = controller.time;
      const motion = motionFrame(controller.time, HERO_MOTION_BONES, (bone) => {
        const socket = animationApi.socket(bone);
        return socket.valid ? socket.worldMatrix() : undefined;
      });
      const state = animationApi.animationState();
      probe.frames.push({
        t: controller.time,
        phase: controller.state.state,
        controllerSpeed: controller.state.speed,
        grounded: controller.state.grounded,
        modelPosition: renderedModelPosition,
        modelYawRad: Math.PI / 2,
        actions: (state?.activeActions ?? []).map((action) => ({
          clip: action.clip,
          layer: action.layer,
          time: action.time,
          weight: action.weight
        })),
        motion,
        lookTarget: renderedLookTarget
      });
    }
    if (controller.time >= CHARACTER_HERO_DURATION) {
      probe.status = "done";
    }
  });

  // The runner resolves once the rig is bound + the probe is live; the spec
  // polls probe.status==="done" (≈8 s of real frames) then reads the samples.
  log("character-hero:sequence", "supported", `${CHARACTER_HERO_DURATION}s scripted sequence running (probe __PRD06_CHARACTER_HERO__)`);
  void unsubscribe;
  return payload(app, spec, started, capabilityLog, opts, { frames: 0 });
}

function payload(
  app: AuraApp,
  spec: CharacterHeroSpec,
  started: number,
  capabilityLog: CapabilityEntry[],
  opts: { dpr?: 1 | 2; qrFlags?: readonly string[] } | undefined,
  extra: { readonly frames: number }
): ReadyPayload {
  const diagnostics = app.diagnostics();
  return {
    engine: "aura3d",
    scene: spec.id,
    engineVersion: typeof __AURA3D_VERSION__ === "string" ? __AURA3D_VERSION__ : "dev",
    capabilityLog,
    drawCalls: diagnostics.drawCalls,
    warnings: diagnostics.warnings.map((warning) => String(warning)),
    errors: diagnostics.errors.map((error) => String(error)),
    loadMs: Math.round(performance.now() - started),
    variant: "default",
    dpr: opts?.dpr ?? 1,
    appliedToneMapping: "aces-filmic",
    appliedExposure: 1,
    lightUnits: "aura-internal",
    shadows: null,
    fallbackLightsActive: null,
    assetHashes: { auraClashPlayerRig: modelAssets.auraClashPlayerRig.sha256 },
    qrFlags: opts?.qrFlags ?? spec.qrFlags ?? [],
    extra: { characterHero: { duration: CHARACTER_HERO_DURATION, sampledFrames: extra.frames } }
  } as ReadyPayload;
}
