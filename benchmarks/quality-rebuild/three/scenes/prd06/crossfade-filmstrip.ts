/**
 * Lane adapter `prd06-crossfade-filmstrip` (PRD-06 T1.14), three-side.
 *
 * Live choreography — bespoke runner instead of runThreeScene because the
 * frozen path plays one clip statically: soldier plays `motion.initialClip`,
 * then `previous.crossFadeTo(next, 0.25, true)` at each transition time;
 * `mixer.update(1/60)` runs on the fixed capture clock before READY and the
 * canvas freezes on the `horizonSeconds` frame. Choreography markers publish to
 * `window.__PRD06_CROSSFADE_THREE__`; the graph stashes on
 * `window.__QR_THREE_GRAPH__` for the mask passes.
 */
import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { CSM } from "three/addons/csm/CSM.js";
import { hdriAssets, modelAssets } from "../../../shared/assets";
import { fetchOnce } from "../../../shared/fetch-once";
import type { CapabilityEntry, ReadyPayload } from "../../../shared/types";
import { crossfadeSchedule, prd06CrossfadeFilmstrip } from "../../../scenes/prd06/crossfade-filmstrip";

declare const __THREE_VERSION__: string;

interface Prd06CrossfadeThreeReport {
  readonly status: "running" | "done" | "error";
  readonly error?: string;
  readonly simSeconds?: number;
  readonly firedTransitions?: readonly string[];
}

declare global {
  interface Window {
    __PRD06_CROSSFADE_THREE__?: Prd06CrossfadeThreeReport;
  }
}

