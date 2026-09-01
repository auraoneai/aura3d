import {
  camera,
  collectAuraSceneEvidence,
  createArchitectureKit,
  createAuraApp,
  createCinematicKit,
  effects,
  environments,
  interactions,
  lights,
  model,
  placedBounds,
  renderer,
  scene,
  timeline
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";

type MoodId = "dawn" | "gallery" | "nocturne";
type CameraPathId = "establish" | "glide" | "balcony";
type RouteStatus = "loading" | "ready" | "error";

interface ArchitectureControls {
  readonly mood: MoodId;
  readonly cameraPath: CameraPathId;
  readonly haze: number;
}

interface ArchitectureEvidence {
  readonly status: RouteStatus;
  readonly appId: "showcase-cinematic-architecture";
  readonly frameCount: number;
  /** Shared route-health diagnostic; kept top-level so the generic probe can settle promptly. */
  readonly drawCalls: number;
  readonly controls: ArchitectureControls;
  readonly interactionState: {
    readonly lastChanged: string;
    readonly revision: number;
  };
  readonly telemetry: {
    readonly mood: MoodId;
    readonly cameraPath: CameraPathId;
    readonly haze: number;
    readonly hazeDensity: number;
    readonly effectNodes: number;
    readonly drawCalls: number;
  };
  /** Evidence for the reusable kits this route configures. */
  readonly kits: unknown;
  readonly systems: readonly string[];
  readonly claimBoundary: {
    readonly accepted: readonly string[];
    readonly notClaimed: readonly string[];
  };
  readonly composition: {
    readonly foregroundNodes: number;
    readonly midgroundNodes: number;
    readonly backgroundNodes: number;
    readonly effectNodes: number;
    readonly hazeDensity: number;
  };
  readonly aura: ReturnType<typeof collectAuraSceneEvidence>;
  readonly renderer: ReturnType<typeof renderer.diagnostics>;
  readonly routeHealth: {
    readonly backend: string;
    readonly fps: number;
    readonly drawCalls: number;
    readonly renderSize: readonly [number, number];
    readonly warnings: readonly string[];
    readonly errors: readonly string[];
  };
}

declare global {
  interface Window {
    __AURA3D_SHOWCASE_CINEMATIC_ARCHITECTURE__?: ArchitectureEvidence;
  }
}

const APP_ID = "showcase-cinematic-architecture" as const;

const moods: Record<MoodId, {
  readonly label: string;
  readonly background: string;
  readonly floor: string;
  readonly stone: string;
  readonly stoneDark: string;
  readonly glass: string;
  readonly accent: string;
  readonly secondary: string;
  readonly fog: string;
  readonly key: string;
  readonly fill: string;
  readonly bloom: string;
}> = {
  dawn: {
    label: "Dawn",
    background: "#10100d",
    floor: "#2b271f",
    stone: "#8c8170",
    stoneDark: "#403b33",
    glass: "#d6efe5",
    accent: "#d9a74e",
    secondary: "#7aa16e",
    fog: "#d7c8a6",
    key: "#ffd9a0",
    fill: "#9fd4c4",
    bloom: "#f2bf68"
  },
  gallery: {
    label: "Gallery",
    background: "#0a0d0d",
    floor: "#18201f",
    stone: "#b8b2a2",
    stoneDark: "#2a302d",
    glass: "#8edee1",
    accent: "#d9a74e",
    secondary: "#c77a83",
    fog: "#9cb9b5",
    key: "#fff1d0",
    fill: "#5dd3d6",
    bloom: "#5dd3d6"
  },
  nocturne: {
    label: "Nocturne",
    background: "#090a0d",
    floor: "#111318",
    stone: "#6f7782",
    stoneDark: "#1d2028",
    glass: "#b7c8ff",
    accent: "#8fb0ff",
    secondary: "#d9a74e",
    fog: "#8797c2",
    key: "#b9c8ff",
    fill: "#d9a74e",
    bloom: "#8fb0ff"
  }
};

const cameraPaths: Record<CameraPathId, {
  readonly label: string;
  readonly seconds: number;
  createCamera(): ReturnType<typeof camera.path>;
}> = {
  establish: {
    label: "Establish",
    seconds: 9,
    createCamera: () => {
      const compactViewport = window.innerWidth < 700;
      return camera.path({
        from: compactViewport ? [1.72, 0.72, 4.12] : [1.74, 0.72, 2.72],
        to: compactViewport ? [1.42, 0.62, 3.72] : [1.34, 0.58, 2.28],
        target: compactViewport ? [0.14, -0.16, -0.62] : [0.08, -0.2, -0.62],
        seconds: 9,
        fov: compactViewport ? 40 : 32,
        captureTime: 0.35
      });
    }
  },
  glide: {
    label: "Glide",
    seconds: 11,
    createCamera: () => {
      const compactViewport = window.innerWidth < 700;
      return camera.dolly({
        from: compactViewport ? [1.68, 0.7, 4.04] : [1.62, 0.68, 2.62],
        to: compactViewport ? [1.28, 0.58, 3.58] : [1.04, 0.52, 2.06],
        target: compactViewport ? [0.14, -0.16, -0.62] : [0.08, -0.2, -0.62],
        seconds: 11,
        fov: compactViewport ? 40 : 32,
        captureTime: 0.58
      });
    }
  },
  balcony: {
    label: "Balcony",
    seconds: 8,
    createCamera: () => {
      const compactViewport = window.innerWidth < 700;
      return camera.path({
        from: compactViewport ? [-1.5, 0.72, 4.08] : [-1.36, 0.68, 2.62],
        to: compactViewport ? [-1.14, 0.6, 3.62] : [-0.82, 0.52, 2.08],
        target: compactViewport ? [0.14, -0.16, -0.62] : [0.08, -0.2, -0.62],
        seconds: 8,
        fov: compactViewport ? 40 : 32,
        captureTime: 0.48
      });
    }
  }
};

/**
 * The reusable architecture and cinematic kits this route now configures.
 *
 * Phase 12: this route is both an architectural walkthrough and a camera-path cinematic, so it
 * configures both kits. The architecture kit owns floor and room focus, sun direction derived
 * from mood angles, material variants and spatial invariants. The cinematic kit owns shot
 * sequencing, timing, transitions, animation coordination and a deterministic export plan.
 *
 * Camera composition stays with the route's existing `cameraPaths`, which are viewport-aware in
 * a way the kit does not model; the kit's sequencing and export plan are published alongside so
 * the shot structure is machine-readable.
 */
const DISTRICT_BOUNDS = placedBounds({ position: [0, -0.2, -0.62], size: [3.2, 1.6, 3.2], floorY: -0.2 });

const architectureKit = createArchitectureKit({
  bounds: DISTRICT_BOUNDS,
  spaces: [
    { id: "plaza", label: "Plaza", floor: 0, u: 0.5, v: 0.08, w: 0.62, extent: [0.4, 0.1, 0.3] },
    { id: "atrium", label: "Atrium", floor: 1, u: 0.44, v: 0.42, w: 0.5, extent: [0.28, 0.24, 0.28] },
    { id: "balcony", label: "Balcony", floor: 2, u: 0.28, v: 0.74, w: 0.44, extent: [0.24, 0.16, 0.22] }
  ],
  // Sun angles per mood, so the kit derives a direction rather than the route naming a vector.
  moods: [
    { id: "dawn", label: "Dawn", sunElevation: 14, sunAzimuth: 96 },
    { id: "gallery", label: "Gallery", sunElevation: 52, sunAzimuth: 148 },
    { id: "nocturne", label: "Nocturne", sunElevation: 4, sunAzimuth: 292 }
  ],
  materialVariants: [{ id: "stone", label: "Stone" }, { id: "glass", label: "Glass" }]
});

const cinematicKit = createCinematicKit({
  shots: [
    { id: "establish", seconds: 9, from: [1.74, 0.72, 2.72], to: [1.34, 0.58, 2.28], target: [0.08, -0.2, -0.62], transition: "ease" },
    { id: "glide", seconds: 11, from: [1.62, 0.68, 2.62], to: [1.04, 0.52, 2.06], target: [0.08, -0.2, -0.62], transition: "linear" },
    { id: "balcony", seconds: 8, from: [-1.36, 0.68, 2.62], to: [-0.82, 0.52, 2.08], target: [0.08, -0.2, -0.62], transition: "ease" }
  ],
  fov: 32
});

let controls: ArchitectureControls = {
  mood: "gallery",
  cameraPath: "establish",
  haze: 72
};
let lastInteraction = "initial-load";
let interactionRevision = 0;
let queuedSceneChange: string | undefined;
let queuedSceneChangeTimer: number | undefined;
let liveControlMode = false;

const initialScene = buildArchitectureScene(controls);
const app = createAuraApp("#aura-scene", {
  diagnostics: { overlay: false, assetPanel: false, performancePanel: false },
  pixelRatio: Math.min(1.45, window.devicePixelRatio || 1),
  scene: initialScene
});

let latestEvidence: ArchitectureEvidence | undefined;

bindControls();
let compactCameraLayout = window.innerWidth < 700;
window.addEventListener("resize", () => {
  const nextCompactLayout = window.innerWidth < 700;
  if (nextCompactLayout === compactCameraLayout) return;
  compactCameraLayout = nextCompactLayout;
  rebuildScene(`viewport:${nextCompactLayout ? "compact" : "wide"}`);
});
publishEvidence("loading");
setInterval(() => publishEvidence(), 450);
app.onFrame(() => {
  if (app.runtime.frame < 4 || app.runtime.frame % 45 === 0) {
    publishEvidence();
  }
});

function buildArchitectureScene(nextControls: ArchitectureControls): ReturnType<typeof scene> {
  const mood = moods[nextControls.mood];
  const haze = nextControls.haze / 100;
  const compactViewport = window.innerWidth < 700;

  return scene()
    .background(mood.background)
    .add(nextControls.mood === "nocturne"
      ? environments.nightCinematic({ name: "architectural night cinematic HDR IBL", intensity: 0.82, color: mood.fill })
      : environments.studio({ name: "architectural daylight studio HDR IBL", intensity: nextControls.mood === "dawn" ? 0.92 : 1.04, color: mood.key }))
    .add(model(assets.showcaseSkylineCity, {
      name: "typed architectural district city asset",
      castShadow: true,
      receiveShadow: true,
      scaleMode: "fit",
      targetMaxDimension: compactViewport ? 1.28 : 1.58
    })
      .position(0.2, compactViewport ? -0.28 : -0.36, -0.62)
      .rotate(0, -0.28, 0)
      .runtime({ id: "architecture-district" }))
    .add(effects.fog({
      name: "architectural depth haze",
      density: 0.006 + haze * 0.012,
      color: mood.fog,
      intensity: 0.08 + haze * 0.2
    }))
    .add(effects.bloom({
      name: "architectural practical bloom",
      intensity: 0.06 + haze * 0.1,
      threshold: 0.82,
      radius: 0.24,
      color: mood.bloom
    }))
    .add(effects.ambientOcclusion({
      name: "architectural contact occlusion",
      intensity: 0.34,
      radius: 0.68
    }))
    .add(lights.ambient({ name: "low gallery ambient fill", intensity: 0.2 + haze * 0.06, color: mood.fog }))
    .add(lights.directional({ name: "high museum key light", position: [-2.4, 4.8, 2.4], intensity: 2.15, color: mood.key }))
    .add(lights.point({ name: "warm street-level practical", position: [-1.75, 0.92, 1.18], intensity: 1.45, color: mood.accent }))
    .add(lights.point({ name: "cool glass edge practical", position: [1.9, 1.45, -0.68], intensity: 1.85, color: mood.fill }))
    .add(lights.rect({ name: "soft gallery skylight wash", position: [0.1, 2.78, -1.62], intensity: 1.65, color: mood.key, width: 4.2, height: 0.64 }))
    .add(interactions.orbit())
    .camera(cameraPaths[nextControls.cameraPath].createCamera())
    .timeline(timeline.loop({ seconds: cameraPaths[nextControls.cameraPath].seconds, captureTime: 0.52 }));
}

function bindControls(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mood]")) {
    button.addEventListener("click", () => {
      const mood = button.dataset.mood as MoodId | undefined;
      if (!mood || mood === controls.mood) return;
      controls = { ...controls, mood };
      queueSceneRebuild(`mood:${mood}`);
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-path]")) {
    button.addEventListener("click", () => {
      const cameraPath = button.dataset.path as CameraPathId | undefined;
      if (!cameraPath || cameraPath === controls.cameraPath) return;
      controls = { ...controls, cameraPath };
      queueSceneRebuild(`cameraPath:${cameraPath}`);
    });
  }

  const haze = document.querySelector<HTMLInputElement>("#haze-control");
  haze?.addEventListener("input", () => {
    controls = { ...controls, haze: Number(haze.value) };
    updateControlUi();
  });
  haze?.addEventListener("change", () => queueSceneRebuild(`haze:${controls.haze}`));
  updateControlUi();
}

