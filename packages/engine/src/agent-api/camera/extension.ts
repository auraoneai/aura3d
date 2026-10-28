/**
 * `prd08.camera` — the C-38 app extension behind `A3D_QR_CAMERA`.
 *
 * Flag on: real CameraController (C-22) driven once per frame from `app.onFrame`
 * (the `runRuntimeFrame` tick — real dt), subjects resolved through `app.nodes`
 * (runtime) then the flattened scene snapshot (legacy fallback order),
 * `presented()` written back through `app.scene.camera` as a plain
 * `perspective`/`orthographic` spec so the existing resolution path renders
 * exactly the presented pose, and `cut()` → `app.cutCamera()` (C-14).
 *
 * Flag off: a stub controller — same surface, legacy resolution, inert layers —
 * so `app.camera` is defined (C-38) but nothing changes behaviour.
 *
 * Driving note: `app.onRender` (C-23) is the once-per-tick real-dt hook; until
 * the loop option reaches createAuraApp (Q-09-5, PR 0b-1), the extension also
 * accepts `app.onFrame`, which fires per substep under FixedStepDriver — the
 * controller still presents every call, and ramp/layer dt is per call.
 */
import type {
  AuraCameraController,
  AuraCameraEvidence,
  AuraCameraLayer,
  AuraCameraPose,
  AuraCameraRig,
  AuraCameraSequence,
  AuraCameraSequencePlayback,
  AuraCameraSubject,
  AuraCameraRigFactories,
  AuraEaseName,
  AuraFovKickLayer,
  AuraPunchLayer,
  AuraTraumaLayer
} from "../../contracts/camera.js";
import { stubCameraRigFactories } from "../../contracts/camera.js";
import { mediaMatches } from "../platform.js";
import type { AuraApp, AuraVec3 } from "../index.js";
import { createCameraController, type AuraCameraControllerImpl } from "./CameraController.js";
import { cameraProbeBudgetForTier, createCameraProbe, type AuraBudgetedCameraProbe } from "./Probe.js";
import { createCinematicBarsLayer } from "./layers/cinematicBars.js";
import { DEFAULT_POSE, createFromSpecRig, type LegacyCameraSpec } from "./rigs/fromSpec.js";
import {
  findRuntimeTarget,
  findSceneNodeTarget,
  subjectFromHandle,
  subjectRotationY,
  type RuntimeHandleLike,
  type RuntimeRegistryLike,
  type SceneCameraNodeLike
} from "./subject.js";
import { flattenSceneNodes } from "./sceneNodes.js";
import { createStaticProbeBoxSource } from "./staticBounds.js";

interface FrameInfo {
  readonly dt: number;
  readonly time: number;
}
type OnFrameApp = { onFrame?(cb: (f: FrameInfo) => void): () => void };

interface CameraSpecMutable {
  mode?: string;
  position?: readonly number[];
  target?: readonly number[];
  fov?: number;
  near?: number;
  far?: number;
  orthographicSize?: number;
  [key: string]: unknown;
}

function isHandleLike(ref: string | object): ref is RuntimeHandleLike {
  return (
    typeof ref === "object" &&
    ref !== null &&
    "position" in ref &&
    "rotation" in ref &&
    typeof (ref as RuntimeHandleLike).bounds === "function"
  );
}

