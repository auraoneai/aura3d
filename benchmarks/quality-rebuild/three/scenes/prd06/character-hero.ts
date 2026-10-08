// Lane adapter `prd06-character-hero` (PRD-06 T4.4), three.js r185 side: the
// matched reference — same hero GLB, same HDRI/lights/ground, the same 8 s
// §17.2 scripted sequence via THREE.AnimationMixer crossfades, CCDIKSolver
// leg chains against flat ground, a distributed head look-at, and a scripted
// follow camera. The aura side owns the §17.2 gate evaluation; this side
// records the same frame samples for visual/parity review.
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { CCDIKSolver } from "three/examples/jsm/animation/CCDIKSolver.js";
import { hdriAssets, modelAssets } from "../../../shared/assets";
import { fetchOnce } from "../../../shared/fetch-once";
import type { CapabilityEntry, ReadyPayload } from "../../../shared/types";
import { characterHeroPhaseAt, CHARACTER_HERO_DURATION, prd06CharacterHero } from "../../../scenes/prd06/character-hero";
import { motionFrame, type MotionFrame } from "@aura3d/animation/lanes";

declare const __THREE_VERSION__: string;

const HERO_MOTION_BONES = [
  "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head",
  "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
  "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
  "thigh_l", "calf_l", "foot_l", "ball_l", "ball_leaf_l",
  "thigh_r", "calf_r", "foot_r", "ball_r", "ball_leaf_r",
  "root"
] as const;

interface ThreeHeroFrame {
  readonly t: number;
  readonly phase: string;
  readonly controllerSpeed: number;
  readonly actions: readonly { clip: string; time: number; weight: number }[];
  readonly motion: MotionFrame;
  readonly lookTarget: readonly [number, number, number];
}

declare global {
  interface Window {
    __PRD06_CHARACTER_HERO_THREE__?: { status: string; frames: ThreeHeroFrame[]; error?: string };
  }
}

/** Weighted head-at-target look for the three side (fraction per bone). */
function applyLookAt(
  chain: readonly { bone: THREE.Bone; weight: number }[],
  targetWorld: THREE.Vector3,
  scratch: { pos: THREE.Vector3; quat: THREE.Quaternion; parentQuat: THREE.Quaternion; m: THREE.Matrix4 }
): void {
  const up = new THREE.Vector3(0, 1, 0);
  for (const { bone, weight } of chain) {
    bone.getWorldPosition(scratch.pos);
    const eye = scratch.pos.clone();
    const m = scratch.m.lookAt(eye, targetWorld, up);
    scratch.quat.setFromRotationMatrix(m);
    bone.parent!.getWorldQuaternion(scratch.parentQuat);
    scratch.quat.premultiply(scratch.parentQuat.clone().invert());
    bone.quaternion.slerp(scratch.quat, Math.min(1, weight * 1.6));
    bone.updateMatrixWorld(true);
  }
}

