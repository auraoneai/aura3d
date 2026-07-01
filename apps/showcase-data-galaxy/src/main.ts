import {
  camera,
  charts,
  collectAuraSceneEvidence,
  createAuraApp,
  effects,
  game,
  interactions,
  labels,
  lights,
  material,
  model,
  particles,
  primitives,
  scene,
  timeline,
  ui
} from "@aura3d/engine";
import type { AuraCameraSpec, AuraNodeInput, AuraSceneSnapshot } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import "./styles.css";

const APP_ID = "showcase-data-galaxy";
const FORMATIONS = ["galaxy", "sphere", "vortex", "network", "wave"] as const;
const CAMERA_MODES = ["overview", "focus", "orbital", "flythrough"] as const;
const PERFORMANCE_TIERS = ["balanced", "dense", "cinematic"] as const;

type DataGalaxyFormation = typeof FORMATIONS[number];
type DataGalaxyCameraMode = typeof CAMERA_MODES[number];
type DataGalaxyPerformanceTier = typeof PERFORMANCE_TIERS[number];
type ShowcaseStatus = "booting" | "ready" | "error";

interface DataGalaxyControls {
  formation: DataGalaxyFormation;
  cameraMode: DataGalaxyCameraMode;
  particleCount: number;
  speed: number;
  performance: DataGalaxyPerformanceTier;
  connections: boolean;
}

interface SceneBuild {
  readonly snapshot: AuraSceneSnapshot;
  readonly systems: readonly string[];
  readonly diagnostics: Record<string, unknown>;
}

interface DataGalaxyAssetEvidence {
  readonly typedRef: "assets.showcaseParticleCore";
  readonly id: string;
  readonly url: string;
  readonly license: string;
  readonly author: string;
}

interface DataGalaxyEvidence {
  readonly status: ShowcaseStatus;
  readonly appId: typeof APP_ID;
  readonly frameCount: number;
  readonly interactionState: {
    readonly lastChanged: string;
    readonly runtimeNodeIds: readonly string[];
    readonly cameraMode: DataGalaxyCameraMode;
  };
  readonly telemetry: {
    readonly frameCount: number;
    readonly formation: DataGalaxyFormation;
    readonly cameraMode: DataGalaxyCameraMode;
    readonly requestedParticles: number;
    readonly effectiveParticles: number;
    readonly speed: number;
    readonly nodeCount: number;
    readonly labelCount: number;
    readonly effectCount: number;
    readonly connections: boolean;
  };
  readonly controls: DataGalaxyControls;
  readonly systems: readonly string[];
  readonly assets: readonly DataGalaxyAssetEvidence[];
  readonly claimBoundary: string;
  readonly diagnostics: Record<string, unknown>;
  readonly updatedAt: string;
}

declare global {
  interface Window {
    __AURA3D_SHOWCASE_DATA_GALAXY__?: DataGalaxyEvidence;
  }
}

const controls: DataGalaxyControls = {
  formation: "galaxy",
  cameraMode: "overview",
  particleCount: 220,
  speed: 1,
  performance: "balanced",
  connections: false
};

const dataCoreAsset = assets.showcaseParticleCore;

let lastChanged = "initial-load";
let activeBuild = buildDataGalaxyScene();
let app: ReturnType<typeof createAuraApp> | undefined;

publishEvidence("booting");
app = createAuraApp("#aura-stage", {
  diagnostics: { overlay: false, performancePanel: false },
  pixelRatio: 1,
  scene: activeBuild.snapshot
});

bindControls();
updateControlState();
publishEvidence("ready");