/** Stub `app.camera` for flag-off — same C-22 surface, no behaviour change. */
export function createStubCameraController(
  specOf: () => CameraSpecMutable | undefined
): AuraCameraController & { readonly rigs: AuraCameraRigFactories } {
  const rig = () => stubCameraRigFactories.static({});
  const noopLayer = (id: string): AuraCameraLayer => ({
    id,
    apply: (p) => p,
    energy: () => 0
  });
  const traumaStub: AuraTraumaLayer = {
    ...noopLayer("trauma"),
    add: () => {},
    configure: () => {}
  };
  const punchStub: AuraPunchLayer = { ...noopLayer("punch"), trigger: () => {} };
  const kickStub: AuraFovKickLayer = { ...noopLayer("fovKick"), set: () => {} };
  return {
    presented() {
      const spec = specOf();
      return {
        position: (spec?.position as AuraCameraPose["position"]) ?? DEFAULT_POSE.position,
        target: (spec?.target as AuraCameraPose["target"]) ?? DEFAULT_POSE.target,
        up: DEFAULT_POSE.up,
        roll: 0,
        fov: spec?.fov ?? DEFAULT_POSE.fov,
        near: spec?.near ?? DEFAULT_POSE.near,
        far: spec?.far ?? DEFAULT_POSE.far,
        orthographicSize: spec?.orthographicSize
      };
    },
    setPose: () => {},
    setFov: () => {},
    setRoll: () => {},
    use: () => {},
    rig: rig(),
    rigs: stubCameraRigFactories,
    addLayer: () => () => {},
    shake: traumaStub,
    punch: punchStub,
    fovKick: kickStub,
    play(seq: AuraCameraSequence): AuraCameraSequencePlayback {
      return {
        done: Promise.resolve(),
        skip: () => {},
        get progress() {
          return 1;
        }
      };
    },
    cut: () => {},
    evidence(): AuraCameraEvidence {
      return {
        kind: "aura-camera-presented",
        rig: "stub",
        pose: this.presented(),
        viewProjection: [],
        layers: [],
        cutThisFrame: false
      };
    }
  };
}

export interface AuraCameraExtensionOptions {
  readonly freezeSpecs?: boolean;
}

/** The present-driver seam a fixed-step loop calls once per presented tick. */
export interface AuraCameraPresentDriverTarget {
  present(
    realDt: number,
    timeMs: number,
    subjectPosition?: (id: string) => readonly number[] | undefined
  ): AuraCameraPose;
}

/** The tier-budgeted collision probe the controller casts through (§17). */
export interface AuraCameraProbeTarget {
  readonly probe: AuraBudgetedCameraProbe;
}

/**
 * Build the real controller against an app — exported for tests/harnesses that
 * want the controller without the full createAuraApp mount.
 */