export default async function run(host: HTMLElement, opts?: { variant?: string; dpr?: 1 | 2; qrFlags?: readonly string[] }): Promise<ReadyPayload> {
  const started = performance.now();
  const spec = prd06CharacterHero;
  const hero = spec.characterHero;
  const log: CapabilityEntry[] = [];
  const push = (feature: string, status: CapabilityEntry["status"], detail: string) => log.push({ feature, status, detail });

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = spec.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(host.clientWidth || spec.resolution.width, host.clientHeight || spec.resolution.height);
  renderer.setPixelRatio(opts?.dpr ?? spec.resolution.devicePixelRatio);
  host.appendChild(renderer.domElement);

  const sceneThree = new THREE.Scene();
  sceneThree.background = new THREE.Color(spec.background.kind === "color" ? spec.background.color : "#1d2026");
  const cameraThree = new THREE.PerspectiveCamera(spec.camera.fov, (host.clientWidth || spec.resolution.width) / (host.clientHeight || spec.resolution.height), spec.camera.near, spec.camera.far);
  cameraThree.position.set(hero.startPosition[0] + 2.4, hero.followCamera.height, hero.startPosition[2] + 2.6);

  // C-10 lighting parity: HDRI IBL + two directionals (sun shadows).
  const hdri = await new HDRLoader().loadAsync(hdriAssets.studioSmall08.url);
  const pmrem = new THREE.PMREMGenerator(renderer);
  sceneThree.environment = pmrem.fromEquirectangular(hdri).texture;
  sceneThree.environmentIntensity = spec.environment!.intensity;
  const sun = new THREE.DirectionalLight("#fff1dc", 2.8);
  sun.position.set(3.5, 6, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -6; sun.shadow.camera.right = 6;
  sun.shadow.camera.top = 6; sun.shadow.camera.bottom = -6;
  sceneThree.add(sun);
  const fill = new THREE.DirectionalLight("#b8c8e0", 0.5);
  fill.position.set(-4, 3, -2);
  sceneThree.add(fill);

  const groundMesh = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.05, 10),
    new THREE.MeshStandardMaterial({ color: "#596069", roughness: 0.92, metalness: 0 })
  );
  groundMesh.position.set(0, -0.025, 0);
  groundMesh.receiveShadow = true;
  sceneThree.add(groundMesh);

  const lookTargetMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 16, 12),
    new THREE.MeshStandardMaterial({ color: "#ffb454", emissive: "#ff8c28", emissiveIntensity: 2.2, roughness: 0.4 })
  );
  lookTargetMesh.position.set(1.2, 1.5, 1.4);
  sceneThree.add(lookTargetMesh);

  const gltf = await new Promise<GLTF>((resolve, reject) => {
    fetchOnce(modelAssets.auraClashPlayerRig.url)
      .then((buffer) => new GLTFLoader().parse(buffer, "", resolve, reject))
      .catch(reject);
  });
  const heroRoot = gltf.scene;
  heroRoot.position.set(hero.startPosition[0], hero.startPosition[1], hero.startPosition[2]);
  heroRoot.rotation.y = Math.PI / 2;
  heroRoot.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  sceneThree.add(heroRoot);

  const clips = gltf.animations;
  const mixer = new THREE.AnimationMixer(heroRoot);
  const clipByName = (name: string) => clips.find((clip) => clip.name === name)!;
  const map = hero.clipMap;
  const actions = {
    idle: mixer.clipAction(clipByName(map.idle)),
    walk: mixer.clipAction(clipByName(map.walk)),
    run: mixer.clipAction(clipByName(map.run)),
    jump: mixer.clipAction(clipByName(map["jump-start"])),
    land: mixer.clipAction(clipByName(map.land))
  };
  for (const action of Object.values(actions)) {
    action.setLoop(THREE.LoopRepeat, Infinity).play();
    action.weight = 0;
  }
  actions.idle.weight = 1;
  push("character-hero:clips", "supported", `AnimationMixer over ${clips.length} clips (idle/walk/run/jump/land)`);

  // Foot IK: CCDIKSolver legs pinned at ankle XZ to flat ground height —
  // same chain as the aura side (thigh→calf→foot).
  const skinned = (() => { let m: THREE.SkinnedMesh | undefined; heroRoot.traverse((n) => { if ((n as THREE.SkinnedMesh).isSkinnedMesh && !m) m = n as THREE.SkinnedMesh; }); return m!; })();
  const boneIndex = (name: string) => skinned.skeleton.bones.findIndex((b) => b.name === name || b.name === THREE.PropertyBinding.sanitizeNodeName(name));
  const iks: { target: number; effector: number; links: { index: number }[]; iteration: number }[] = [];
  for (const leg of hero.footIk.legs) {
    const hipIdx = boneIndex(leg.hip);
    const kneeIdx = boneIndex(leg.knee);
    const ankleIdx = boneIndex(leg.ankle);
    if (hipIdx < 0 || kneeIdx < 0 || ankleIdx < 0) continue;
    const target = new THREE.Bone();
    target.name = `__ik_target_${leg.side}`;
    heroRoot.add(target);
    skinned.skeleton.bones.push(target);
    skinned.skeleton.boneInverses.push(new THREE.Matrix4());
    iks.push({ target: skinned.skeleton.bones.length - 1, effector: ankleIdx, links: [{ index: kneeIdx }, { index: hipIdx }], iteration: 8 });
  }
  const ikSolver = iks.length > 0 ? new CCDIKSolver(skinned, iks) : undefined;
  push("character-hero:footIk", ikSolver ? "supported" : "missing", `CCDIKSolver ${iks.length} leg chains (flat ground)`);

  const boneByName = (name: string): THREE.Bone | undefined => {
    let found: THREE.Bone | undefined;
    heroRoot.traverse((n) => { if (!found && n.name === name) found = n as THREE.Bone; });
    return found;
  };
  const lookChain = hero.lookAt.bones
    .map(({ bone, weight }) => ({ bone: boneByName(bone)!, weight }))
    .filter((entry) => entry.bone !== undefined);
  const scratch = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), parentQuat: new THREE.Quaternion(), m: new THREE.Matrix4() };
  const targetWorld = new THREE.Vector3();
  push("character-hero:lookAt", lookChain.length === hero.lookAt.bones.length ? "supported" : "partial", `distributed look-at on ${lookChain.length} bones`);

  const probe: { status: string; frames: ThreeHeroFrame[] } = { status: "running", frames: [] };
  window.__PRD06_CHARACTER_HERO_THREE__ = probe;

  const heroPos = { x: hero.startPosition[0], z: hero.startPosition[2] };
  let t = 0;
  let last = performance.now();
  let currentLocomotion = "idle";

  const crossfade = (to: THREE.AnimationAction, key: string, seconds = 0.25) => {
    if (currentLocomotion === key) return;
    actions[currentLocomotion as keyof typeof actions].fadeOut(seconds);
    to.fadeIn(seconds);
    currentLocomotion = key;
  };

  const tick = (): void => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (t >= CHARACTER_HERO_DURATION) {
      probe.status = "done";
      renderer.render(sceneThree, cameraThree);
      return;
    }
    t += dt;
    const phase = characterHeroPhaseAt(t);

    // Locomotion crossfades matching the phase table.
    if (phase.name === "air") crossfade(actions.jump, "jump", 0.12);
    else if (phase.name === "land") crossfade(actions.idle, "idle", 0.3);
    else if (phase.name === "run") crossfade(actions.run, "run");
    else if (phase.name === "walk") crossfade(actions.walk, "walk");
    else crossfade(actions.idle, "idle");

    mixer.update(dt);

    // Kinematic travel + jump arc.
    const [ax, az] = hero.travelAxis;
    heroPos.x += ax * phase.speed * dt;
    heroPos.z += az * phase.speed * dt;
    const air = hero.sequence.find((p) => p.name === "air")!;
    const py = t >= air.from && t <= air.to ? 4 * 0.55 * ((t - air.from) / (air.to - air.from)) * (1 - (t - air.from) / (air.to - air.from)) : 0;
    heroRoot.position.set(heroPos.x, hero.startPosition[1] + py, heroPos.z);

    // Scripted look target + distributed look-at.
    targetWorld.set(
      heroPos.x + 1.4 + 1.1 * Math.sin(t * 1.6),
      1.45 + 0.45 * Math.sin(t * 2.1),
      heroPos.z + 1.6 * Math.cos(t * 1.6)
    );
    lookTargetMesh.position.copy(targetWorld);
    heroRoot.updateMatrixWorld(true);
    applyLookAt(lookChain, targetWorld, scratch);

    // Foot IK against flat ground (ankle targets pinned to current ankle XZ).
    if (ikSolver) {
      for (const [i, leg] of hero.footIk.legs.entries()) {
        const ankle = skinned.skeleton.bones[iks[i]!.effector]!;
        const ankleWorld = ankle.getWorldPosition(new THREE.Vector3());
        const targetBone = skinned.skeleton.bones[iks[i]!.target]!;
        targetBone.position.copy(heroRoot.worldToLocal(new THREE.Vector3(ankleWorld.x, leg.ankleHeight, ankleWorld.z)));
      }
      heroRoot.updateMatrixWorld(true);
      ikSolver.update();
      heroRoot.updateMatrixWorld(true);
    }

    // Follow camera: trailing offset each frame.
    cameraThree.position.set(heroPos.x + 2.4, hero.followCamera.height, heroPos.z + 2.6);
    cameraThree.lookAt(heroPos.x, 1.0, heroPos.z);

    if (probe.frames.length === 0 || t - probe.frames[probe.frames.length - 1]!.t >= 1 / 60 - 1e-6) {
      const motion = motionFrame(t, HERO_MOTION_BONES, (bone) => {
        const b = boneByName(bone);
        if (!b) return undefined;
        const m = new THREE.Matrix4().copy(b.matrixWorld);
        return m.elements;
      });
      probe.frames.push({
        t,
        phase: phase.name,
        controllerSpeed: phase.speed,
        actions: Object.entries(actions).filter(([, a]) => a.getEffectiveWeight() > 1e-4).map(([key, a]) => ({ clip: a.getClip().name, time: a.time, weight: a.getEffectiveWeight() })),
        motion,
        lookTarget: [targetWorld.x, targetWorld.y, targetWorld.z]
      });
    }

    renderer.render(sceneThree, cameraThree);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return {
    engine: "three",
    scene: spec.id,
    engineVersion: typeof __THREE_VERSION__ === "string" ? `three-${__THREE_VERSION__}` : "three",
    capabilityLog: log,
    drawCalls: renderer.info.render.calls,
    warnings: [],
    errors: [],
    loadMs: Math.round(performance.now() - started),
    variant: "default",
    dpr: opts?.dpr ?? 1,
    appliedToneMapping: "aces-filmic",
    appliedExposure: spec.exposure,
    lightUnits: "physical",
    shadows: null,
    fallbackLightsActive: null,
    assetHashes: { auraClashPlayerRig: modelAssets.auraClashPlayerRig.sha256 },
    qrFlags: opts?.qrFlags ?? spec.qrFlags ?? [],
    extra: { characterHero: { duration: CHARACTER_HERO_DURATION } }
  } as unknown as ReadyPayload;
}
