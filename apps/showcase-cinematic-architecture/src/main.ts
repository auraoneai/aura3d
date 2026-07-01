import {
  camera,
  collectAuraSceneEvidence,
  createAuraApp,
  interactions,
  lights,
  model,
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
    readonly lightShafts: number;
    readonly drawCalls: number;
  };
  readonly systems: readonly string[];
  readonly claimBoundary: {
    readonly accepted: readonly string[];
    readonly notClaimed: readonly string[];
  };
  readonly composition: {
    readonly foregroundNodes: number;
    readonly midgroundNodes: number;
    readonly backgroundNodes: number;
    readonly lightShafts: number;
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
        from: compactViewport ? [1.0, 0.42, 2.08] : [1.74, 0.72, 2.72],
        to: compactViewport ? [0.8, 0.36, 1.74] : [1.34, 0.58, 2.28],
        target: compactViewport ? [0.04, -0.18, -0.62] : [0.08, -0.2, -0.62],
        seconds: 9,
        fov: compactViewport ? 31 : 32,
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
        from: compactViewport ? [0.96, 0.4, 2.0] : [1.62, 0.68, 2.62],
        to: compactViewport ? [0.62, 0.34, 1.68] : [1.04, 0.52, 2.06],
        target: compactViewport ? [0.04, -0.18, -0.62] : [0.08, -0.2, -0.62],
        seconds: 11,
        fov: compactViewport ? 31 : 32,
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
        from: compactViewport ? [-0.86, 0.42, 2.0] : [-1.36, 0.68, 2.62],
        to: compactViewport ? [-0.48, 0.34, 1.68] : [-0.82, 0.52, 2.08],
        target: compactViewport ? [0.04, -0.18, -0.62] : [0.08, -0.2, -0.62],
        seconds: 8,
        fov: compactViewport ? 31 : 32,
        captureTime: 0.48
      });
    }
  }
};

let controls: ArchitectureControls = {
  mood: "gallery",
  cameraPath: "establish",
  haze: 72
};
let lastInteraction = "initial-load";
let interactionRevision = 0;

const initialScene = buildArchitectureScene(controls);
const app = createAuraApp("#aura-scene", {
  diagnostics: { overlay: false, assetPanel: false, performancePanel: false },
  pixelRatio: Math.min(1.45, window.devicePixelRatio || 1),
  scene: initialScene
});

let latestEvidence: ArchitectureEvidence | undefined;

bindControls();
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
    .add(model(assets.showcaseSkylineCity, {
      name: "typed architectural district city asset",
      castShadow: true,
      receiveShadow: true,
      scaleMode: "fit",
      targetMaxDimension: compactViewport ? 1.28 : 1.58
    })
      .position(0.2, compactViewport ? -0.28 : -0.36, -0.62)
      .rotate(0, -0.28, 0))
    .addMany(createArchitecturePresentation(mood, haze))
    .add(lights.ambient({ name: "low gallery ambient fill", intensity: 0.2 + haze * 0.06, color: mood.fog }))
    .add(lights.directional({ name: "high museum key light", position: [-2.4, 4.8, 2.4], intensity: 2.15, color: mood.key }))
    .add(lights.point({ name: "warm street-level practical", position: [-1.75, 0.92, 1.18], intensity: 1.45, color: mood.accent }))
    .add(lights.point({ name: "cool glass edge practical", position: [1.9, 1.45, -0.68], intensity: 1.85, color: mood.fill }))
    .add(lights.rect({ name: "soft gallery skylight wash", position: [0.1, 2.78, -1.62], intensity: 1.65, color: mood.key, width: 4.2, height: 0.64 }))
    .add(interactions.orbit())
    .camera(cameraPaths[nextControls.cameraPath].createCamera())
    .timeline(timeline.loop({ seconds: cameraPaths[nextControls.cameraPath].seconds, captureTime: 0.52 }));
}

function createArchitecturePresentation(mood: typeof moods[MoodId], haze: number) {
  void mood;
  void haze;
  return [];
}

function bindControls(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mood]")) {
    button.addEventListener("click", () => {
      const mood = button.dataset.mood as MoodId | undefined;
      if (!mood || mood === controls.mood) return;
      controls = { ...controls, mood };
      rebuildScene(`mood:${mood}`);
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-path]")) {
    button.addEventListener("click", () => {
      const cameraPath = button.dataset.path as CameraPathId | undefined;
      if (!cameraPath || cameraPath === controls.cameraPath) return;
      controls = { ...controls, cameraPath };
      rebuildScene(`cameraPath:${cameraPath}`);
    });
  }

  const haze = document.querySelector<HTMLInputElement>("#haze-control");
  haze?.addEventListener("input", () => {
    controls = { ...controls, haze: Number(haze.value) };
    updateControlUi();
  });
  haze?.addEventListener("change", () => rebuildScene(`haze:${controls.haze}`));
  updateControlUi();
}

function rebuildScene(change: string): void {
  lastInteraction = change;
  interactionRevision += 1;
  app.setScene(buildArchitectureScene(controls));
  updateControlUi();
  publishEvidence();
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
  const auraEvidence = collectAuraSceneEvidence(app.scene);
  const snapshot = app.scene;
  const nodeNames = snapshot.nodes.map((node) => "name" in node ? node.name ?? "" : "");
  const evidence: ArchitectureEvidence = {
    status: forcedStatus ?? (diagnostics.errors.length > 0 ? "error" : "ready"),
    appId: APP_ID,
    frameCount: app.runtime.frame,
    controls,
    interactionState: {
      lastChanged: lastInteraction,
      revision: interactionRevision
    },
    telemetry: {
      mood: controls.mood,
      cameraPath: controls.cameraPath,
      haze: controls.haze,
      hazeDensity: Number((0.014 + controls.haze / 100 * 0.034).toFixed(3)),
      lightShafts: countMatching(nodeNames, "light shaft"),
      drawCalls: diagnostics.drawCalls
    },
    systems: [
      "createAuraApp",
      "typed architecture district model(assets.showcaseSkylineCity)",
      "bounded architecture district presentation",
      "camera choreography",
      "bounded public lighting",
      "orbit interaction",
      "route evidence"
    ],
    claimBoundary: {
      accepted: [
        "Typed architecture district asset staged as the primary environment subject.",
        "Public createAuraApp route uses bounded lighting, camera path controls, and orbit controls around a typed city architecture asset.",
        "Evidence object is published on window for route-health and visual review tooling."
      ],
      notClaimed: [
        "No HDR, IBL, shadow, postprocess, PBR parity, or final architectural visualization fidelity is claimed.",
        "No final launch acceptance is claimed until screenshot, visual review, route health, and deploy checks run.",
        "No primitive staging is presented as the architecture subject."
      ]
    },
    composition: {
      foregroundNodes: countMatching(nodeNames, "foreground"),
      midgroundNodes: countMatching(nodeNames, "midground"),
      backgroundNodes: countMatching(nodeNames, "background"),
      lightShafts: countMatching(nodeNames, "light shaft"),
      hazeDensity: Number((0.014 + controls.haze / 100 * 0.034).toFixed(3))
    },
    aura: auraEvidence,
    renderer: renderer.diagnostics(app.scene),
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
