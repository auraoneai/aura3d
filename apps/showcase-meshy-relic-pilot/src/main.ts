import { camera, createAuraApp, game, lights, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const START = { x: -1.8, z: 0 } as const;
const RELIC = { x: 1.2, z: 0 } as const;
const MOVE_SPEED = 2.45;
const COLLECTION_RADIUS = 0.72;

interface MeshyRelicPilotEvidence {
  readonly appId: "showcase-meshy-relic-pilot";
  readonly ready: boolean;
  readonly frameCount: number;
  readonly state: "seeking" | "collected";
  readonly objective: "reach-relic" | "relic-secured";
  readonly score: number;
  readonly player: { readonly x: number; readonly z: number };
  readonly relicVisible: boolean;
  readonly collectionCount: number;
  readonly resetCount: number;
  readonly drawCalls: number;
  readonly renderSize: readonly number[];
  readonly rendererBackend: string;
  readonly errors: readonly string[];
  readonly primaryAsset: "arenaRelic";
  readonly assetReference: "assets.arenaRelic";
  readonly capabilityLabel: "CLI asset pipeline";
  readonly routeLabel: "prototype";
  readonly mechanic: "route-local distance-threshold collection";
  readonly collisionPlan: "unproven";
}

declare global { interface Window { __MESHY_RELIC_PILOT__?: MeshyRelicPilotEvidence; } }

const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  scene: scene()
    .background("#090d12")
    .add(primitives.box({ name: "arena floor", material: material.pbr({ color: "#182027", roughness: 0.88, metallic: 0.04 }) }).position(0, -0.08, 0).scale([5.8, 0.12, 4.1]))
    .add(primitives.cylinder({ name: "relic plinth", material: material.pbr({ color: "#433925", roughness: 0.54, metallic: 0.38 }) }).position(RELIC.x, 0.04, RELIC.z).scale([0.78, 0.12, 0.78]))
    .add(primitives.torus({ name: "collection boundary", material: material.emissive({ color: "#694e1c", emissive: "#d5a64e", emissiveIntensity: 0.48 }) }).position(RELIC.x, 0.18, RELIC.z).rotate(Math.PI / 2, 0, 0).scale([0.88, 0.88, 0.025]))
    .add(model(assets.arenaRelic, { name: "typed Meshy arena relic", scaleMode: "fit", targetHeight: 1.65, castShadow: true, receiveShadow: true }).position(RELIC.x, 0.18, RELIC.z).runtime(game.runtimeNode("arena-relic", { tags: ["primary-asset", "collectible"] })))
    .add(primitives.sphere({ name: "route-local survey marker", material: material.emissive({ color: "#245a60", emissive: "#62d5d0", emissiveIntensity: 0.72 }) }).position(START.x, 0.28, START.z).scale(0.24).runtime(game.runtimeNode("survey-marker", { tags: ["player-marker"] })))
    .add(lights.ambient({ intensity: 0.42, color: "#d9e5e6" }))
    .add(lights.directional({ position: [-3.5, 6, 4.5], intensity: 1.65, color: "#fff0ce" }))
    .add(lights.point({ position: [RELIC.x, 2.8, 1.7], intensity: 2.4, color: "#e4ad54" }))
    .add(lights.point({ position: [START.x, 1.5, 1.6], intensity: 1.2, color: "#64d9d1" }))
    .camera(camera.perspective({ position: [0, 6.4, 10.2], target: [-0.15, 0.45, 0], fov: 42 }))
});

const input = game.input({
  actions: { left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"], forward: ["KeyW", "ArrowUp"], back: ["KeyS", "ArrowDown"], reset: ["KeyR"] },
  axes: { moveX: { negative: "left", positive: "right" }, moveZ: { negative: "forward", positive: "back" } },
  bufferMs: 90
});

const playerNode = app.nodes.require("survey-marker");
const relicNode = app.nodes.require("arena-relic");
function requireElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error("Meshy relic pilot HUD is incomplete: " + selector);
  return element;
}
const objectiveNode = requireElement("#objective");
const scoreNode = requireElement("#score");
const statusNode = requireElement("#status");

let playerX: number = START.x;
let playerZ: number = START.z;
let collected = false;
let score = 0;
let collectionCount = 0;
let resetCount = 0;
let frameCount = 0;

function renderHud(): void {
  objectiveNode.textContent = collected ? "Relic secured" : "Reach the relic";
  scoreNode.textContent = String(score).padStart(3, "0");
  statusNode.textContent = collected ? "Collection confirmed · press R to run again" : "Survey marker online · move into the gold ring";
  document.body.dataset.collected = String(collected);
}
function reset(): void {
  playerX = START.x; playerZ = START.z; collected = false; score = 0; resetCount += 1;
  playerNode.setPosition(playerX, 0.28, playerZ); relicNode.setVisible(true); renderHud();
}
function collect(): void {
  if (collected) return;
  collected = true; score = 100; collectionCount += 1; relicNode.setVisible(false); renderHud();
}
function publishEvidence(): void {
  const diagnostics = app.diagnostics();
  window.__MESHY_RELIC_PILOT__ = {
    appId: "showcase-meshy-relic-pilot",
    ready: diagnostics.drawCalls > 0 && diagnostics.renderSize[0] > 0 && diagnostics.errors.length === 0,
    frameCount, state: collected ? "collected" : "seeking", objective: collected ? "relic-secured" : "reach-relic", score,
    player: { x: Number(playerX.toFixed(3)), z: Number(playerZ.toFixed(3)) }, relicVisible: !collected, collectionCount, resetCount,
    drawCalls: diagnostics.drawCalls, renderSize: diagnostics.renderSize,
    rendererBackend: diagnostics.renderer?.runtime.backend ?? app.backend, errors: diagnostics.errors,
    primaryAsset: "arenaRelic", assetReference: "assets.arenaRelic", capabilityLabel: "CLI asset pipeline",
    routeLabel: "prototype", mechanic: "route-local distance-threshold collection", collisionPlan: "unproven"
  };
}

renderHud();
publishEvidence();
app.onFrame(({ dt }) => {
  const step = Math.min(0.25, Math.max(1 / 240, dt || 1 / 60));
  const snapshot = input.update(step);
  if (snapshot.actions.reset?.pressed === true) reset();
  if (!collected) {
    const moveX = input.axis("moveX"); const moveZ = input.axis("moveZ");
    const magnitude = Math.hypot(moveX, moveZ); const normalization = magnitude > 1 ? 1 / magnitude : 1;
    playerX = Math.max(-2.45, Math.min(2.45, playerX + moveX * normalization * MOVE_SPEED * step));
    playerZ = Math.max(-1.5, Math.min(1.5, playerZ + moveZ * normalization * MOVE_SPEED * step));
    playerNode.setPosition(playerX, 0.28, playerZ);
    if (Math.hypot(playerX - RELIC.x, playerZ - RELIC.z) <= COLLECTION_RADIUS) collect();
  }
  frameCount += 1;
  if (frameCount % 2 === 0) publishEvidence();
});
