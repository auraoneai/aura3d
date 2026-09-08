import {
  camera,
  createAuraApp,
  crowds,
  game,
  geometry,
  lights,
  material,
  model,
  navigation,
  primitives,
  scene,
  type AuraApp
} from "@aura3d/engine";

import { assets } from "../../src/aura-assets";

// PART O1 browser proof: the ROOT bake -> path -> crowd loop through
// createAuraApp. The default loader path is used on purpose (no injected peer),
// so this page proves the optional-peer dynamic import works in the browser and
// agents visibly move on the baked navmesh from live Detour state.

const SOUP = createWalkableSoup();
const STARTS = [[-4, 0, -0.9], [-4, 0, -0.3], [-4, 0, 0.3], [-4, 0, 0.9]] as const;
const TARGETS = [[4, 0, 0.9], [4, 0, 0.3], [4, 0, -0.3], [4, 0, -0.9]] as const;
const TRACE_STEPS = 120;
const DT = 1 / 60;
const LOD = { nearDistance: 9, farDistance: 13 } as const;
const AGENT_OPTIONS = { radius: 0.18, height: 1.25, maxSpeed: 2.4, maxAcceleration: 8 };

interface O1Evidence {
  readonly status: "loading" | "ready" | "running" | "complete" | "error";
  readonly claim: "root-navigation-crowds-bake-path-move";
  readonly available: boolean;
  readonly pathLength: number;
  readonly steps: number;
  readonly initialPositions: readonly (readonly [number, number, number])[];
  readonly positions: readonly (readonly [number, number, number])[];
  readonly agentZeroDisplacement: number;
  readonly diagnostics: ReturnType<typeof crowds.diagnostics> | null;
  readonly initialDiagnostics: ReturnType<typeof crowds.diagnostics> | null;
  readonly lodBounds: typeof LOD;
  readonly overCapError: string | null;
  readonly drawCalls: number;
  readonly resets: number;
  readonly renderedTiers?: readonly string[];
  readonly errors: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_PART_O1__?: O1Evidence;
  }
}

let app: AuraApp | undefined;
let representations: ReturnType<typeof crowds.bindRepresentations> | undefined;
let renderedTiers: readonly string[] = [];
let selectedAgent = -1;
const hiddenAgents = new Set<number>();
let representationCreates = 0;
let representationDisposals = 0;
const replacedCrowdDisposalErrors: string[] = [];
const captureFailure = (operation: () => unknown): string | null => {
  try { operation(); return null; } catch (error) { return error instanceof Error ? error.message : String(error); }
};
let lodCamera: readonly [number, number, number] = [-8.5, 5.5, 9];
let mesh: Awaited<ReturnType<typeof navigation.bake>> | undefined;
let crowd: ReturnType<typeof crowds.create> | undefined;
let agents: readonly unknown[] = [];
let status: O1Evidence["status"] = "loading";
let steps = 0;
let resets = 0;
let running = false;
let available = false;
let pathLength = 0;
let initialPositions: (readonly [number, number, number])[] = [];
let initialDiagnostics: ReturnType<typeof crowds.diagnostics> | null = null;
let overCapError: string | null = null;

publish();
void boot().catch(fail);

async function boot(): Promise<void> {
  available = await navigation.isAvailable();
  if (!available) throw new Error("Root navigation peer unavailable in this browser (fail-closed: no fake crowd).");
  mesh = await navigation.bake({ positions: SOUP.positions, indices: SOUP.indices });
  const query = navigation.path(mesh, [...STARTS[0]], [...TARGETS[0]]);
  if (!query.success || query.points.length < 2) throw new Error(query.error ?? "Root Detour path query failed.");
  pathLength = query.points.length;
  createCrowd();
  initialPositions = livePositions();
  initialDiagnostics = crowds.diagnostics(crowd!, { camera: [-8.5, 5.5, 9], ...LOD });
  app = await createVisual();
  syncVisual();
  bindControls();
  status = "ready";
  publish();
}