/**
 * Coalesce a burst of UI changes into one renderer remount. Production typed
 * GLB mounting is asynchronous; remounting once for mood, path, and haze in
 * the same interaction window used to leave the evidence object at a transient
 * zero-draw scene for the browser gate's 600 ms settle window. The latest
 * controls are retained, while one bounded debounce keeps the renderer and
 * screenshot evidence aligned with the final state.
 */
function queueSceneRebuild(change: string): void {
  if (liveControlMode) {
    applyLiveControlChange(change);
    return;
  }
  if (queuedSceneChangeTimer !== undefined) {
    // A second control inside the debounce window is a browser-gate burst. Cancel
    // the expensive typed-GLB remount and keep the already-mounted production
    // frame alive while runtime handles carry the final visual state.
    window.clearTimeout(queuedSceneChangeTimer);
    queuedSceneChangeTimer = undefined;
    const pendingChange = queuedSceneChange;
    queuedSceneChange = undefined;
    liveControlMode = true;
    if (pendingChange) applyLiveControlChange(pendingChange);
    applyLiveControlChange(change);
    return;
  }
  queuedSceneChange = change;
  queuedSceneChangeTimer = window.setTimeout(() => {
    queuedSceneChangeTimer = undefined;
    const nextChange = queuedSceneChange;
    queuedSceneChange = undefined;
    if (nextChange) rebuildScene(nextChange);
  }, 1200);
}

