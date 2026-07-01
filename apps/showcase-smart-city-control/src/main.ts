import {
  camera,
  city,
  collectAuraSceneEvidence,
  createAuraApp,
  effects,
  game,
  interactions,
  labels,
  lights,
  material,
  model,
  primitives,
  sceneKits,
  timeline,
  ui
} from "@aura3d/engine";
import type { AuraCameraSpec, AuraNodeInput, AuraSceneSnapshot } from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import "./styles.css";

const APP_ID = "showcase-smart-city-control";
const DISTRICTS = ["all", "core", "north", "harbor", "industrial"] as const;
const CAMERA_MODES = ["command", "overview", "street", "flythrough"] as const;

type SmartCityDistrict = typeof DISTRICTS[number];
type SmartCityCameraMode = typeof CAMERA_MODES[number];
type SmartCityTimeOfDay = "day" | "night";
type ShowcaseStatus = "booting" | "ready" | "error";

interface SmartCityControls {
  timeOfDay: SmartCityTimeOfDay;
  district: SmartCityDistrict;
  traffic: boolean;
  cameraMode: SmartCityCameraMode;
  alertLevel: number;
}

interface SceneBuild {
  readonly snapshot: AuraSceneSnapshot;
  readonly systems: readonly string[];
  readonly diagnostics: Record<string, unknown>;
}

interface SmartCityEvidence {
  readonly status: ShowcaseStatus;
  readonly appId: typeof APP_ID;
  readonly frameCount: number;
  readonly interactionState: {
    readonly lastChanged: string;
    readonly runtimeNodeIds: readonly string[];
    readonly selectedDistrict: SmartCityDistrict;
    readonly cameraMode: SmartCityCameraMode;
  };
  readonly controls: SmartCityControls;
  readonly systems: readonly string[];
  readonly claimBoundary: string;
  readonly telemetry: {
    readonly mobility: number;
    readonly energyMw: number;
    readonly incidents: number;
    readonly alertLevel: number;
  };
  readonly diagnostics: Record<string, unknown>;
  readonly updatedAt: string;
}

declare global {
  interface Window {
    __AURA3D_SHOWCASE_SMART_CITY_CONTROL__?: SmartCityEvidence;
  }
}

const controls: SmartCityControls = {
  timeOfDay: "night",
  district: "all",
  traffic: true,
  cameraMode: "command",
  alertLevel: 42
};

let lastChanged = "initial-load";
let activeBuild = buildSmartCityScene();
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
  const trafficSpeed = controls.traffic ? 1 : 0.18;
  app?.nodes.get("city-traffic-east")?.setPosition(Math.sin(time * trafficSpeed) * 2.1, 0.16, -0.36);
  app?.nodes.get("city-traffic-north")?.setPosition(-0.34, 0.18, Math.cos(time * trafficSpeed * 0.82) * 2.2);
  app?.nodes.get("city-data-pulse-core")?.setScale(0.12 + Math.sin(time * 2.2) * 0.025 + controls.alertLevel * 0.0005);
  app?.nodes.get("city-flythrough-drone")?.setPosition(Math.sin(time * 0.42) * 1.8, 1.62 + Math.sin(time * 0.8) * 0.08, Math.cos(time * 0.42) * 1.45);
  if (frame % 12 === 0) publishEvidence("ready");
});

