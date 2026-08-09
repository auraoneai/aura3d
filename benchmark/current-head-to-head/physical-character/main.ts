import { camera, createAuraApp, defineAuraAssets, game, lights, material, model, primitives, scene } from "@aura3d/engine";
import { createRapierPhysics, type RapierBodyHandle, type RapierCharacterControllerHandle, type RapierPhysicsWorld, type RapierCharacterMovement } from "@aura3d/physics-rapier";
import * as RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const VIEWPORT = { width: 1440, height: 900, dpr: 1 } as const;
const ASSET = { id: "showcaseAnimatedRunnerHero", url: "/aura-assets/showcaseAnimatedRunnerHero.9ff4ea51.glb", sha256: "9ff4ea5196df2f58c9f63ff6d8608f084808a84b2ad992237a8a530b8b18899f", bytes: 16_354_836, bounds: [199.856, 199.701, 199.028] as const, clip: "OffensiveIdle" } as const;
const CAMERA = { position: [0, 2.6, 8] as const, target: [0, 0.85, 0] as const, fov: 38, near: 0.1, far: 100 } as const;
const LIGHTING = { background: "#05070b", ambient: 0.35, keyPosition: [8, 14, 10] as const, keyIntensity: 2.6, keyColor: "#fff4e6" } as const;
const PHYSICS = { gravity: [0, -9.81, 0] as const, start: [-2.2, 0.91, 0] as const, capsule: { halfHeight: 0.6, radius: 0.3 }, step: { position: [0, 0.15, 0] as const, halfExtents: [0.65, 0.15, 1.1] as const }, movementPerStep: [0.035, 0, 0] as const, steps: 70, dt: 1 / 60, autostep: { maxHeight: 0.35, minWidth: 0.2 }, snapToGround: 0.2 } as const;
const assets = defineAuraAssets({ showcaseAnimatedRunnerHero: { type: "model", format: "glb", url: ASSET.url, hash: `sha256-${ASSET.sha256}`, bounds: ASSET.bounds, sizeBytes: ASSET.bytes } });

declare global { interface Window { __AURA_THREE_HEAD_TO_HEAD_PHYSICAL_CHARACTER__?: any; __AURA_THREE_HEAD_TO_HEAD_PHYSICAL_CHARACTER_ERROR__?: string } }
const state: Record<string, any> = { ready: false, workload: "physical-character", viewport: VIEWPORT, asset: ASSET, contract: { camera: CAMERA, lighting: LIGHTING, physics: PHYSICS }, before: null, after: null, lifecycle: null };
const publish = () => { state.ready = Boolean(state.before); window.__AURA_THREE_HEAD_TO_HEAD_PHYSICAL_CHARACTER__ = structuredClone(state); };
publish();

void run().catch((error) => { window.__AURA_THREE_HEAD_TO_HEAD_PHYSICAL_CHARACTER_ERROR__ = error instanceof Error ? error.stack ?? error.message : String(error); });
async function run(): Promise<void> {
  const [auraPhysics, directPhysics] = await Promise.all([createAuraPhysics(), createDirectPhysics()]);
  const auraVisual = await createAuraVisual();
  const threeVisual = await createThreeVisual();
  renderPhase("before", auraPhysics, directPhysics, auraVisual, threeVisual);
  document.getElementById("advance")?.addEventListener("click", () => {
    let auraLast: RapierCharacterMovement | null = null; let directLast: DirectMovement | null = null; let auraCollisions = 0; let directCollisions = 0; let auraGroundedFrames = 0; let directGroundedFrames = 0;
    for (let index = 0; index < PHYSICS.steps; index += 1) {
      auraLast = auraPhysics.controller.move(auraPhysics.body, PHYSICS.movementPerStep); auraPhysics.world.step(PHYSICS.dt);
      directLast = moveDirect(directPhysics, PHYSICS.movementPerStep); directPhysics.world.timestep = PHYSICS.dt; directPhysics.world.step();
      auraCollisions += auraLast.collisions; directCollisions += directLast.collisions; if (auraLast.grounded) auraGroundedFrames += 1; if (directLast.grounded) directGroundedFrames += 1;
    }
    renderPhase("after", auraPhysics, directPhysics, auraVisual, threeVisual, { auraLast, directLast, auraCollisions, directCollisions, auraGroundedFrames, directGroundedFrames });
  });
  Object.assign(window, { __AURA_THREE_HEAD_TO_HEAD_PHYSICAL_CHARACTER_DISPOSE__: () => {
    auraPhysics.controller.dispose(); auraPhysics.world.dispose(); directPhysics.controller.free(); directPhysics.world.free(); auraVisual.dispose(); threeVisual.dispose();
    state.lifecycle = { auraPhysicsDisposed: auraPhysics.world.disposed, auraBodiesReleased: auraPhysics.world.bodies().length === 0, directRapierWorldFreed: true, auraVisualDisposed: true, threeVisualDisposed: true };
    publish(); return state.lifecycle;
  } });
}