export function createAuraCameraController(
  app: AuraApp,
  options: AuraCameraExtensionOptions = {}
): AuraCameraControllerImpl & AuraCameraPresentDriverTarget & AuraCameraProbeTarget {
  const registry = app.nodes as RuntimeRegistryLike | undefined;

  /*
   * S6: runtime handles carry no velocity, so a speed-aware rig (chase
   * `distance.perSpeed`, `fov.perSpeed`, look-ahead) saw speed 0 for every
   * game subject and never left its base distance. Estimate it from the
   * handle's sim-time position delta between controller updates. Presented
   * frames (`step(0)` → dt 0, same sim time) reuse the last estimate.
   */
  let subjectClock = 0;
  /**
   * Presented (interpolated) subject positions, supplied per presented frame
   * by a present driver (`present()`, FixedStepDriver). PRD-08 §6.1: the
   * camera reads interpolated subject transforms — raw sim transforms
   * reintroduce 60/120/144 Hz judder.
   */
  let subjectSource: ((id: string) => readonly number[] | undefined) | undefined;
  const velocityTracks = new WeakMap<object, { p: readonly number[]; t: number; v: AuraVec3 }>();
  const velocityOf = (handle: RuntimeHandleLike, p: readonly number[]): AuraVec3 => {
    const track = velocityTracks.get(handle);
    if (!track) {
      velocityTracks.set(handle, { p: [p[0], p[1], p[2]], t: subjectClock, v: [0, 0, 0] });
      return [0, 0, 0];
    }
    const span = subjectClock - track.t;
    if (span > 1e-9) {
      track.v = [(p[0] - track.p[0]) / span, (p[1] - track.p[1]) / span, (p[2] - track.p[2]) / span];
      track.p = [p[0], p[1], p[2]];
      track.t = subjectClock;
    }
    return track.v;
  };
  const subjectOf = (handle: RuntimeHandleLike): AuraCameraSubject => {
    const presentedAt = subjectSource?.(handle.id);
    const p = presentedAt ?? handle.position;
    const subject = subjectFromHandle(handle, velocityOf(handle, p));
    if (!presentedAt) return subject;
    const d: AuraVec3 = [p[0] - handle.position[0], p[1] - handle.position[1], p[2] - handle.position[2]];
    const shift = (v: AuraVec3): AuraVec3 => [v[0] + d[0], v[1] + d[1], v[2] + d[2]];
    return {
      ...subject,
      position: [p[0], p[1], p[2]],
      bounds: { min: shift(subject.bounds.min), max: shift(subject.bounds.max) }
    };
  };

  const resolveSubject = (ref: string | object): AuraCameraSubject | undefined => {
    if (isHandleLike(ref)) return subjectOf(ref);
    if (typeof ref !== "string") return undefined;
    const runtime = findRuntimeTarget(registry, ref);
    if (runtime) {
      const handle = registry?.get(ref) ?? registry?.all().find((h) => h.visible !== false && (h.name === ref || h.tags.includes(ref)));
      return handle ? subjectOf(handle) : { position: runtime.position, velocity: [0, 0, 0], forward: [0, 0, 1], bounds: { min: runtime.position, max: runtime.position } };
    }
    const flat = flattenSceneNodes((app.scene?.nodes ?? []) as readonly SceneCameraNodeLike[]);
    const sceneNode = findSceneNodeTarget(flat, ref);
    if (!sceneNode) return undefined;
    return {
      position: sceneNode.position,
      velocity: [0, 0, 0],
      forward: [0, 0, 1],
      bounds: { min: sceneNode.position, max: sceneNode.position }
    };
  };

  /**
   * Rig deps close over the rig's OWN spec — after applyPose replaces
   * `app.scene.camera` with the presented pose spec, resolving targetNode from
   * the live spec would kill follow/subject resolution, so deps always read
   * the spec the rig was bound with.
   */
  const specDepsFor = (spec: LegacyCameraSpec) => ({
    runtimeTarget: () => {
      const src = findRuntimeTarget(registry, spec.targetNode as string | undefined);
      return src ? { position: src.position, rotationY: src.rotation[1] } : undefined;
    },
    sceneTarget: () => {
      const flat = flattenSceneNodes((app.scene?.nodes ?? []) as readonly SceneCameraNodeLike[]);
      const node = findSceneNodeTarget(flat, spec.targetNode as string | undefined);
      return node?.position;
    }
  });

  let boundSpec: LegacyCameraSpec | undefined;
  let writeSpec: CameraSpecMutable | undefined;

  const liveSpec = (): CameraSpecMutable | undefined =>
    (app.scene as unknown as { camera?: CameraSpecMutable } | undefined)?.camera;

  const currentSpec = (): LegacyCameraSpec | undefined =>
    (liveSpec() && liveSpec() !== writeSpec ? (liveSpec() as LegacyCameraSpec) : boundSpec) ??
    boundSpec;

  /*
   * Pixels, not evidence. The production renderer reads the camera from its
   * render snapshot, a shallow copy made at mount (`{ ...snapshot, nodes }`)
   * that keeps a reference to the authored camera object. Replacing
   * `app.scene.camera` never reached the GPU (promote run 38151983512:
   * byte-identical PNGs, NO-EFFECT; fixed in #1202). Until the Q-15-9 renderer
   * camera-override seam (#645) exists, the presented pose is written into
   * that renderer-held object (`renderCamera`):
   * - only pose fields are written (mode, position, target, up, roll, fov,
   *   near, far, orthographicSize). Authored fields such as `targetNode`,
   *   `offset` and `smoothing` stay; in perspective/orthographic mode the
   *   renderer's camera resolver ignores them, so 08-POSE's "targetNode
   *   survives applyPose" holds. `up`/`roll` are recorded but not yet drawn
   *   (the renderer has no up/roll consumer; #645 / Q-15-1 #222);
   * - the authored pose values are backed up at bind and restored when the
   *   scene's camera changes (setScene / rebind), so a reused builder or spec
   *   gets its own values back (Codex review on #1202);
   * - `freezeSpecs` still exposes a frozen copy on `app.scene.camera`, but the
   *   writes keep going to `renderCamera`, so pixels stay live (Codex review
   *   on #1202).
   * Rig inputs and spec deps take copies, so nothing feeds back.
   */
  const POSE_KEYS = ["mode", "position", "target", "up", "roll", "fov", "near", "far", "orthographicSize"] as const;
  let renderCamera: CameraSpecMutable | undefined;
  let renderCameraBackup: Partial<Record<(typeof POSE_KEYS)[number], unknown>> | undefined;

  const restoreRenderCamera = () => {
    if (!renderCamera || !renderCameraBackup || Object.isFrozen(renderCamera)) return;
    const target = renderCamera as Record<string, unknown>;
    for (const key of POSE_KEYS) {
      if (key in renderCameraBackup) target[key] = renderCameraBackup[key];
      else delete target[key];
    }
  };

  const adoptRenderCamera = (spec: CameraSpecMutable | undefined) => {
    if (spec === renderCamera) return;
    restoreRenderCamera();
    renderCamera = spec && !Object.isFrozen(spec) ? spec : undefined;
    renderCameraBackup = undefined;
    if (renderCamera) {
      const backup: Partial<Record<(typeof POSE_KEYS)[number], unknown>> = {};
      for (const key of POSE_KEYS) if (key in renderCamera) backup[key] = renderCamera[key];
      renderCameraBackup = backup;
    }
  };

  const applyPose = (pose: AuraCameraPose) => {
    const scene = app.scene as unknown as { camera?: CameraSpecMutable } | undefined;
    if (!scene) return;
    const mode = pose.orthographicSize !== undefined ? "orthographic" : "perspective";
    const fields: CameraSpecMutable = {
      mode,
      position: pose.position,
      target: pose.target,
      up: pose.up,
      roll: pose.roll,
      fov: pose.fov,
      near: pose.near,
      far: pose.far
    };
    if (pose.orthographicSize !== undefined) fields.orthographicSize = pose.orthographicSize;
    if (renderCamera) {
      Object.assign(renderCamera, fields);
      if (pose.orthographicSize === undefined) delete renderCamera.orthographicSize;
    }
    if (renderCamera && scene.camera === renderCamera && !options.freezeSpecs) {
      writeSpec = renderCamera;
      return;
    }
    const next: CameraSpecMutable = { ...(renderCamera ?? {}), ...fields };
    scene.camera = options.freezeSpecs ? Object.freeze(next) : next;
    writeSpec = next;
  };

  // S8 / C-9: collision rigs (`collision: true` on chase/orbit/shoulder/
  // flight) cast against the app's visible runtime-node bounds AND the static
  // scene nodes (primitives, dimensioned models) — static walls were missed
  // before (Codex review on #911). Without a
  // probe the controller's default never hits and a mounted orbit swings
  // straight through walls. §17/§19: the cast count per presented frame is
  // capped by the live C-27 tier (`app.quality.tier`, re-read every frame
  // so `app.quality.set` applies on the next present).
  const staticBoxes = createStaticProbeBoxSource();
  const probe = createCameraProbe({
    budget: () => cameraProbeBudgetForTier((app as { quality?: { tier?: unknown } }).quality?.tier),
    bounds: () => [
      ...(registry?.all() ?? [])
        .filter((h) => h.visible !== false)
        .map((h) => {
          const b = h.bounds();
          return { id: h.id, min: b.min, max: b.max };
        }),
      ...staticBoxes(app.scene?.nodes as readonly SceneCameraNodeLike[] | undefined)
    ]
  });
  const controller = createCameraController({
    resolveSubject,
    probe,
    // Copy: applyPose writes the presented pose into the authored object.
    specDeps: specDepsFor({ ...((app.scene?.camera as LegacyCameraSpec | undefined) ?? {}) }),
    aspect: () => {
      const canvas = (app as { canvas?: { width: number; height: number } }).canvas;
      return canvas && canvas.height > 0 ? canvas.width / canvas.height : 16 / 9;
    },
    applyPose,
    onCut: () => (app as { cutCamera?: () => void }).cutCamera?.(),
    reducedMotion: () => {
      try {
        return mediaMatches("(prefers-reduced-motion: reduce)");
      } catch {
        return false;
      }
    },
    barsLayer: () =>
      createCinematicBarsLayer({
        canvasAspect: (() => {
          const canvas = (app as { canvas?: { width: number; height: number } }).canvas;
          return canvas && canvas.height > 0 ? canvas.width / canvas.height : 16 / 9;
        })()
      }),
    initial: { spec: (() => { const s = currentSpec(); return s ? { ...s } : undefined; })() }
  });

  // Rebind when the scene's camera spec object changes (setScene / new spec).
  const rebindIfNeeded = () => {
    const spec = liveSpec() as LegacyCameraSpec | undefined;
    if (spec && spec !== boundSpec && spec !== (writeSpec as LegacyCameraSpec | undefined)) {
      boundSpec = spec;
      adoptRenderCamera(spec as CameraSpecMutable);
      // Snapshot the authored spec: applyPose later writes pose fields into this object.
      const authored = { ...spec };
      const rig = createFromSpecRig(authored, specDepsFor(authored));
      controller.use(rig);
    }
  };
  rebindIfNeeded();

  /*
   * 08-LOOP: drive the controller only while it has work — `app.onFrame`
   * callbacks keep `requiresFrames()` true (createAuraApp.ts), which re-arms
   * rAF forever and renders every static scene every frame. We subscribe on
   * any mutating camera call (arm) and unsubscribe when `isActive()` reports
   * idle (settled pose, no sequence/blend/ramp/layer energy, non-continuous
   * rig). Rigs marked `continuous` (subject/pointer tracking) never idle —
   * their output can change without an API call.
   */
  const onFrame = (app as OnFrameApp).onFrame;
  let unframe: (() => void) | undefined;
  /** Set once a present driver calls `present()`; the onFrame tick then yields. */
  let presentDriven = false;
  const arm = () => {
    if (!presentDriven && !unframe && typeof onFrame === "function") {
      unframe = onFrame.call(app, (f) => {
        rebindIfNeeded();
        subjectClock = f.time;
        probe.beginFrame();
        controller.update(Math.max(f.dt, 1e-6), f.time * 1000);
        // A zero-dt frame (FixedStepDriver's present-only `step(0)`) cannot
        // move a time-driven rig, so its zero pose delta says nothing about
        // idleness — deciding there unsubscribed a non-continuous rig (rail,
        // sequences) after its first present and froze it (S11).
        if (f.dt > 0 && !controller.isActive()) {
          unframe?.();
          unframe = undefined;
        }
      });
    }
  };
  arm();

  /* Every mutating C-22 call re-arms the tick. `Object.create` keeps the
   * prototype getters (`rig`, `presented`, `evidence`…) live while method
   * overrides shadow the raw controller's. */
  const armed = Object.create(controller) as {
    -readonly [K in keyof AuraCameraControllerImpl]: AuraCameraControllerImpl[K];
  } & AuraCameraPresentDriverTarget & AuraCameraProbeTarget;
  Object.defineProperty(armed, "probe", { value: probe, enumerable: false });
  /*
   * §6.1 present path: a fixed-step loop (FixedStepDriver) calls this ONCE per
   * presented tick, after interpolation resolve, with REAL dt and the
   * interpolated subject positions. From the first call on, the app.onFrame
   * tick stops updating the controller — otherwise it would also run on sim
   * substeps (sim dt: shake stalls in hit-stop, a 0-substep tick leaves the
   * rail parked and the next 2-substep tick doubles its step) and on the
   * present `step(0)`.
   */
  armed.present = (realDt, timeMs, subjectPosition) => {
    if (!presentDriven) {
      presentDriven = true;
      unframe?.();
      unframe = undefined;
    }
    subjectSource = subjectPosition;
    rebindIfNeeded();
    subjectClock = timeMs / 1000;
    probe.beginFrame();
    try {
      return controller.update(Math.max(realDt, 1e-6), timeMs);
    } finally {
      subjectSource = undefined;
    }
  };
  armed.use = (rig, o) => { arm(); controller.use(rig, o); };
  armed.setPose = (p, o) => { arm(); controller.setPose(p, o); };
  armed.setFov = (fov, o) => { arm(); controller.setFov(fov, o); };
  armed.setRoll = (roll, o) => { arm(); controller.setRoll(roll, o); };
  armed.addLayer = (layer, order) => { arm(); return controller.addLayer(layer, order); };
  armed.play = (seq) => { arm(); return controller.play(seq); };
  armed.cut = () => { arm(); controller.cut(); };
  armed.update = (realDt, timeMs) => { arm(); probe.beginFrame(); return controller.update(realDt, timeMs); };
  armed.shake = Object.create(controller.shake);
  armed.shake.add = (amount: number) => { arm(); controller.shake.add(amount); };
  armed.shake.configure = (o) => { arm(); controller.shake.configure(o); };
  armed.punch = Object.create(controller.punch);
  armed.punch.trigger = (o) => { arm(); controller.punch.trigger(o); };
  armed.fovKick = Object.create(controller.fovKick);
  armed.fovKick.set = (channel, offsetDeg, halflife) => { arm(); controller.fovKick.set(channel, offsetDeg, halflife); };
  armed.lookAt = controller.lookAt;
  armed.presented = () => { rebindIfNeeded(); return controller.presented(); };

  // freezeSpecs (C-22 option): route-held spec objects throw on cast-mutation.
  if (options.freezeSpecs) {
    const spec = liveSpec();
    const scene = app.scene as unknown as { camera?: CameraSpecMutable } | undefined;
    if (spec && scene && !Object.isFrozen(spec)) {
      // Route-facing frozen copy; renderCamera keeps receiving the pose.
      const frozen = Object.freeze({ ...spec });
      scene.camera = frozen;
      writeSpec = frozen;
    }
  }

  /*
   * Scene swaps restore the outgoing authored camera immediately. An idle
   * camera (static rig settled → onFrame unsubscribed, no present driver)
   * never reaches `rebindIfNeeded`, so without this hook the previous
   * builder/spec kept the last presented pose after `app.setScene()` and a
   * later reuse rendered the mutated camera (Codex review on #1209). The app
   * method is wrapped on this app instance only; flag-off apps never install
   * the real controller, so they are untouched.
   */
  const appWithSetScene = app as { setScene?: (next: unknown) => unknown };
  if (typeof appWithSetScene.setScene === "function") {
    const originalSetScene = appWithSetScene.setScene.bind(app);
    appWithSetScene.setScene = (next: unknown) => {
      const previous = renderCamera;
      restoreRenderCamera();
      // If this throws, the scene did not change: renderCamera stays bound and
      // the next update writes the pose into it again.
      const result = originalSetScene(next);
      if (previous && liveSpec() === previous) {
        // Same camera object kept across the swap: the runtime-node remount
        // (`app.nodes.add/remove` → setScene({ ...scene, nodes }),
        // runtimeNodes.ts) or a repeated AuraSceneBuilder.toJSON(). Keep the
        // binding: do NOT rebind (controller.use would drop setPose/FOV/roll
        // overrides and any custom rig; Codex review on #1215). Re-write the
        // current presented pose so the remounted renderer draws it (#1213).
        applyPose(controller.presented());
        arm();
        return result;
      }
      rebindIfNeeded();
      arm();
      return result;
    };
  }

  return armed;
}