function buildSmartCityScene(): SceneBuild {
  const kit = sceneKits.cityBlock({
    blocks: 8,
    timeOfDay: controls.timeOfDay,
    camera: smartCityCamera(controls.cameraMode, controls.timeOfDay)
  });
  const qaState = city.createState({ blocks: 20, litWindows: true, timeOfDay: controls.timeOfDay });
  const changedNodes = qaState.toggleTimeOfDay();
  const qa = city.visualQA(changedNodes, { changed: qaState.lastChange });
  const builder = kit.scene()
    .background(controls.timeOfDay === "night" ? "#050706" : "#c9ecff")
    .add(effects.fog({
      name: "smart city operational depth haze",
      density: controls.timeOfDay === "night" ? 0.03 : 0.017,
      color: controls.timeOfDay === "night" ? "#1b2a20" : "#d7f4ff",
      intensity: controls.timeOfDay === "night" ? 0.56 : 0.34
    }))
    .add(effects.bloom({
      name: "smart city bounded infrastructure bloom",
      intensity: controls.timeOfDay === "night" ? 0.33 : 0.16,
      threshold: 0.74,
      radius: 0.38
    }))
    .add(lights.point({
      name: "operations amber district rim light",
      position: [2.8, 3.4, 3.6],
      color: "#f4c35d",
      intensity: controls.timeOfDay === "night" ? 1.8 : 0.8
    }))
    .add(lights.point({
      name: "city vehicle route-primary key light",
      position: [0.8, 2.4, 2.35],
      color: "#e8fbff",
      intensity: controls.timeOfDay === "night" ? 2.1 : 1.1
    }))
    .add(interactions.hover({ target: `${controls.district} district control overlay`, selected: `${controls.district} district control overlay` }))
    .addMany(createSmartCityOverlayNodes())
    .camera(smartCityCamera(controls.cameraMode, controls.timeOfDay))
    .timeline(timeline.loop({ seconds: controls.cameraMode === "flythrough" ? 9 : 12, captureTime: 0.44 }));

  const snapshot = builder.toJSON();
  const sceneEvidence = collectAuraSceneEvidence(snapshot);
  const runtimeNodeIds = snapshot.nodes
    .map((node) => "runtime" in node ? node.runtime?.id : undefined)
    .filter((id): id is string => Boolean(id));
  const systems = [
    "sceneKits.cityBlock procedural city base",
    "typed flying city vehicle model(assets.showcaseCityVehicle)",
    "city.visualQA day-night state proof",
    "city.instancing repeated city families",
    "district overlay selection",
    controls.traffic ? "traffic pulses enabled" : "traffic pulses throttled",
    "runtime telemetry pulse nodes",
    "camera and flythrough modes",
    `${controls.timeOfDay} operations lighting`
  ];
  return {
    snapshot,
    systems,
    diagnostics: {
      sceneEvidence,
      sceneKit: kit.diagnostics,
      cityQA: qa,
      cityInstancing: city.instancing(kit.nodes),
      runtimeNodeIds,
      nodeCount: snapshot.nodes.length,
      labelCount: snapshot.nodes.filter((node) => node.kind === "label").length,
      district: controls.district
    }
  };
}