export default async function run(host: HTMLElement, opts?: { variant?: string; dpr?: 1 | 2; qrFlags?: readonly string[] }): Promise<ReadyPayload> {
  const started = performance.now();
  const spec = prd06CrossfadeFilmstrip;
  const motion = spec.motion;
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * (opts?.dpr ?? 1);
  const errors: string[] = [];
  const capabilityLog: CapabilityEntry[] = [];

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(dpr);
  renderer.setSize(spec.resolution.width, spec.resolution.height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = spec.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene3 = new THREE.Scene();
  if (spec.background.kind === "color") scene3.background = new THREE.Color(spec.background.color);

  const camera3 = new THREE.PerspectiveCamera(spec.camera.fov, spec.resolution.width / spec.resolution.height, spec.camera.near, spec.camera.far);
  camera3.position.set(...spec.camera.position);
  camera3.lookAt(...spec.camera.target);
  camera3.updateMatrixWorld(true);

  const pmrem = new THREE.PMREMGenerator(renderer);
  // HDRLoader over fetched bytes like common.ts — /qr-assets serves the raw
  // file (the plain /<repoPath> route mangles binary through the TS path).
  const hdr = new HDRLoader().createDataTexture(await fetchOnce(hdriAssets[spec.environment!.hdri].url));
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const envMap = pmrem.fromEquirectangular(hdr).texture;
  scene3.environment = envMap;
  scene3.environmentIntensity = spec.environment!.intensity;
  scene3.environmentRotation.y = spec.environment!.rotation;
  hdr.dispose();
  pmrem.dispose();

  const sun = spec.lights[0] as Extract<(typeof spec.lights)[number], { kind: "directional" }>;
  const csm = new CSM({
    camera: camera3,
    parent: scene3,
    cascades: 4,
    maxFar: spec.camera.far,
    mode: "practical",
    shadowMapSize: spec.shadows!.mapSize,
    shadowBias: spec.shadows!.bias ?? 0,
    lightDirection: new THREE.Vector3(sun.target[0] - sun.position[0], sun.target[1] - sun.position[1], sun.target[2] - sun.position[2]).normalize(),
    lightIntensity: sun.intensity
  });
  for (const light of csm.lights) {
    light.color.set(sun.color);
    light.shadow.normalBias = spec.shadows!.normalBias ?? 0;
  }

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 6),
    new THREE.MeshStandardMaterial({ color: "#6d7076", roughness: 0.9, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  csm.setupMaterial(ground.material as THREE.Material);
  scene3.add(ground);

  const gltf: GLTF = await new GLTFLoader().loadAsync(modelAssets.soldier.url);
  const skinned = gltf.scene;
  skinned.traverse((object: THREE.Object3D) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (mesh.material) csm.setupMaterial(mesh.material as THREE.Material);
    }
  });
  scene3.add(skinned);

  const clips = gltf.animations ?? [];
  const byName = new Map(clips.map((clip) => [clip.name, clip]));
  const initial = byName.get(motion.initialClip);
  if (!initial) errors.push(`missing clip ${motion.initialClip}`);

  const mixer = new THREE.AnimationMixer(skinned);
  const actions = new Map<string, THREE.AnimationAction>();
  const actionFor = (clipName: string): THREE.AnimationAction => {
    let action = actions.get(clipName);
    if (!action) {
      action = mixer.clipAction(byName.get(clipName)!);
      actions.set(clipName, action);
    }
    return action;
  };
  let current = actionFor(motion.initialClip);
  current.play();

  mixer.update(0);
  renderer.render(scene3, camera3);
  for (let i = 0; i < spec.settleFrames; i += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve(undefined)));
    renderer.render(scene3, camera3);
  }

  window.__QR_THREE_GRAPH__ = { scene: scene3, camera: camera3, renderer, lights: csm.lights };

  const report: Prd06CrossfadeThreeReport = { status: "running" };
  const reportMut = report as unknown as Record<string, unknown>;
  const strip = spec.strip!;
  window.__PRD06_CROSSFADE_THREE__ = report;

  const fired = new Set<string>();
  // Fixed capture clock (`crossfadeSchedule`), same as the aura side: the
  // mixer ticks in integer 60 Hz sim steps (never wall-clock), the whole
  // choreography runs before READY, strip tiles render at fixed steps, and the
  // canvas is left on the `horizonSeconds` frame for the harness screenshot
  // and mask passes. In-page strip captures (toDataURL) — compositor
  // screenshots read black under headless SwiftShader.
  const schedule = crossfadeSchedule(spec);
  const dt = schedule.dt;
  let sim = 0;
  const stripFrames: { readonly at: number; readonly dataUrl: string }[] = [];
  (window as { __PRD06_CROSSFADE_THREE_FRAMES__?: unknown }).__PRD06_CROSSFADE_THREE_FRAMES__ = stripFrames;
  const renderStripTile = (): Promise<void> => new Promise<void>((resolve) => requestAnimationFrame(() => {
    renderer.render(scene3, camera3);
    stripFrames.push({ at: sim, dataUrl: renderer.domElement.toDataURL("image/png") });
    resolve();
  }));
  try {
    for (let step = 1; step <= schedule.steps; step += 1) {
      sim = step * dt;
      motion.transitions.forEach((transition, index) => {
        if (step !== schedule.transitionSteps[index] || fired.has(transition.clip)) return;
        fired.add(transition.clip);
        const next = actionFor(transition.clip);
        next.enabled = true;
        next.reset();
        // Phase-matched entry (three's syncGroup equivalent — r185 has no
        // phase sync): the new action starts at the outgoing action's
        // normalised phase, then warp equalises cycle rates over the fade.
        const outDur = current.getClip().duration;
        if (outDur > 0) next.time = ((current.time % outDur) / outDur) * next.getClip().duration;
        next.play();
        // three-side crossfade per T1.14: crossFadeTo(…, 0.25, true)
        current.crossFadeTo(next, transition.fadeSeconds, transition.warp);
        current = next;
      });
      mixer.update(dt);
      for (const stripStep of schedule.stripSteps) if (stripStep === step && stripFrames.length < strip.frames) await renderStripTile();
      reportMut.simSeconds = sim;
    }
    renderer.render(scene3, camera3);
    reportMut.firedTransitions = [...fired];
    (report as { status: string }).status = "done";
  } catch (error) {
    (report as { status: string }).status = "error";
    reportMut.error = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  }

  return {
    engine: "three",
    scene: spec.id,
    engineVersion: typeof __THREE_VERSION__ === "string" ? __THREE_VERSION__ : "dev",
    capabilityLog,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    warnings: [],
    errors,
    loadMs: Math.round(performance.now() - started),
    variant: "default",
    dpr: opts?.dpr ?? 1,
    appliedToneMapping: "aces-filmic",
    appliedExposure: spec.exposure,
    lightUnits: "three-physical",
    shadows: null,
    fallbackLightsActive: null,
    assetHashes: { soldier: modelAssets.soldier.sha256 },
    qrFlags: opts?.qrFlags ?? [],
    extra: { filmstrip: true, choreography: motion.transitions.map((t) => `${t.at}s→${t.clip}@${t.fadeSeconds}s`), captureSimSeconds: sim, stripTimes: stripFrames.map((f) => f.at) }
  };
}