app.onFrame(({ frame, time }) => {
  const speed = controls.speed;
  app?.nodes.get("data-galaxy-core")?.setRotation(time * 0.16 * speed, time * 0.54 * speed, 0);
  app?.nodes.get("data-galaxy-core-asset")?.setRotation(time * 0.12 * speed, time * 0.38 * speed, 0.08);
  app?.nodes.get("data-galaxy-vortex-ring")?.setRotation(1.22, time * 0.32 * speed, 0.22);
  app?.nodes.get("data-galaxy-attractor-east")?.setPosition(1.42 + Math.sin(time * speed * 0.7) * 0.08, 1.38, -0.16);
  {
    const selectedScale = 0.072 + Math.sin(time * 2.4 * speed) * 0.014;
    app?.nodes.get("data-galaxy-selected-kpi")?.setScale([selectedScale, selectedScale, selectedScale]);
  }
  if (frame % 12 === 0) publishEvidence("ready");
});

function buildDataGalaxyScene(): SceneBuild {
  const dataset = createDataset(controls.formation);
  const sceneNodes = [
    ...createCleanDataBarsNodes(dataset),
    ...createGalaxyOverlayNodes()
  ];
  const builder = scene()
    .background("#050607")
    .add(primitives.plane({ name: "quiet transparent data explorer floor", material: material.glass({ color: "#071011", opacity: 0.13, roughness: 0.2 }) })
      .position(0, -0.045, 0.1)
      .scale([2.35, 1, 1.62]))
    .addMany(sceneNodes)
    .add(effects.fog({ name: "soft analytics volume haze", density: 0.018, color: "#102426", intensity: 0.24 }))
    .add(effects.bloom({ name: "controlled data galaxy bloom", intensity: controls.performance === "cinematic" ? 0.22 : 0.16, threshold: 0.78, radius: 0.24 }))
    .add(effects.particles({
      name: "restrained inference dust particle system",
      emitter: controls.formation === "wave" ? "fountain" : "swirl",
      particleCount: effectiveParticleCount(),
      emissionRate: Math.round(14 * controls.speed),
      color: controls.formation === "network" ? "#a3e635" : "#64f4cf",
      radius: controls.performance === "dense" ? 0.42 : 0.34,
      height: 0.46,
      speed: controls.speed * 0.36,
      turbulence: controls.performance === "cinematic" ? 0.035 : 0.055,
      materialMode: "spark"
    }))
    .add(model(dataCoreAsset, {
      name: "typed diagnostic particle core route-primary hero",
      scaleMode: "fit",
      targetMaxDimension: 2.05,
      material: material.neon({ color: "#64f4cf", emissive: "#64f4cf", emissiveIntensity: 0.72 }),
      castShadow: false,
      receiveShadow: true
    })
      .position(0, 0.3, -0.22)
      .rotate(0.02, 0.34, 0)
      .runtime(game.runtimeNode("data-galaxy-diagnostic-anchor", { tags: ["typed-asset", "diagnostic-anchor", "particle-core"] })))
    .add(model(dataCoreAsset, {
      name: "typed data reactor particle core central observatory",
      scaleMode: "fit",
      targetMaxDimension: 0.52,
      material: material.glass({ color: "#64f4cf", opacity: 0.28, roughness: 0.2 }),
      castShadow: true,
      receiveShadow: false
    })
      .position(0.7, 0.22, -0.6)
      .rotate(0.12, -0.18, 0.08)
      .scale(0.48)
      .animate({ clip: "turntable", speed: 0.12, captureTime: 0.42 })
      .runtime(game.runtimeNode("data-galaxy-core-asset", { tags: ["typed-asset", "data-reactor", "hero"] })))
    .add(lights.point({ name: "data galaxy amber rim light", position: [2.4, 2.5, 2.5], color: "#ffd27d", intensity: 0.95 }))
    .add(lights.point({ name: "data galaxy teal core light", position: [-1.8, 1.7, 1.3], color: "#64f4cf", intensity: 1.15 }))
    .add(interactions.highlight({ target: "height-colored data bar 2-2", selected: "height-colored data bar 2-2" }))
    .camera(dataGalaxyCamera(controls.cameraMode))
    .timeline(timeline.loop({ seconds: Math.max(5, 11 / controls.speed), captureTime: 0.42 }));

  const snapshot = builder.toJSON();
  const sceneEvidence = collectAuraSceneEvidence(snapshot);
  const particleDiagnostics = particles.diagnostics(snapshot.nodes);
  const chartQA = charts.visualQA(snapshot.nodes);
  const runtimeNodeIds = snapshot.nodes
    .map((node) => "runtime" in node ? node.runtime?.id : undefined)
    .filter((id): id is string => Boolean(id));
  const systems = [
    "Aura3D primitive data explorer chart base",
    "typed data reactor model(assets.showcaseParticleCore)",
    "compiler rejected assets.showcaseDataStation from the live primary path after unreadable route-primary evidence",
    "charts.visualQA structural chart proof",
    "particles.diagnostics restrained particle budget",
    "procedural attractor field",
    "runtime animated inference core",
    "camera preset state",
    controls.connections ? "connection arcs enabled" : "connection arcs disabled",
    `${effectiveParticleCount().toLocaleString("en-US")} requested particle effect budget`
  ];
  return {
    snapshot,
    systems,
    diagnostics: {
      sceneEvidence,
      chartQA,
      particleDiagnostics,
      runtimeNodeIds,
      nodeCount: snapshot.nodes.length,
      labelCount: snapshot.nodes.filter((node) => node.kind === "label").length,
      effectCount: snapshot.nodes.filter((node) => node.kind === "effect").length
    }
  };
}