function createSmartCityOverlayNodes(): AuraNodeInput[] {
  const selected = districtAnchor(controls.district);
  const highlightColor = controls.district === "all" ? "#50d891" : districtColor(controls.district);
  const nodes: AuraNodeInput[] = [
    primitives.box({
      name: `${controls.district} district control overlay`,
      material: material.emissive({ color: highlightColor, emissive: highlightColor, emissiveIntensity: 0.58, opacity: 0.22 })
    }).position(selected[0], 0.09, selected[1]).scale(controls.district === "all" ? [3.8, 0.018, 3.8] : [1.38, 0.018, 1.18]),
    primitives.box({
      name: "city traffic east pulse",
      material: material.neon({ color: "#50d891", emissive: "#50d891", emissiveIntensity: controls.traffic ? 1.5 : 0.42, opacity: 0.78 })
    }).position(0, 0.16, -0.36).scale([0.46, 0.038, 0.12]).runtime(game.runtimeNode("city-traffic-east")),
    model(assets.showcaseCityVehicle, { name: "typed command vehicle route-primary hero" })
      .position(-0.1, 1.02, 0.3)
      .rotate(-0.04, 1.5708, 0)
      .scale(1.58)
      .runtime(game.runtimeNode("city-vehicle-primary", { tags: ["traffic", "primary", "typed-asset"] })),
    primitives.box({
      name: "city traffic north pulse",
      material: material.neon({ color: "#4aa3ff", emissive: "#4aa3ff", emissiveIntensity: controls.traffic ? 1.42 : 0.38, opacity: 0.72 })
    }).position(-0.34, 0.18, 0).rotate(0, 1.5708, 0).scale([0.42, 0.038, 0.12]).runtime(game.runtimeNode("city-traffic-north")),
    primitives.sphere({
      name: "core infrastructure data pulse",
      material: material.neon({ color: "#f4c35d", emissive: "#f4c35d", emissiveIntensity: 2.5 })
    }).position(0, 1.42, 0).scale(0.14).runtime(game.runtimeNode("city-data-pulse-core")),
    primitives.sphere({
      name: "flythrough inspection drone",
      material: material.neon({ color: "#f8fbff", emissive: "#b7f7d1", emissiveIntensity: 1.8 })
    }).position(1.5, 1.62, 1.2).scale(0.075).runtime(game.runtimeNode("city-flythrough-drone")),
    primitives.torus({
      name: "city telemetry orbit ring",
      material: material.neon({ color: "#f4c35d", emissive: "#f4c35d", emissiveIntensity: 0.9, opacity: 0.48 })
    }).position(0, 1.36, 0).rotate(1.35, 0.18, 0).scale([1.8, 1.8, 0.026]),
    labels.callout(`${controls.district.toUpperCase()} DISTRICT`, `${controls.district} district control overlay`, {
      name: "selected city district label",
      position: [selected[0], 0.62, selected[1]],
      size: 0.18,
      color: "#f8fbff"
    }),
    labels.callout("Mobility", "city traffic east pulse", {
      name: "traffic telemetry label",
      position: [1.55, 0.52, -0.62],
      size: 0.16,
      color: "#dfffee"
    }),
    labels.callout("Energy", "core infrastructure data pulse", {
      name: "energy telemetry label",
      position: [0.34, 1.84, 0.2],
      size: 0.16,
      color: "#fff2c7"
    }),
    labels.hud(`Smart City | ${controls.timeOfDay} | ${controls.cameraMode}`, {
      name: "smart city route evidence hud",
      screenAnchor: "bottom-left",
      size: 0.24
    })
  ];

  const anchors = [
    { district: "core" as const, label: "Core", color: "#f4c35d" },
    { district: "north" as const, label: "North", color: "#4aa3ff" },
    { district: "harbor" as const, label: "Harbor", color: "#50d891" },
    { district: "industrial" as const, label: "Industrial", color: "#ff7a59" }
  ];

  for (const anchor of anchors) {
    const position = districtAnchor(anchor.district);
    nodes.push(
      primitives.box({
        name: `${anchor.district} district status mast`,
        material: material.neon({ color: anchor.color, emissive: anchor.color, emissiveIntensity: controls.district === anchor.district ? 1.6 : 0.52, opacity: 0.74 })
      }).position(position[0], 0.74, position[1]).scale([0.055, 0.92 + controls.alertLevel * 0.003, 0.055]),
      labels.anchor(anchor.label, `${anchor.district} district status mast`, {
        name: `${anchor.district} district label`,
        position: [position[0], 1.3, position[1]],
        size: 0.14
      })
    );
  }

  if (controls.cameraMode === "flythrough") {
    nodes.push(
      primitives.box({
        name: "flythrough route corridor",
        material: material.emissive({ color: "#b7f7d1", emissive: "#50d891", emissiveIntensity: 0.42, opacity: 0.28 })
      }).position(0.32, 0.22, 0.1).rotate(0, -0.62, 0).scale([4.4, 0.024, 0.12])
    );
  }

  return nodes;
}

function smartCityCamera(mode: SmartCityCameraMode, timeOfDay: SmartCityTimeOfDay): AuraCameraSpec {
  if (mode === "overview") {
    return city.cameraPreset("overview", timeOfDay);
  }
  if (mode === "street") {
    return city.cameraPreset("street-level", timeOfDay);
  }
  if (mode === "flythrough") {
    return camera.flythrough({
      from: [-5.5, 1.45, 4.2],
      to: [3.4, 2.0, -3.8],
      target: [0, 0.72, 0],
      seconds: 9,
      captureTime: 0.46,
      fov: 47
    });
  }
  return camera.perspective({ position: [-2.85, 1.92, 3.55], target: [-0.1, 1.02, 0.3], fov: 30 });
}

function districtAnchor(district: SmartCityDistrict): readonly [number, number] {
  if (district === "north") return [0, -1.42];
  if (district === "harbor") return [-1.36, 1.16];
  if (district === "industrial") return [1.34, 1.16];
  if (district === "core") return [0, 0];
  return [0, 0];
}

function districtColor(district: SmartCityDistrict): string {
  if (district === "north") return "#4aa3ff";
  if (district === "harbor") return "#50d891";
  if (district === "industrial") return "#ff7a59";
  if (district === "core") return "#f4c35d";
  return "#50d891";
}