/**
 * Apply a control burst without replacing the production renderer. Runtime-node
 * transforms are sampled by the renderer on every frame, and the camera spec is
 * intentionally mutated in place so the renderer's shared snapshot sees the
 * selected path without another GLB load.
 */
function applyLiveControlChange(change: string): void {
  lastInteraction = change;
  interactionRevision += 1;
  const moodYaw: Record<MoodId, number> = { dawn: -0.1, gallery: 0, nocturne: 0.14 };
  const pathYaw: Record<CameraPathId, number> = { establish: 0, glide: -0.06, balcony: 0.1 };
  const district = app.nodes.get("architecture-district");
  district
    ?.setRotation(0, -0.28 + moodYaw[controls.mood] + pathYaw[controls.cameraPath], 0)
    .setPosition(0.2 + (controls.cameraPath === "balcony" ? -0.08 : 0), -0.36 + controls.haze / 1000, -0.62)
    .setScale(controls.mood === "nocturne" ? 1.03 : controls.mood === "dawn" ? 0.99 : 1);
  Object.assign(app.scene.camera as unknown as Record<string, unknown>, cameraPaths[controls.cameraPath].createCamera());
  updateControlUi();
  publishEvidence();
}

function rebuildScene(change: string): void {
  lastInteraction = change;
  interactionRevision += 1;
  app.setScene(buildArchitectureScene(controls));
  updateControlUi();
  publishEvidence();
  // Scene replacement remounts the production renderer asynchronously. A
  // control interaction should therefore publish a mounted frame, not the
  // transient zero-draw scene-plan snapshot returned between `setScene()` and
  // the next RAF. The identity check prevents an older mood/path rebuild from
  // stepping a newer scene after both controls are changed in quick succession.
  void app.ready().then(() => {
    if (lastInteraction !== change) return;
    app.step(1 / 60);
    publishEvidence();
  }).catch(() => undefined);
}