async function createAuraPhysics(): Promise<{ world: RapierPhysicsWorld; body: RapierBodyHandle; controller: RapierCharacterControllerHandle }> {
  const world = await createRapierPhysics({ gravity: PHYSICS.gravity });
  world.createBody({ type: "fixed", position: [0, -0.1, 0], shape: { kind: "box", halfExtents: [4.5, 0.1, 2] }, friction: 1 });
  world.createBody({ type: "fixed", position: PHYSICS.step.position, shape: { kind: "box", halfExtents: PHYSICS.step.halfExtents }, friction: 1 });
  const body = world.createBody({ type: "kinematic-position", position: PHYSICS.start, shape: { kind: "capsule", halfHeight: PHYSICS.capsule.halfHeight, radius: PHYSICS.capsule.radius }, friction: 0 });
  const controller = world.createCharacterController(0.01).enableAutostep(PHYSICS.autostep.maxHeight, PHYSICS.autostep.minWidth).enableSnapToGround(PHYSICS.snapToGround).setMaxSlopeClimbAngle(Math.PI / 4);
  return { world, body, controller };
}
type DirectPhysics = { world: RAPIER.World; body: RAPIER.RigidBody; collider: RAPIER.Collider; controller: RAPIER.KinematicCharacterController };
type DirectMovement = { applied: readonly [number, number, number]; grounded: boolean; collisions: number; nextPosition: readonly [number, number, number] };
async function createDirectPhysics(): Promise<DirectPhysics> {
  await RAPIER.init({}); const world = new RAPIER.World({ x: PHYSICS.gravity[0], y: PHYSICS.gravity[1], z: PHYSICS.gravity[2] });
  const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.1, 0)); world.createCollider(RAPIER.ColliderDesc.cuboid(4.5, 0.1, 2).setFriction(1), floor);
  const step = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...PHYSICS.step.position)); world.createCollider(RAPIER.ColliderDesc.cuboid(...PHYSICS.step.halfExtents).setFriction(1), step);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...PHYSICS.start)); const collider = world.createCollider(RAPIER.ColliderDesc.capsule(PHYSICS.capsule.halfHeight, PHYSICS.capsule.radius).setFriction(0), body);
  const controller = world.createCharacterController(0.01); controller.enableAutostep(PHYSICS.autostep.maxHeight, PHYSICS.autostep.minWidth, false); controller.enableSnapToGround(PHYSICS.snapToGround); controller.setMaxSlopeClimbAngle(Math.PI / 4);
  return { world, body, collider, controller };
}
function moveDirect(physics: DirectPhysics, requested: readonly [number, number, number]): DirectMovement {
  physics.controller.computeColliderMovement(physics.collider, { x: requested[0], y: requested[1], z: requested[2] }); const movement = physics.controller.computedMovement(); const current = physics.body.translation(); const next = [current.x + movement.x, current.y + movement.y, current.z + movement.z] as const; physics.body.setNextKinematicTranslation({ x: next[0], y: next[1], z: next[2] });
  return { applied: [movement.x, movement.y, movement.z], grounded: physics.controller.computedGrounded(), collisions: physics.controller.numComputedCollisions(), nextPosition: next };
}