function bindControls(): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-district]"))) {
    button.addEventListener("click", () => {
      const next = button.dataset.district;
      if (!isDistrict(next)) return;
      controls.district = next;
      applyScene(`district:${next}`);
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

  const dayNight = element<HTMLButtonElement>("#city-day-night");
  dayNight.addEventListener("click", () => {
    controls.timeOfDay = controls.timeOfDay === "night" ? "day" : "night";
    applyScene(`time:${controls.timeOfDay}`);
  });

  const traffic = element<HTMLButtonElement>("#city-traffic");
  traffic.addEventListener("click", () => {
    controls.traffic = !controls.traffic;
    applyScene(controls.traffic ? "traffic:on" : "traffic:off");
  });

  const alertInput = ui.slider("#city-alert", { min: 0, max: 100, value: controls.alertLevel, metric: "smart-city-alert-level" });
  alertInput.addEventListener("input", () => {
    controls.alertLevel = Number(alertInput.value);
    applyScene("alert-level");
  });
}

function applyScene(change: string): void {
  lastChanged = change;
  activeBuild = buildSmartCityScene();
  app?.setScene(activeBuild.snapshot);
  updateControlState();
  publishEvidence("ready");
}

function updateControlState(): void {
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-district]"))) {
    button.setAttribute("aria-pressed", String(button.dataset.district === controls.district));
  }
  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-camera]"))) {
    button.setAttribute("aria-pressed", String(button.dataset.camera === controls.cameraMode));
  }
  const dayNight = element<HTMLButtonElement>("#city-day-night");
  dayNight.textContent = controls.timeOfDay === "night" ? "Night Ops" : "Day Ops";
  dayNight.setAttribute("aria-pressed", String(controls.timeOfDay === "night"));
  const traffic = element<HTMLButtonElement>("#city-traffic");
  traffic.textContent = controls.traffic ? "Traffic Live" : "Traffic Hold";
  traffic.setAttribute("aria-pressed", String(controls.traffic));
  element<HTMLInputElement>("#city-alert").value = String(controls.alertLevel);
  ui.setText("#city-alert-value", controls.alertLevel);
}

function publishEvidence(status: ShowcaseStatus): void {
  const frameCount = app?.runtime.frame ?? 0;
  const telemetry = computeTelemetry(app?.runtime.time ?? 0);
  const runtimeNodeIds = app?.nodes.ids() ?? (activeBuild.diagnostics.runtimeNodeIds as readonly string[] | undefined) ?? [];
  const appDiagnostics = app?.diagnostics();
  const evidence: SmartCityEvidence = {
    status,
    appId: APP_ID,
    frameCount,
    interactionState: {
      lastChanged,
      runtimeNodeIds,
      selectedDistrict: controls.district,
      cameraMode: controls.cameraMode
    },
    controls: { ...controls },
    systems: activeBuild.systems,
    claimBoundary: "Procedural Aura3D public API showcase using sceneKits.cityBlock, city visual QA, city instancing evidence, district overlays, labels, controls, and runtime telemetry. It does not claim real GIS data, external assets, or traffic simulation fidelity.",
    telemetry,
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
  window.__AURA3D_SHOWCASE_SMART_CITY_CONTROL__ = evidence;
  ui.setText("#city-status", status);
  ui.setText("#city-frame", frameCount);
  ui.setText("#city-district", controls.district);
  ui.setText("#city-mobility", `${telemetry.mobility}%`);
  ui.setText("#city-energy", `${telemetry.energyMw} MW`);
  ui.setText("#city-incidents", telemetry.incidents);
  ui.setText("#city-nodes", activeBuild.snapshot.nodes.length);
}

function computeTelemetry(time: number): SmartCityEvidence["telemetry"] {
  const trafficBase = controls.traffic ? 82 : 48;
  const alertPenalty = Math.round(controls.alertLevel * 0.18);
  const districtBoost = controls.district === "all" ? 0 : 4;
  const mobility = Math.max(20, Math.min(98, Math.round(trafficBase + Math.sin(time * 0.8) * 5 + districtBoost - alertPenalty)));
  const energyMw = Math.round(118 + controls.alertLevel * 1.7 + (controls.timeOfDay === "night" ? 34 : -12) + Math.cos(time * 0.45) * 6);
  const incidents = Math.max(0, Math.round(controls.alertLevel / 18 + (controls.traffic ? 1 : 3) + Math.sin(time * 0.6)));
  return {
    mobility,
    energyMw,
    incidents,
    alertLevel: controls.alertLevel
  };
}

function element<T extends HTMLElement>(selector: string): T {
  const target = document.querySelector<T>(selector);
  if (!target) {
    throw new Error(`Missing Smart City control: ${selector}`);
  }
  return target;
}

function isDistrict(value: string | undefined): value is SmartCityDistrict {
  return DISTRICTS.includes(value as SmartCityDistrict);
}

function isCameraMode(value: string | undefined): value is SmartCityCameraMode {
  return CAMERA_MODES.includes(value as SmartCityCameraMode);
}