function createCleanDataBarsNodes(dataset: number[][]): AuraNodeInput[] {
  const palette = ["#64f4cf", "#f7c65f", "#ff8ba7", "#a3e635"] as const;
  const nodes: AuraNodeInput[] = [];
  const rowCount = dataset.length;
  const colCount = Math.max(...dataset.map((row) => row.length));
  const xStep = 0.42;
  const zStep = 0.34;
  const originX = -((colCount - 1) * xStep) / 2;
  const originZ = -((rowCount - 1) * zStep) / 2;

  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < (dataset[row]?.length ?? 0); col += 1) {
      const value = dataset[row]?.[col] ?? 0;
      const height = 0.12 + value * 0.98;
      const color = palette[(row + col) % palette.length]!;
      const selected = row === 1 && col === 1;
      const x = originX + col * xStep;
      const z = originZ + row * zStep + 0.44;
      nodes.push(
        primitives.box({
          name: `height-colored data bar ${row + 1}-${col + 1}`,
          material: material.clearcoatPaint({
            color,
            roughness: 0.32,
            metallic: 0.02,
            clearcoat: selected ? 0.78 : 0.42
          })
        })
          .position(x, 0.055 + height / 2, z)
          .scale([0.1, height * 0.72, 0.1]),
        primitives.box({
          name: `subtle data bar cap ${row + 1}-${col + 1}`,
          material: material.emissive({
            color: selected ? "#f8fbff" : color,
            emissive: selected ? "#f8fbff" : color,
            emissiveIntensity: selected ? 0.28 : 0.1
          })
        })
          .position(x, 0.074 + height, z)
          .scale([0.12, 0.01, 0.12])
      );
    }
  }

  for (let col = 0; col < colCount; col += 1) {
    nodes.push(
      primitives.box({
        name: `quiet x axis tick ${col + 1}`,
        material: material.emissive({ color: "#29373a", emissive: "#64f4cf", emissiveIntensity: 0.08 })
      })
        .position(originX + col * xStep, 0.03, originZ - 0.28)
        .scale([0.01, 0.006, 0.1])
    );
  }

  for (let row = 0; row < rowCount; row += 1) {
    nodes.push(
      primitives.box({
        name: `quiet z axis tick ${row + 1}`,
        material: material.emissive({ color: "#2e2b20", emissive: "#f7c65f", emissiveIntensity: 0.08 })
      })
        .position(originX - 0.28, 0.03, originZ + row * zStep)
        .scale([0.1, 0.006, 0.01])
    );
  }

  return nodes;
}

function createGalaxyOverlayNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [
    ...createDataExplorerGuideNodes(),
    primitives.sphere({
      name: "data galaxy quiet inference core",
      material: material.neon({ color: "#f8fbff", emissive: "#64f4cf", emissiveIntensity: 1.55 })
    }).position(0, 0.95, -0.16).scale(0.12).runtime(game.runtimeNode("data-galaxy-core")),
    primitives.torus({
      name: "quiet inference orbit",
      material: material.neon({ color: "#64f4cf", emissive: "#64f4cf", emissiveIntensity: 0.52, opacity: 0.34 })
    }).position(0, 0.95, -0.16).rotate(1.5708, 0.18, 0).scale([0.72, 0.72, 0.014]),
    primitives.torus({
      name: "data galaxy vortex evidence ring",
      material: material.neon({ color: "#ffd27d", emissive: "#ffd27d", emissiveIntensity: 0.56, opacity: 0.32 })
    }).position(0, 0.95, -0.16).rotate(1.22, 0.18, 0.22).scale([0.92, 0.92, 0.018]).runtime(game.runtimeNode("data-galaxy-vortex-ring")),
    primitives.torus({
      name: "subtle amber confidence orbit",
      material: material.neon({ color: "#ffd27d", emissive: "#ffd27d", emissiveIntensity: 0.42, opacity: 0.24 })
    }).position(0, 0.58, -0.12).rotate(1.5708, -0.14, 0).scale([0.42, 0.42, 0.01]),
    labels.callout("Inference Core", "data galaxy quiet inference core", {
      name: "data galaxy inference core label",
      position: [0.32, 1.28, -0.12],
      size: 0.14,
      color: "#d9fff4"
    }),
    labels.hud(`Data Galaxy | ${controls.formation} | ${controls.performance}`, {
      name: "data galaxy route evidence hud",
      screenAnchor: "bottom-left",
      size: 0.24
    })
  ];

  const attractors = [
    { id: "data-galaxy-attractor-east", name: "growth node", position: [1.08, 0.92, -0.1] as const, color: "#f7c65f" },
    { id: "data-galaxy-attractor-west", name: "risk node", position: [-1.02, 0.78, -0.42] as const, color: "#ff8ba7" },
    { id: "data-galaxy-attractor-south", name: "retention node", position: [-0.18, 0.58, 0.72] as const, color: "#64f4cf" }
  ];

  for (const attractor of attractors) {
    nodes.push(
      primitives.sphere({
        name: attractor.name,
        material: material.neon({ color: attractor.color, emissive: attractor.color, emissiveIntensity: 2.1 })
      }).position(attractor.position[0], attractor.position[1], attractor.position[2]).scale(0.085).runtime(game.runtimeNode(attractor.id)),
      labels.anchor(attractor.name.replace(" node", ""), attractor.name, {
        name: `${attractor.name} label`,
        position: [attractor.position[0], attractor.position[1] + 0.18, attractor.position[2]],
        size: 0.115
      })
    );
  }

  if (controls.connections) {
    nodes.push(
      streamBeam("growth connection", [0.56, 0.92, -0.14], [0.76, 0.01, 0.016], 0.08, "#f7c65f"),
      streamBeam("risk connection", [-0.55, 0.86, -0.3], [0.72, 0.01, 0.016], -0.28, "#ff8ba7"),
      streamBeam("retention connection", [-0.1, 0.68, 0.32], [0.74, 0.01, 0.016], -1.34, "#64f4cf")
    );
  }

  return nodes;
}