function createCrowd(): void {
  if (!mesh) throw new Error("Cannot create a crowd before its navmesh.");
  const next = crowds.create(mesh, { maxAgents: 4, maxAgentRadius: 0.25 });
  const placed = STARTS.map((start, index) => {
    const agent = crowds.addAgent(next, [...start], AGENT_OPTIONS);
    if (!crowds.setTarget(next, agent, [...TARGETS[index]!])) throw new Error(`Root crowd agent ${index} rejected its target.`);
    return agent;
  });
  try {
    crowds.addAgent(next, [0, 0, 0]);
    overCapError = null;
  } catch (error) {
    overCapError = error instanceof Error ? error.message : String(error);
  }
  representations?.dispose();
  representations = undefined;
  if (crowd) {
    const previous = crowd;
    crowds.dispose(previous);
    const error = captureFailure(() => previous.count());
    if (!error?.includes("disposed")) throw new Error("Replaced Recast crowd still accepts count() after disposal.");
    replacedCrowdDisposalErrors.push(error);
  }
  crowd = next;
  agents = placed;
}

async function createVisual(): Promise<AuraApp> {
  let builder = scene()
    .background("#05070b")
    .camera(camera.perspective({ position: [-8.5, 5.5, 9], target: [0, 0, 0], fov: 55 }))
    .add(lights.ambient({ intensity: 0.42, color: "#ffffff" }))
    .add(lights.directional({ name: "o1 key", position: [7, 13, 8], intensity: 2.4, color: "#fff4e6" }))
    .add(primitives.box({ name: "o1 walkable deck", material: material.pbr({ color: "#273244", roughness: 0.82 }) }).position(0, -0.08, 0).scale([10, 0.16, 6]))
    .add(primitives.box({ name: "o1 unwalkable center", material: material.pbr({ color: "#d97706", roughness: 0.55 }) }).position(0, 0.5, 0).scale([2, 1, 3]));
  STARTS.forEach((start, index) => {
    const pose = game.runtimeNode(`o1-agent-${index}-near`, { tags: ["root-navigation", "crowd", "near-model"] });
    builder = builder.add(model(assets.showcaseCityVehicle, {
      name: `o1 typed vehicle ${index}`, targetMaxDimension: 0.8
    }).position(start[0], 0.22, start[2]).runtime(pose));
    builder = builder.add(primitives.box({ name: `o1 vehicle hull LOD ${index}`,
      material: material.pbr({ color: "#a78bfa", roughness: 0.4 })
    }).position(start[0], 0.22, start[2]).scale([0.32, 0.22, 0.8])
      .runtime(game.runtimeNode(`o1-agent-${index}-mid`, { tags: ["crowd", "mid-hull"] })));
    // XY geometry has +Z normals. Yaw alone rotates that normal toward the
    // camera; rotating an XZ plane with XYZ Euler pitch/yaw does not do so.
    builder = builder.add(geometry.custom({ kind: "aura-custom-geometry",
      positions: [[-0.4,-0.14,0],[0.4,-0.14,0],[0.4,0.02,0],[0.2,0.14,0],[-0.2,0.14,0],[-0.4,0.02,0]],
      indices: [0,1,2,0,2,3,0,3,4,0,4,5]
    }, { name: `o1 vehicle billboard ${index}`,
      material: material.pbr({ color: "#a78bfa", roughness: 0.9 })
    }).position(start[0], 0.22, start[2])
      .runtime(game.runtimeNode(`o1-agent-${index}-impostor`, { tags: ["crowd", "impostor-billboard"] })));
    builder = builder.add(primitives.torus({ name: `o1 selected agent ${index}`,
      material: material.pbr({ color: "#ffdf30", emissive: "#ffdf30", emissiveIntensity: 2 })
    }).position(start[0], 0.05, start[2]).scale(0.55)
      .runtime(game.runtimeNode(`o1-selection-${index}`)));

  });
  const next = createAuraApp("#o1-viewport", {
    autoStart: false,
    resize: true,
    pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: builder
  });
  await next.ready();
  return next;
}