async function createAuraVisual(): Promise<{ render(position: readonly [number, number, number], seconds: number): any; dispose(): void }> {
  const canvas = requiredCanvas("aura"); const app = createAuraApp(canvas, { autoStart: false, resize: false, pixelRatio: 1, renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }, scene: scene().background(LIGHTING.background).camera(camera.perspective({ position: CAMERA.position, target: CAMERA.target, fov: CAMERA.fov })).add(lights.ambient({ intensity: LIGHTING.ambient, color: "#ffffff" })).add(lights.directional({ position: LIGHTING.keyPosition, intensity: LIGHTING.keyIntensity, color: LIGHTING.keyColor })).add(primitives.box({ name: "physical floor", material: material.pbr({ color: "#273244", roughness: 0.82 }) }).position(0, -0.1, 0).scale([9, 0.2, 4])).add(primitives.box({ name: "autostep obstacle", material: material.pbr({ color: "#d97706", roughness: 0.58 }) }).position(...PHYSICS.step.position).scale(PHYSICS.step.halfExtents.map((value) => value * 2) as [number, number, number])).add(model(assets.showcaseAnimatedRunnerHero, { name: "physical character", scaleMode: "fit", targetHeight: 1.8, castShadow: false, receiveShadow: false }).animate({ clip: ASSET.clip, loop: true, captureTime: 0.2 }).runtime(game.runtimeNode("physical-character", { tags: ["typed-glb", "rapier-character"] }))) });
  await app.ready(); const node = app.nodes.require("physical-character");
  return { render(position, seconds) { node.setPosition(position[0], position[1] - 0.91, position[2]); node.play(ASSET.clip, { loop: true, captureTime: seconds }); app.step(1 / 60); const diagnostics = app.diagnostics(); if (diagnostics.errors.length) throw new Error(diagnostics.errors.join(" | ")); return { backend: diagnostics.backend, runtimeBackend: diagnostics.renderer?.runtime.backend, drawCalls: diagnostics.drawCalls, backgroundPixel: readBackgroundPixel(canvas), hash: hashString(canvas.toDataURL("image/png")) }; }, dispose() { app.dispose(); } };
}
async function createThreeVisual(): Promise<{ render(position: readonly [number, number, number], seconds: number): any; dispose(): void }> {
  const canvas = requiredCanvas("three"); const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(1); renderer.setSize(VIEWPORT.width, VIEWPORT.height, false); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  const world = new THREE.Scene(); world.background = new THREE.Color(LIGHTING.background); world.add(new THREE.AmbientLight("#ffffff", LIGHTING.ambient)); const key = new THREE.DirectionalLight(LIGHTING.keyColor, LIGHTING.keyIntensity); key.position.set(...LIGHTING.keyPosition); world.add(key);
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, VIEWPORT.width / VIEWPORT.height, CAMERA.near, CAMERA.far); camera.position.set(...CAMERA.position); camera.lookAt(...CAMERA.target);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.2, 4), new THREE.MeshStandardMaterial({ color: "#273244", roughness: 0.82 })); floor.position.set(0, -0.1, 0); const step = new THREE.Mesh(new THREE.BoxGeometry(...PHYSICS.step.halfExtents.map((value) => value * 2) as [number, number, number]), new THREE.MeshStandardMaterial({ color: "#d97706", roughness: 0.58 })); step.position.set(...PHYSICS.step.position); world.add(floor, step);
  const gltf = await new GLTFLoader().loadAsync(ASSET.url); const actor = gltf.scene; fitAndPlace(actor, 1.8); world.add(actor); const clip = THREE.AnimationClip.findByName(gltf.animations, ASSET.clip); if (!clip) throw new Error(`Missing ${ASSET.clip}`); const mixer = new THREE.AnimationMixer(actor); mixer.clipAction(clip).play();
  return { render(position, seconds) { actor.position.set(position[0], position[1] - 0.91, position[2]); mixer.setTime(seconds); world.updateMatrixWorld(true); renderer.render(world, camera); const pixels = readThree(renderer); return { revision: THREE.REVISION, actualRenderer: true, actualGLTFLoader: true, actualAnimationMixer: true, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, backgroundPixel: Array.from(pixels.slice(0, 4)), hash: hash(pixels) }; }, dispose() { actor.traverse((object) => { if (!(object instanceof THREE.Mesh)) return; object.geometry.dispose(); for (const entry of Array.isArray(object.material) ? object.material : [object.material]) entry.dispose(); }); floor.geometry.dispose(); (floor.material as THREE.Material).dispose(); step.geometry.dispose(); (step.material as THREE.Material).dispose(); renderer.dispose(); } };
}
function renderPhase(phase: "before" | "after", auraPhysics: Awaited<ReturnType<typeof createAuraPhysics>>, directPhysics: DirectPhysics, auraVisual: Awaited<ReturnType<typeof createAuraVisual>>, threeVisual: Awaited<ReturnType<typeof createThreeVisual>>, movement?: any): void {
  const auraPosition = auraPhysics.body.position(); const p = directPhysics.body.translation(); const directPosition = [p.x, p.y, p.z] as const; const seconds = phase === "before" ? 0.2 : 1.2; const aura = auraVisual.render(auraPosition, seconds); const three = threeVisual.render(directPosition, seconds);
  state[phase] = { interaction: { applied: phase === "after", steps: phase === "after" ? PHYSICS.steps : 0 }, aura: { ...aura, publicPackageOnly: true, actualSelectedRapierAdapter: true, nativeCharacterController: typeof auraPhysics.controller.raw.computeColliderMovement === "function" && typeof auraPhysics.controller.raw.computedMovement === "function", position: auraPosition, movement: movement ? { last: movement.auraLast, totalCollisions: movement.auraCollisions, groundedFrames: movement.auraGroundedFrames } : null }, three: { ...three, actualDirectRapier: true, nativeCharacterController: typeof directPhysics.controller.computeColliderMovement === "function" && typeof directPhysics.controller.computedMovement === "function", position: directPosition, movement: movement ? { last: movement.directLast, totalCollisions: movement.directCollisions, groundedFrames: movement.directGroundedFrames } : null } };
  publish();
}
function fitAndPlace(object: THREE.Object3D, height: number): void { const bounds = new THREE.Box3().setFromObject(object); const center = bounds.getCenter(new THREE.Vector3()); const size = bounds.getSize(new THREE.Vector3()); const scale = height / Math.max(size.y, 0.0001); object.scale.setScalar(scale); object.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale); }
function requiredCanvas(id: string): HTMLCanvasElement { const canvas = document.getElementById(id); if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`Missing canvas #${id}`); return canvas; }
function readBackgroundPixel(canvas: HTMLCanvasElement): readonly number[] { const gl = canvas.getContext("webgl2"); if (!gl) throw new Error("Missing Aura WebGL2 context"); const pixel = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); return Array.from(pixel); }
function readThree(renderer: THREE.WebGLRenderer): Uint8Array { const pixels = new Uint8Array(VIEWPORT.width * VIEWPORT.height * 4); renderer.getContext().readPixels(0, 0, VIEWPORT.width, VIEWPORT.height, renderer.getContext().RGBA, renderer.getContext().UNSIGNED_BYTE, pixels); return pixels; }
function hash(bytes: Uint8Array): string { let value = 2166136261; for (let index = 0; index < bytes.length; index += 97) { value ^= bytes[index]!; value = Math.imul(value, 16777619); } return (value >>> 0).toString(16).padStart(8, "0"); }
function hashString(value: string): string { return hash(new TextEncoder().encode(value)); }