function createDataExplorerGuideNodes(): AuraNodeInput[] {
  const axisMaterial = material.neon({ color: "#d9fff4", emissive: "#d9fff4", emissiveIntensity: 0.74, opacity: 0.62 });
  const revenueMaterial = material.neon({ color: "#64f4cf", emissive: "#64f4cf", emissiveIntensity: 1.0, opacity: 0.72 });
  const riskMaterial = material.neon({ color: "#ff8ba7", emissive: "#ff8ba7", emissiveIntensity: 0.64, opacity: 0.48 });
  const retentionMaterial = material.neon({ color: "#ffd27d", emissive: "#ffd27d", emissiveIntensity: 0.9, opacity: 0.68 });
  const nodes: AuraNodeInput[] = [
    primitives.box({
      name: "semantic data explorer base plane",
      material: material.glass({ color: "#081416", opacity: 0.16, roughness: 0.14 })
    }).position(0, 0.045, 0.08).scale([1.36, 0.016, 0.82]),
    primitives.box({
      name: "revenue x axis rail",
      material: revenueMaterial
    }).position(0, 0.1, 0.54).scale([0.32, 0.008, 0.01]),
    primitives.box({
      name: "risk y axis rail",
      material: riskMaterial
    }).position(-0.72, 0.42, 0.08).scale([0.012, 0.32, 0.014]),
    primitives.box({
      name: "retention z axis rail",
      material: retentionMaterial
    }).position(-0.54, 0.1, 0.04).rotate(0, 0.84, 0).scale([0.52, 0.01, 0.014]),
    primitives.box({
      name: "selected KPI crosshair horizontal",
      material: axisMaterial
    }).position(0.22, 0.86, 0.02).scale([0.28, 0.009, 0.012]),
    primitives.box({
      name: "selected KPI crosshair vertical",
      material: axisMaterial
    }).position(0.22, 0.86, 0.02).rotate(0, 0, 1.5708).scale([0.2, 0.009, 0.012]),
    primitives.sphere({
      name: "selected KPI beacon conversion lift",
      material: material.neon({ color: "#ffffff", emissive: "#64f4cf", emissiveIntensity: 1.4 })
    }).position(0.22, 0.86, 0.02).scale(0.052).runtime(game.runtimeNode("data-galaxy-selected-kpi")),
    labels.anchor("Revenue", "revenue x axis rail", {
      name: "data explorer revenue axis label",
      position: [1.25, 0.18, 1.02],
      size: 0.11,
      color: "#d9fff4"
    }),
    labels.anchor("Risk", "risk y axis rail", {
      name: "data explorer risk axis label",
      position: [-1.18, 1.02, 0.18],
      size: 0.11,
      color: "#ffdce6"
    }),
    labels.anchor("Retention", "retention z axis rail", {
      name: "data explorer retention axis label",
      position: [-1.2, 0.22, -0.46],
      size: 0.11,
      color: "#fff0bf"
    })
  ];

  const clusters = [
    { name: "Growth", position: [0.72, 0.62, 0.52] as const, color: "#64f4cf", scale: 0.075 },
    { name: "Risk", position: [-0.62, 0.72, -0.12] as const, color: "#ff8ba7", scale: 0.065 },
    { name: "Expansion", position: [0.08, 0.84, -0.46] as const, color: "#ffd27d", scale: 0.07 },
    { name: "Self Serve", position: [-0.28, 0.44, 0.66] as const, color: "#a3e635", scale: 0.06 }
  ];

  for (const cluster of clusters) {
    nodes.push(
      primitives.sphere({
        name: `segment cluster ${cluster.name}`,
        material: material.neon({ color: cluster.color, emissive: cluster.color, emissiveIntensity: 0.92, opacity: 0.82 })
      }).position(cluster.position[0], cluster.position[1], cluster.position[2]).scale(cluster.scale),
      primitives.torus({
        name: `segment cluster ring ${cluster.name}`,
        material: material.neon({ color: cluster.color, emissive: cluster.color, emissiveIntensity: 0.34, opacity: 0.28 })
      }).position(cluster.position[0], cluster.position[1], cluster.position[2]).rotate(1.5708, 0, 0).scale([cluster.scale * 4.2, cluster.scale * 4.2, 0.012]),
      labels.anchor(cluster.name, `segment cluster ${cluster.name}`, {
        name: `segment cluster label ${cluster.name}`,
        position: [cluster.position[0] + 0.06, cluster.position[1] + 0.16, cluster.position[2]],
        size: 0.1,
        color: "#f7fbff"
      })
    );
  }

  return nodes;
}