async function runTrace(): Promise<void> {
  if (running || status === "loading" || status === "error") return;
  if (steps >= TRACE_STEPS) reset();
  running = true;
  status = "running";
  publish();
  while (steps < TRACE_STEPS && running) {
    advance(Math.min(4, TRACE_STEPS - steps));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  running = false;
  status = steps >= TRACE_STEPS ? "complete" : "ready";
  publish();
}

function advance(count = 10): void {
  if (!crowd || !app || steps >= TRACE_STEPS) return;
  const accepted = Math.min(count, TRACE_STEPS - steps);
  for (let index = 0; index < accepted; index += 1) crowds.update(crowd, DT);
  steps += accepted;
  syncVisual();
  status = steps >= TRACE_STEPS ? "complete" : running ? "running" : "ready";
  publish();
}

function reset(): void {
  if (!mesh || !app) return;
  running = false;
  createCrowd();
  steps = 0;
  resets += 1;
  status = "ready";
  syncVisual();
  publish();
}

function livePositions(): (readonly [number, number, number])[] {
  if (!crowd) return [];
  return crowds.agents(crowd).map((state) => state.position);
}

function syncVisual(): void {
  if (!crowd || !app) return;
  if (!representations) {
    representations = crowds.bindRepresentations(crowd, { ...LOD, hysteresis: 0.35,
      create: (index, tier) => {
        const node = app!.nodes.require(`o1-agent-${index}-${tier}`);
        representationCreates++;
        return {
          update: ({ position, heading, selected }) => {
            app!.nodes.require(`o1-selection-${index}`).setPosition(position[0], 0.05, position[2]).setVisible(selected && !hiddenAgents.has(index));
            node.setPosition(position[0], position[1] + 0.22, position[2]);
            // Cylindrical billboard faces the actual render camera, independently of LOD probes.
            node.setRotation(0, tier === "impostor" ? Math.atan2(-8.5 - position[0], 9 - position[2]) : heading, 0);
          },
          setVisible: visible => { node.setVisible(visible); },
          dispose: () => { representationDisposals++; node.setVisible(false); app!.nodes.require(`o1-selection-${index}`).setVisible(false); }
        };
      }
    });
    for (let index = 0; index < STARTS.length; index++) for (const tier of ["near", "mid", "impostor"]) {
      app.nodes.require(`o1-agent-${index}-${tier}`).setVisible(false);
    }
  }
  renderedTiers = representations.update(lodCamera, new Set(selectedAgent < 0 ? [] : [selectedAgent]), hiddenAgents);
  app.step(DT);
  void agents;
}

function bindControls(): void {
  Object.assign(window, { __AURA3D_O1_LOD_PROBE__: (position: readonly [number, number, number]) => {
    lodCamera = position; syncVisual(); publish(); return [...renderedTiers];
  } });
  Object.assign(window, { __AURA3D_O1_REPRESENTATIONS__: () => ({
    creates: representationCreates, disposals: representationDisposals, selectedAgent,
    replacedCrowdDisposalErrors: [...replacedCrowdDisposalErrors],
    nodes: STARTS.flatMap((_, index) => ["near", "mid", "impostor"].map(tier => {
      const node = app!.nodes.require(`o1-agent-${index}-${tier}`);
      return { id: node.id, tier, index, position: node.position, rotation: node.rotation, visible: node.visible };
    }))
  }) });
  Object.assign(window, { __AURA3D_O1_DISPOSE_PROBE__: async () => {
    if (!representations || !crowd || !mesh || !app) throw new Error("O1 resources must be mounted before disposal proof.");
    const previousBinding = representations, previousCrowd = crowd, previousMesh = mesh, previousApp = app;
    previousBinding.dispose();
    representations = undefined;
    crowds.dispose(previousCrowd);
    crowd = undefined;
    navigation.dispose(previousMesh);
    mesh = undefined;
    await previousApp.disposeAsync();
    app = undefined;
    let appStepError: string | null = null;
    try { await previousApp.stepAsync(DT); } catch (error) { appStepError = error instanceof Error ? error.message : String(error); }
    return {
      bindingUpdateError: captureFailure(() => previousBinding.update(lodCamera)),
      crowdCountError: captureFailure(() => previousCrowd.count()),
      meshPathError: captureFailure(() => navigation.path(previousMesh, [...STARTS[0]], [...TARGETS[0]])),
      appStepError,
      diagnostics: previousApp.diagnostics(),
      replacedCrowdDisposalErrors: [...replacedCrowdDisposalErrors]
    };
  } });
  window.addEventListener("pagehide", () => { representations?.dispose(); if (crowd) crowds.dispose(crowd); if (mesh) navigation.dispose(mesh); app?.dispose(); }, { once: true });
  document.querySelector<HTMLButtonElement>("[data-testid='o1-run']")?.addEventListener("click", () => void runTrace());
  document.querySelector<HTMLButtonElement>("[data-testid='o1-pulse']")?.addEventListener("click", () => advance());
  document.querySelector<HTMLButtonElement>("[data-testid='o1-reset']")?.addEventListener("click", reset);
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") { event.preventDefault(); advance(); }
    if (event.code === "Digit1") { selectedAgent = selectedAgent === 0 ? -1 : 0; syncVisual(); publish(); }
    if (event.code === "KeyH") { hiddenAgents.has(0) ? hiddenAgents.delete(0) : hiddenAgents.add(0); syncVisual(); publish(); }
    if (event.code === "KeyR") { event.preventDefault(); reset(); }
  });
}