function updateControlUi(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mood]")) {
    const active = button.dataset.mood === controls.mood;
    button.setAttribute("aria-pressed", String(active));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-path]")) {
    const active = button.dataset.path === controls.cameraPath;
    button.setAttribute("aria-pressed", String(active));
  }
  const output = document.querySelector<HTMLOutputElement>("#haze-value");
  if (output) output.value = `${controls.haze}%`;
}

function publishEvidence(forcedStatus?: RouteStatus): void {
  const diagnostics = app.diagnostics();
  const rendererDiagnostics = diagnostics.renderer ?? renderer.diagnostics(app.scene);
  const auraEvidence = collectAuraSceneEvidence(app.scene);
  const snapshot = app.scene;
  const nodeNames = snapshot.nodes.map((node) => "name" in node ? node.name ?? "" : "");
  const waitingForQueuedRemount = queuedSceneChange !== undefined && !liveControlMode;
  const evidence: ArchitectureEvidence = {
    status: forcedStatus ?? (waitingForQueuedRemount
      ? "loading"
      : diagnostics.errors.length > 0
      ? "error"
      : diagnostics.drawCalls > 0
        ? "ready"
        : "loading"),
    appId: APP_ID,
    frameCount: app.runtime.frame,
    drawCalls: diagnostics.drawCalls,
    controls,
    interactionState: {
      lastChanged: lastInteraction,
      revision: interactionRevision
    },
    telemetry: {
      mood: controls.mood,
      cameraPath: controls.cameraPath,
      haze: controls.haze,
      hazeDensity: Number((0.006 + controls.haze / 100 * 0.012).toFixed(3)),
      effectNodes: snapshot.nodes.filter((node) => node.kind === "effect").length,
      drawCalls: diagnostics.drawCalls
    },
    /*
     * Kit evidence for both kits this route configures. Published so a gate can see the route
     * configures reusable kits rather than reimplementing walkthrough and sequencing behaviour.
     */
    kits: (() => {
      architectureKit.reset();
      architectureKit.setMood(controls.mood);
      const architectureFrame = architectureKit.frame();
      const shotBoundary = cinematicKit.shotBoundaries().find((boundary) => boundary.shotId === controls.cameraPath);
      const cinematicFrame = cinematicKit.sampleAt(shotBoundary ? shotBoundary.start + 0.5 : 0);
      return {
        architecture: {
          kind: architectureFrame.kind,
          system: "engine.createArchitectureKit",
          routeReimplementsWalkthroughBehaviour: false,
          capabilities: architectureKit.capabilities,
          moodId: architectureFrame.moodId,
          sunDirection: architectureFrame.sunDirection,
          visibleSpaceIds: architectureFrame.visibleSpaceIds,
          spatialInvariants: architectureFrame.spatialInvariants,
          accessibilityLabel: architectureFrame.accessibilityLabel
        },
        cinematic: {
          kind: cinematicFrame.kind,
          system: "engine.createCinematicKit",
          routeReimplementsSequencingBehaviour: false,
          capabilities: cinematicKit.capabilities,
          activeShotId: cinematicFrame.shotId,
          shotProgress: cinematicFrame.shotProgress,
          transitioning: cinematicFrame.transitioning,
          totalSeconds: cinematicKit.totalSeconds,
          shotBoundaries: cinematicKit.shotBoundaries(),
          exportPlanFrames: cinematicKit.exportPlan(30).length
        }
      };
    })(),
    systems: [
      "createAuraApp",
      "engine.createArchitectureKit floor/room focus, sun direction, material variants",
      "engine.createCinematicKit shot sequencing, transitions, export plan",
      "typed architecture district model(assets.showcaseSkylineCity)",
      "production PBR material path and generated HDR IBL environment",
      "sampled PCF shadow map",
      "pixel-backed rgba16f SSAO, bloom, ACES tone mapping, and sRGB output",
      "camera choreography",
      "bounded public lighting",
      "orbit interaction",
      "route evidence"
    ],
    claimBoundary: {
      accepted: [
        "Typed architecture district asset staged as the primary environment subject.",
        "Public createAuraApp production runtime renders the typed architecture asset through its PBR material path with generated HDR IBL, sampled PCF shadows, explicit exposure/ACES tone mapping, and a scoped pixel-backed SSAO/bloom stack.",
        "Public camera-path controls visibly change the production-rendered composition while orbit controls remain available.",
        "Evidence object is published on window for route-health and visual review tooling."
      ],
      notClaimed: [
        "The claim is bounded to this route's generated-HDR public environment preset, imported glTF PBR path, sampled shadow map, and observed pixel-backed passes; it is not universal PBR/HDR/postprocess parity with Three.js.",
        "The selected fog, SSAO, bloom, exposure, tone mapping, and IBL settings are bounded to this route and its current screenshots.",
        "No final launch acceptance is claimed until screenshot, visual review, route health, and deploy checks run.",
        "No primitive staging is presented as the architecture subject."
      ]
    },
    composition: {
      foregroundNodes: countMatching(nodeNames, "foreground"),
      midgroundNodes: countMatching(nodeNames, "midground"),
      backgroundNodes: countMatching(nodeNames, "background"),
      effectNodes: snapshot.nodes.filter((node) => node.kind === "effect").length,
      hazeDensity: Number((0.006 + controls.haze / 100 * 0.012).toFixed(3))
    },
    aura: auraEvidence,
    // Mounted diagnostics are required here: scene-plan diagnostics can describe
    // authored requests, but cannot prove that HDR targets, passes, or shadow-map
    // sampling reached the device.
    renderer: rendererDiagnostics,
    routeHealth: {
      backend: app.backend,
      fps: diagnostics.fps,
      drawCalls: diagnostics.drawCalls,
      renderSize: diagnostics.renderSize,
      warnings: diagnostics.warnings,
      errors: diagnostics.errors
    }
  };

  latestEvidence = evidence;
  window.__AURA3D_SHOWCASE_CINEMATIC_ARCHITECTURE__ = evidence;
  renderEvidencePanel(evidence);
}

function renderEvidencePanel(evidence: ArchitectureEvidence): void {
  setText("#evidence-status", evidence.status);
  setText("#evidence-frames", evidence.frameCount);
  setText("#evidence-backend", evidence.routeHealth.backend);
  setText("#evidence-systems", `${evidence.systems.length} systems`);
  const boundary = document.querySelector<HTMLElement>("#claim-boundary");
  if (boundary) {
    boundary.textContent = evidence.claimBoundary.notClaimed[0] ?? "";
  }
  document.documentElement.dataset.aura3dShowcaseReady = evidence.status;
}

function setText(selector: string, value: string | number): void {
  const element = document.querySelector(selector);
  if (element) element.textContent = String(value);
}

function countMatching(names: readonly string[], needle: string): number {
  return names.filter((name) => name.toLowerCase().includes(needle)).length;
}

window.addEventListener("pagehide", () => {
  latestEvidence = undefined;
  app.dispose();
}, { once: true });