function streamBeam(name: string, position: readonly [number, number, number], scale: readonly [number, number, number], yaw: number, color: string): AuraNodeInput {
  return primitives.box({
    name,
    material: material.neon({ color, emissive: color, emissiveIntensity: 1.08, opacity: 0.54 })
  }).position(position[0], position[1], position[2]).rotate(0, yaw, 0).scale([scale[0], scale[1], scale[2]]);
}

function dataGalaxyCamera(mode: DataGalaxyCameraMode): AuraCameraSpec {
  if (mode === "focus") {
    return camera.perspective({ position: [1.34, 1.14, 3.88], target: [0, 0.48, -0.18], fov: 32 });
  }
  if (mode === "orbital") {
    return camera.orbit({ target: [0, 0.48, -0.18], distance: 4.9, fov: 34 });
  }
  if (mode === "flythrough") {
    return camera.flythrough({
      from: [1.68, 1.44, 4.52],
      to: [-0.86, 1.08, 3.28],
      target: [0, 0.48, -0.18],
      seconds: 9,
      captureTime: 0.45,
      fov: 34
    });
  }
  return camera.perspective({ position: [0.08, 1.22, 4.65], target: [0, 0.5, -0.2], fov: 32 });
}

function createDataset(formation: DataGalaxyFormation): number[][] {
  const phaseByFormation: Record<DataGalaxyFormation, number> = {
    galaxy: 0.18,
    sphere: 0.42,
    vortex: 0.68,
    network: 0.86,
    wave: 1.12
  };
  const phase = phaseByFormation[formation];
  return Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 }, (_, col) => {
      const radial = Math.hypot(row - 1.5, col - 1.5) / 2.6;
      const ridge = Math.sin((row + 1) * phase + col * 0.58) * 0.035;
      const signal = 0.18 + (1 - radial) * 0.42 + ridge * 1.8 + ((row * col + col) % 4) * 0.024;
      return Number(Math.max(0.16, Math.min(0.72, signal)).toFixed(3));
    })
  );
}

function effectiveParticleCount(): number {
  const multiplier: Record<DataGalaxyPerformanceTier, number> = {
    balanced: 1,
    dense: 1.35,
    cinematic: 0.55
  };
  return Math.round(controls.particleCount * multiplier[controls.performance]);
}

function bindControls(): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-formation]"))) {
    button.addEventListener("click", () => {
      const next = button.dataset.formation;
      if (!isFormation(next)) return;
      controls.formation = next;
      applyScene(`formation:${next}`);
    });
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-camera]"))) {
    button.addEventListener("click", () => {
      const next = button.dataset.camera;
      if (!isCameraMode(next)) return;
      controls.cameraMode = next;
      applyScene(`camera:${next}`);
    });
  }

  const countInput = ui.slider("#dg-count", { min: 80, max: 600, value: controls.particleCount, metric: "data-galaxy-particles" });
  countInput.addEventListener("input", () => {
    controls.particleCount = Number(countInput.value);
    applyScene("particle-count");
  });

  const speedInput = ui.slider("#dg-speed", { min: 0.4, max: 2.4, value: controls.speed, metric: "data-galaxy-speed" });
  speedInput.addEventListener("input", () => {
    controls.speed = Number(speedInput.value);
    applyScene("flow-speed");
  });

  const performanceSelect = element<HTMLSelectElement>("#dg-performance");
  performanceSelect.addEventListener("change", () => {
    if (!isPerformanceTier(performanceSelect.value)) return;
    controls.performance = performanceSelect.value;
    applyScene(`performance:${performanceSelect.value}`);
  });

  const connectionsInput = element<HTMLInputElement>("#dg-connections");
  connectionsInput.addEventListener("change", () => {
    controls.connections = connectionsInput.checked;
    applyScene(controls.connections ? "connections:on" : "connections:off");
  });
}