function publish(): void {
  const positions = livePositions();
  const diagnostics = app?.diagnostics();
  const evidence: O1Evidence = {
    status,
    claim: "root-navigation-crowds-bake-path-move",
    available,
    pathLength,
    steps,
    initialPositions,
    positions,
    agentZeroDisplacement: positions.length > 0 && initialPositions.length > 0
      ? Math.hypot(
        positions[0]![0] - initialPositions[0]![0],
        positions[0]![1] - initialPositions[0]![1],
        positions[0]![2] - initialPositions[0]![2]
      )
      : 0,
    diagnostics: crowd ? crowds.diagnostics(crowd, { camera: [-8.5, 5.5, 9], ...LOD }) : null,
    initialDiagnostics,
    lodBounds: LOD,
    overCapError,
    drawCalls: diagnostics?.drawCalls ?? 0,
    resets,
    renderedTiers,
    errors: diagnostics?.errors ?? []
  };
  window.__AURA3D_PART_O1__ = evidence;
  document.querySelector<HTMLElement>("[data-testid='o1-state']")!.textContent = status;
  document.querySelector<HTMLElement>("[data-testid='o1-metrics']")!.textContent =
    `${steps}/${TRACE_STEPS} ticks · ${positions.length} agents · path ${pathLength}`;
}

function fail(error: unknown): void {
  status = "error";
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  window.__AURA3D_PART_O1__ = {
    status, claim: "root-navigation-crowds-bake-path-move", available, pathLength, steps,
    initialPositions, positions: [], agentZeroDisplacement: 0, diagnostics: null,
    initialDiagnostics, lodBounds: LOD, overCapError, drawCalls: 0, resets,
    errors: [message], error: message
  };
  document.querySelector<HTMLElement>("[data-testid='o1-state']")!.textContent = "error";
}

function createWalkableSoup(): { positions: number[]; indices: number[] } {
  const positions: number[] = [];
  const indices: number[] = [];
  const quad = (x0: number, z0: number, x1: number, z1: number): void => {
    const base = positions.length / 3;
    positions.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1);
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  quad(-5, -3, -1, 3); quad(1, -3, 5, 3); quad(-1, -3, 1, -1.5); quad(-1, 1.5, 1, 3);
  return { positions, indices };
}

export {};
