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
import type { AuraApp } from "../index.js";
import { createCameraController, type AuraCameraControllerImpl } from "./CameraController.js";
import { DEFAULT_POSE, createFromSpecRig, type LegacyCameraSpec } from "./rigs/legacy.js";
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

/**
 * Build the real controller against an app — exported for tests/harnesses that
 * want the controller without the full createAuraApp mount.
 */
export function createAuraCameraController(app: AuraApp, options: AuraCameraExtensionOptions = {}): AuraCameraControllerImpl {
  const registry = app.nodes as RuntimeRegistryLike | undefined;

  const resolveSubject = (ref: string | object): AuraCameraSubject | undefined => {
    if (isHandleLike(ref)) return subjectFromHandle(ref);
    if (typeof ref !== "string") return undefined;
    const runtime = findRuntimeTarget(registry, ref);
    if (runtime) {
      const handle = registry?.get(ref) ?? registry?.all().find((h) => h.visible !== false && (h.name === ref || h.tags.includes(ref)));
      return handle ? subjectFromHandle(handle) : { position: runtime.position, velocity: [0, 0, 0], forward: [0, 0, 1], bounds: { min: runtime.position, max: runtime.position } };
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

  const applyPose = (pose: AuraCameraPose) => {
    const scene = app.scene as unknown as { camera?: CameraSpecMutable } | undefined;
    if (!scene) return;
    const mode = pose.orthographicSize !== undefined ? "orthographic" : "perspective";
    const fields = {
      mode,
      position: pose.position,
      target: pose.target,
      fov: pose.fov,
      near: pose.near,
      far: pose.far,
      orthographicSize: pose.orthographicSize
    };
    // Always REPLACE the spec: writing fields would mutate the object the
    // bound rig reads as authored input (feedback into its own smoothing).
    const next: CameraSpecMutable = { ...fields };
    scene.camera = options.freezeSpecs ? Object.freeze(next) : next;
    writeSpec = next;
  };

  const controller = createCameraController({
    resolveSubject,
    specDeps: specDepsFor((app.scene?.camera as LegacyCameraSpec | undefined) ?? {}),
    aspect: () => {
      const canvas = (app as { canvas?: { width: number; height: number } }).canvas;
      return canvas && canvas.height > 0 ? canvas.width / canvas.height : 16 / 9;
    },
    applyPose,
    onCut: () => (app as { cutCamera?: () => void }).cutCamera?.(),
    reducedMotion: () => {
      try {
        return (
          typeof matchMedia === "function" &&
          matchMedia("(prefers-reduced-motion: reduce)").matches
        );
      } catch {
        return false;
      }
    },
    initial: { spec: currentSpec() }
  });

  // Rebind when the scene's camera spec object changes (setScene / new spec).
  const rebindIfNeeded = () => {
    const spec = liveSpec() as LegacyCameraSpec | undefined;
    if (spec && spec !== boundSpec && spec !== (writeSpec as LegacyCameraSpec | undefined)) {
      boundSpec = spec;
      const rig = createFromSpecRig({ ...spec }, specDepsFor(spec));
      controller.use(rig);
    }
  };
  rebindIfNeeded();

  // Drive the controller once per frame tick (real dt; frame.time is seconds).
  const onFrame = (app as OnFrameApp).onFrame;
  if (typeof onFrame === "function") {
    onFrame.call(app, (f) => {
      rebindIfNeeded();
      controller.update(Math.max(f.dt, 1e-6), f.time * 1000);
    });
  }

  // freezeSpecs (C-22 option): route-held spec objects throw on cast-mutation.
  if (options.freezeSpecs) {
    const spec = liveSpec();
    const scene = app.scene as unknown as { camera?: CameraSpecMutable } | undefined;
    if (spec && scene && !Object.isFrozen(spec)) {
      scene.camera = Object.freeze({ ...spec });
    }
  }

  return controller;
}