function applyScene(change: string): void {
  lastChanged = change;
  activeBuild = buildDataGalaxyScene();
  app?.setScene(activeBuild.snapshot);
  updateControlState();
  publishEvidence("ready");
}

function updateControlState(): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-formation]"))) {
    button.setAttribute("aria-pressed", String(button.dataset.formation === controls.formation));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-camera]"))) {
    button.setAttribute("aria-pressed", String(button.dataset.camera === controls.cameraMode));
  }
  ui.setText("#dg-count-value", controls.particleCount.toLocaleString("en-US"));
  ui.setText("#dg-speed-value", `${controls.speed.toFixed(2)}x`);
  element<HTMLSelectElement>("#dg-performance").value = controls.performance;
  element<HTMLInputElement>("#dg-connections").checked = controls.connections;
}

function publishEvidence(status: ShowcaseStatus): void {
  const frameCount = app?.runtime.frame ?? 0;
  const runtimeNodeIds = app?.nodes.ids() ?? (activeBuild.diagnostics.runtimeNodeIds as readonly string[] | undefined) ?? [];
  const appDiagnostics = app?.diagnostics();
  const evidence: DataGalaxyEvidence = {
    status,
    appId: APP_ID,
    frameCount,
    interactionState: {
      lastChanged,
      runtimeNodeIds,
      cameraMode: controls.cameraMode
    },
    telemetry: {
      frameCount,
      formation: controls.formation,
      cameraMode: controls.cameraMode,
      requestedParticles: controls.particleCount,
      effectiveParticles: effectiveParticleCount(),
      speed: controls.speed,
      nodeCount: activeBuild.snapshot.nodes.length,
      labelCount: activeBuild.snapshot.nodes.filter((node) => node.kind === "label").length,
      effectCount: activeBuild.snapshot.nodes.filter((node) => node.kind === "effect").length,
      connections: controls.connections
    },
    controls: { ...controls },
    systems: activeBuild.systems,
    assets: [
      {
        typedRef: "assets.showcaseParticleCore",
        id: "showcaseParticleCore",
        url: dataCoreAsset.url,
        license: dataCoreAsset.metadata.provenance.license,
        author: dataCoreAsset.metadata.provenance.author
      }
    ],
    claimBoundary: "Aura3D public API diagnostic route using the compiler-selected CLI-resolved typed data-reactor anchor, sceneKits.dataViz, charts QA, particle effects, labels, interactions, and runtime node evidence. It does not claim native GPU-compute particle simulation or public flagship readiness.",
    diagnostics: {
      ...activeBuild.diagnostics,
      ...(appDiagnostics ? {
        backend: appDiagnostics.backend,
        drawCalls: appDiagnostics.drawCalls,
        fps: appDiagnostics.fps,
        renderSize: appDiagnostics.renderSize,
        warnings: appDiagnostics.warnings,
        errors: appDiagnostics.errors
      } : {})
    },
    updatedAt: new Date().toISOString()
  };
  window.__AURA3D_SHOWCASE_DATA_GALAXY__ = evidence;
  ui.setText("#dg-frame", frameCount);
  ui.setText("#dg-nodes", activeBuild.snapshot.nodes.length);
  ui.setText("#dg-labels", activeBuild.snapshot.nodes.filter((node) => node.kind === "label").length);
  ui.setText("#dg-status", status);
}

function element<T extends HTMLElement>(selector: string): T {
  const target = document.querySelector<T>(selector);
  if (!target) {
    throw new Error(`Missing Data Galaxy control: ${selector}`);
  }
  return target;
}

function isFormation(value: string | undefined): value is DataGalaxyFormation {
  return FORMATIONS.includes(value as DataGalaxyFormation);
}

function isCameraMode(value: string | undefined): value is DataGalaxyCameraMode {
  return CAMERA_MODES.includes(value as DataGalaxyCameraMode);
}

function isPerformanceTier(value: string): value is DataGalaxyPerformanceTier {
  return PERFORMANCE_TIERS.includes(value as DataGalaxyPerformanceTier);
}
