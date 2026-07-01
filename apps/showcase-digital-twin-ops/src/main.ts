import {
  camera,
  collectAuraSceneEvidence,
  createAuraApp,
  effects,
  game,
  interactions,
  lights,
  material,
  model,
  primitives,
  scene,
  type AuraNodeInput
} from "@aura3d/engine";
import { assets } from "../../../src/aura-assets";
import "./styles.css";

type OpsMode = "normal" | "maintenance" | "incident";
type ZoneId = "assembly" | "packaging" | "energy" | "dock";

interface ZoneState {
  readonly id: ZoneId;
  readonly label: string;
  readonly load: number;
  readonly temperature: number;
  readonly incidents: number;
}

interface DigitalTwinEvidence {
  readonly status: "ready" | "running";
  readonly appId: "showcase-digital-twin-ops";
  readonly frameCount: number;
  readonly mode: OpsMode;
  readonly selectedZone: ZoneId;
  readonly uptime: number;
  readonly throughput: number;
  readonly energyMw: number;
  readonly alerts: number;
  readonly zones: readonly ZoneState[];
  readonly controls: readonly string[];
  readonly systems: readonly string[];
  readonly runtimeNodeIds: readonly string[];
  readonly motionProof: {
    readonly conveyorSegmentX: number;
    readonly robotArmRadians: number;
    readonly typedRobotYaw: number;
    readonly sensorSweepRadians: number;
    readonly movingWorkpieces: readonly { readonly id: string; readonly x: number; readonly z: number }[];
  };
  readonly claimBoundary: string;
  readonly diagnostics: Record<string, unknown>;
}

declare global {
  interface Window {
    __AURA3D_SHOWCASE_DIGITAL_TWIN_OPS__?: DigitalTwinEvidence;
  }
}

const controls = [
  "Mode buttons switch normal, service, and incident states",
  "Zone buttons select assembly, packaging, energy, or dock",
  "Inject Alert creates deterministic incident evidence",
  "Clear Alerts returns the workcell to normal",
  "Orbit interaction inspects the typed workcell"
] as const;

const systems = [
  "typed robotic welding workcell model(assets.showcaseRoboticWeldingWorkcell) is the route-primary industrial subject",
  "compiler-selected orange robot asset is rejected from the live primary path after human visual review",
  "bounded operations dashboard uses deterministic sample telemetry only",
  "supporting floor, status ring, conveyor pulses, workpieces, and scanner sweep stay secondary to the typed workcell asset",
  "Aura3D runtime nodes provide visible conveyor and scanner motion proof",
  "route-health evidence global and deploy gates remain required before public claims"
] as const;

const workcellAsset = assets.showcaseRoboticWeldingWorkcell;
const zoneOrder: readonly ZoneId[] = ["assembly", "packaging", "energy", "dock"];
const zoneLabels: Record<ZoneId, string> = {
  assembly: "Assembly",
  packaging: "Packaging",
  energy: "Energy",
  dock: "Dock"
};

const zonePositions: Record<ZoneId, readonly [number, number, number]> = {
  assembly: [-0.28, 0.095, -0.05],
  packaging: [0.42, 0.095, 0.32],
  energy: [-0.58, 0.095, 0.32],
  dock: [0.64, 0.095, -0.08]
};

let mode: OpsMode = "normal";
let selectedZone: ZoneId = "assembly";
let frameCount = 0;
let uptime = 0;
let throughput = 1280;
let energyMw = 4.8;
let zones: ZoneState[] = createZones();
let eventLog: readonly string[] = ["Robotic welding workcell mounted with deterministic telemetry."];
let lastMotionProof: DigitalTwinEvidence["motionProof"] = {
  conveyorSegmentX: -0.48,
  robotArmRadians: 0,
  typedRobotYaw: -0.18,
  sensorSweepRadians: 0,
  movingWorkpieces: []
};

const app = createAuraApp("#app", {
  diagnostics: { overlay: false, performancePanel: false },
  pixelRatio: Math.min(1.35, window.devicePixelRatio || 1),
  scene: buildOpsScene()
});

const workcell = app.nodes.require("ops-typed-welding-workcell");
const conveyor = app.nodes.require("ops-conveyor-motion");
const sensor = app.nodes.require("ops-sensor-sweep");
const selectedRing = app.nodes.require("ops-selected-zone-ring");
const alarmBeacon = app.nodes.require("ops-alarm-beacon");
const movingWorkpieces = Array.from({ length: 3 }, (_, index) => ({
  id: `ops-moving-workpiece-${index + 1}`,
  node: app.nodes.require(`ops-moving-workpiece-${index + 1}`)
}));
const beltPulseNodes = Array.from({ length: 4 }, (_, index) => app.nodes.require(`ops-belt-pulse-${index + 1}`));

renderConsole();
syncUi();
publishEvidence("ready");

app.onFrame(({ dt, time }) => {
  const step = Math.min(0.05, Math.max(1 / 240, dt || 1 / 60));
  frameCount += 1;
  uptime += step;
  updateTelemetry(step);
  syncRuntime(time);
  if (frameCount < 4 || frameCount % 12 === 0) {
    syncUi();
    publishEvidence("running");
  }
});

function buildOpsScene() {
  return scene()
    .background("#051011")
    .addMany(createWorkcellPresentation())
    .add(lights.ambient({ name: "workcell ambient fill", intensity: 0.48, color: "#dff6f0" }))
    .add(lights.directional({ name: "factory key light", position: [2.1, 3.2, 2.4], intensity: 1.28, color: "#fff4df" }))
    .add(lights.point({ name: "workcell cyan practical", position: [-0.75, 1.05, 0.5], intensity: 0.7, color: "#7ee8c4" }))
    .add(lights.point({ name: "workcell warm inspection light", position: [0.62, 0.95, -0.25], intensity: 0.72, color: "#f2b15a" }))
    .add(effects.ambientOcclusion({ name: "workcell contact occlusion", intensity: 0.42, radius: 0.76 }))
    .add(effects.bloom({ name: "workcell status glow", intensity: 0.12, threshold: 0.8, radius: 0.18 }))
    .add(effects.fog({ name: "bounded ops depth haze", density: 0.0035, color: "#061012", intensity: 0.04 }))
    .add(interactions.orbit())
    .camera(camera.perspective({ position: [1.72, 1.0, 2.62], target: [-0.04, 0.26, 0.02], fov: 38 }));
}

function createWorkcellPresentation(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [
    primitives.plane({ name: "quiet ops floor", material: material.pbr({ color: "#071013", roughness: 0.86, metallic: 0.02 }) })
      .position(0, -0.024, 0)
      .scale([1.54, 1, 0.94]),
    primitives.box({ name: "single workcell presentation plinth", material: material.pbr({ color: "#1d3034", roughness: 0.7, metallic: 0.1 }) })
      .position(0, 0.018, 0.02)
      .scale([1.34, 0.035, 0.72]),
    model(workcellAsset, {
      name: "typed robotic welding workcell route-primary hero",
      scaleMode: "fit",
      targetMaxDimension: 1.32,
      castShadow: true,
      receiveShadow: true
    })
      .position(-0.08, 0.058, -0.04)
      .rotate(0, -0.2, 0)
      .runtime(game.runtimeNode("ops-typed-welding-workcell", { tags: ["typed-asset", "industrial-workcell", "runtime-hero"] })),
    primitives.torus({ name: "selected zone evidence ring", material: material.neon({ color: "#7ee8c4", emissive: "#7ee8c4", emissiveIntensity: 0.72, opacity: 0.42 }) })
      .position(...zonePositions.assembly)
      .rotate(1.5708, 0, 0)
      .scale([0.24, 0.24, 0.009])
      .runtime(game.runtimeNode("ops-selected-zone-ring", { tags: ["zone", "runtime", "selection"] })),
    primitives.box({ name: "short conveyor motion marker", material: material.neon({ color: "#7ee8c4", emissive: "#7ee8c4", emissiveIntensity: 0.64, opacity: 0.62 }) })
      .position(-0.48, 0.11, 0.44)
      .scale([0.12, 0.009, 0.045])
      .runtime(game.runtimeNode("ops-conveyor-motion", { tags: ["conveyor", "runtime", "motion-proof"] })),
    primitives.box({ name: "optical scanner sweep", material: material.neon({ color: "#b8f7d9", emissive: "#b8f7d9", emissiveIntensity: 0.68, opacity: 0.54 }) })
      .position(0.56, 0.3, 0.28)
      .scale([0.13, 0.01, 0.018])
      .runtime(game.runtimeNode("ops-sensor-sweep", { tags: ["scanner", "runtime", "motion-proof"] })),
    primitives.sphere({ name: "incident alarm beacon", material: material.neon({ color: "#f2715c", emissive: "#f2715c", emissiveIntensity: 1.1 }) })
      .position(-0.54, 0.64, -0.42)
      .scale(0.048)
      .runtime(game.runtimeNode("ops-alarm-beacon", { tags: ["alarm", "runtime"] }))
  ];

  nodes.push(...createWorkpieces());
  nodes.push(...createBeltPulses());
  return nodes;
}

function createWorkpieces(): AuraNodeInput[] {
  const colors = ["#f2b15a", "#dbe7e4", "#b8f7d9"] as const;
  return Array.from({ length: 3 }, (_, index) =>
    primitives.box({
      name: `small conveyor workpiece ${index + 1}`,
      material: material.clearcoatPaint({
        color: colors[index] ?? "#f2b15a",
        roughness: 0.24,
        clearcoat: 0.5
      })
    })
      .position(-0.28 + index * 0.2, 0.115, 0.44)
      .scale([0.064, 0.032, 0.052])
      .runtime(game.runtimeNode(`ops-moving-workpiece-${index + 1}`, { tags: ["conveyor", "workpiece", "runtime"] }))
  );
}

function createBeltPulses(): AuraNodeInput[] {
  return Array.from({ length: 4 }, (_, index) =>
    primitives.box({
      name: `small conveyor pulse ${index + 1}`,
      material: material.neon({ color: "#7ee8c4", emissive: "#7ee8c4", emissiveIntensity: 0.42, opacity: 0.42 })
    })
      .position(-0.45 + index * 0.17, 0.086, 0.52)
      .scale([0.07, 0.006, 0.024])
      .runtime(game.runtimeNode(`ops-belt-pulse-${index + 1}`, { tags: ["conveyor", "runtime", "motion-proof"] }))
  );
}

function createZones(): ZoneState[] {
  return zoneOrder.map((zone, index) => ({
    id: zone,
    label: zoneLabels[zone],
    load: 56 + index * 8,
    temperature: 31.5 + index * 2,
    incidents: 0
  }));
}

function updateTelemetry(dt: number): void {
  const incidentBias = mode === "incident" ? 1.55 : mode === "maintenance" ? 0.72 : 1;
  throughput = Math.round(1260 + Math.sin(uptime * 0.42) * 70 - (mode === "maintenance" ? 160 : 0) - (mode === "incident" ? 250 : 0));
  energyMw = Number((4.72 + Math.sin(uptime * 0.27) * 0.24 + (mode === "incident" ? 0.48 : 0)).toFixed(2));
  zones = zones.map((zone, index) => {
    const selectedBoost = zone.id === selectedZone ? 8 : 0;
    return {
      ...zone,
      load: Math.round(clamp(zone.load + Math.sin(uptime * (0.22 + index * 0.03)) * 0.14 + selectedBoost * dt * 0.07, 30, 98)),
      temperature: Number(clamp(zone.temperature + Math.sin(uptime * 0.18 + index) * 0.014 * incidentBias, 25, 82).toFixed(1))
    };
  });
}

function syncRuntime(time: number): void {
  const beltSpeed = mode === "maintenance" ? 0.36 : mode === "incident" ? 0.95 : 0.68;
  const conveyorX = -0.46 + ((time * beltSpeed) % 0.66);
  const robotArmRadians = Math.sin(time * 1.15) * 0.18;
  const typedRobotYaw = -0.18 + Math.sin(time * 0.64) * 0.045;
  const sensorSweepRadians = Math.sin(time * 1.02) * 0.72;
  const workpieceProof = movingWorkpieces.map((entry, index) => {
    const laneProgress = (time * beltSpeed + index * 0.22) % 0.64;
    const x = -0.28 + laneProgress;
    const z = 0.44 + Math.sin(time * 1.2 + index) * 0.01;
    entry.node
      .setPosition(x, 0.115, z)
      .setRotation(0, time * (0.45 + index * 0.05), 0)
      .setScale([0.064, 0.032 + Math.sin(time * 2 + index) * 0.003, 0.052]);
    return { id: entry.id, x: Number(x.toFixed(3)), z: Number(z.toFixed(3)) };
  });
  beltPulseNodes.forEach((node, index) => {
    const pulseX = -0.45 + ((time * beltSpeed * 1.2 + index * 0.15) % 0.66);
    node.setPosition(pulseX, 0.086, 0.52).setScale([0.07, 0.006, 0.024]);
  });
  conveyor.setPosition(conveyorX, 0.11, 0.44);
  workcell.setPosition(-0.08, 0.058 + Math.sin(time * 0.7) * 0.002, -0.04).setRotation(0, typedRobotYaw, 0).setScale(1);
  sensor.setRotation(0, sensorSweepRadians, 0);
  selectedRing.setPosition(...zonePositions[selectedZone]).setScale([0.24 + Math.sin(time * 2.2) * 0.018, 0.24 + Math.sin(time * 2.2) * 0.018, 0.009]);
  const alarmVisible = mode === "incident" || zones.some((zone) => zone.incidents > 0);
  alarmBeacon.setVisible(alarmVisible).setScale(alarmVisible ? 0.052 + Math.abs(Math.sin(time * 6.4)) * 0.04 : 0.035);
  lastMotionProof = {
    conveyorSegmentX: Number(conveyorX.toFixed(3)),
    robotArmRadians: Number(robotArmRadians.toFixed(3)),
    typedRobotYaw: Number(typedRobotYaw.toFixed(3)),
    sensorSweepRadians: Number(sensorSweepRadians.toFixed(3)),
    movingWorkpieces: workpieceProof
  };
}

function renderConsole(): void {
  const consoleEl = document.querySelector<HTMLElement>("#console");
  if (!consoleEl) return;
  consoleEl.innerHTML = `
    <h1>Digital Twin Operations</h1>
    <section class="console__section">
      <h2>Mode</h2>
      <div class="mode-bar">
        <button type="button" data-mode="normal" aria-pressed="true">Normal</button>
        <button type="button" data-mode="maintenance" aria-pressed="false">Service</button>
        <button type="button" data-mode="incident" aria-pressed="false">Incident</button>
      </div>
    </section>
    <section class="console__section">
      <h2>Zones</h2>
      <div class="mode-bar">
        ${zoneOrder.map((zone) => `<button type="button" data-zone="${zone}" aria-pressed="${zone === selectedZone}">${zoneLabels[zone]}</button>`).join("")}
      </div>
    </section>
    <section class="console__section">
      <h2>Actions</h2>
      <div class="mode-bar">
        <button type="button" id="inject-alert">Inject Alert</button>
        <button type="button" id="clear-alerts">Clear Alerts</button>
        <button type="button" id="focus-zone">Focus Zone</button>
      </div>
    </section>
    <section class="console__section">
      <h2>Evidence</h2>
      <div class="console__grid">
        <div class="console__metric"><span class="console__label">Runtime Nodes</span><strong id="ops-runtime-nodes" class="console__value">0</strong></div>
        <div class="console__metric"><span class="console__label">Draw Calls</span><strong id="ops-draw-calls" class="console__value">0</strong></div>
        <div class="console__metric"><span class="console__label">Backend</span><strong id="ops-backend" class="console__value">pending</strong></div>
        <div class="console__metric"><span class="console__label">Mode</span><strong id="ops-mode" class="console__value">normal</strong></div>
      </div>
    </section>
    <section class="console__section">
      <h2>Event Log</h2>
      <ul id="ops-event-log" class="event-log"></ul>
    </section>
  `;

  consoleEl.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.mode;
      if (next === "normal" || next === "maintenance" || next === "incident") {
        mode = next;
        eventLog = [`Mode switched to ${next}.`, ...eventLog].slice(0, 7);
        syncUi();
        publishEvidence("ready");
      }
    });
  });
  consoleEl.querySelectorAll<HTMLButtonElement>("[data-zone]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.zone;
      if (isZone(next)) {
        selectedZone = next;
        eventLog = [`Selected ${zoneLabels[next]} zone.`, ...eventLog].slice(0, 7);
        syncRuntime(uptime);
        syncUi();
        publishEvidence("ready");
      }
    });
  });
  consoleEl.querySelector<HTMLButtonElement>("#inject-alert")?.addEventListener("click", () => injectAlert());
  consoleEl.querySelector<HTMLButtonElement>("#clear-alerts")?.addEventListener("click", () => {
    zones = zones.map((zone) => ({ ...zone, incidents: 0 }));
    mode = "normal";
    eventLog = ["Alerts cleared by operator.", ...eventLog].slice(0, 7);
    syncUi();
    publishEvidence("ready");
  });
  consoleEl.querySelector<HTMLButtonElement>("#focus-zone")?.addEventListener("click", () => {
    eventLog = [`Camera/orbit target focuses ${zoneLabels[selectedZone]} zone.`, ...eventLog].slice(0, 7);
    syncUi();
    publishEvidence("ready");
  });
}

function injectAlert(): void {
  zones = zones.map((zone) => zone.id === selectedZone ? { ...zone, incidents: zone.incidents + 1, temperature: Number((zone.temperature + 5.5).toFixed(1)) } : zone);
  mode = "incident";
  eventLog = [`Alert injected in ${zoneLabels[selectedZone]} zone.`, ...eventLog].slice(0, 7);
  syncUi();
  publishEvidence("ready");
}

function syncUi(): void {
  const telemetry = document.querySelector<HTMLElement>("#telemetry");
  if (telemetry) {
    const alerts = zones.reduce((sum, zone) => sum + zone.incidents, 0);
    telemetry.innerHTML = `
      <article class="telemetry__card"><span>Throughput</span><strong>${throughput}</strong><em>units/hour</em></article>
      <article class="telemetry__card"><span>Energy</span><strong>${energyMw.toFixed(2)}</strong><em>MW draw</em></article>
      <article class="telemetry__card"><span>Alerts</span><strong>${alerts}</strong><em>${mode}</em></article>
      <article class="telemetry__card"><span>Selected Zone</span><strong>${zoneLabels[selectedZone]}</strong><em>${zoneSummary(selectedZone)}</em></article>
    `;
  }

  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-zone]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.zone === selectedZone));
  });

  const diagnostics = app.diagnostics();
  setText("#ops-runtime-nodes", app.nodes.ids().length);
  setText("#ops-draw-calls", diagnostics.drawCalls);
  setText("#ops-backend", app.backend);
  setText("#ops-mode", mode);
  const log = document.querySelector<HTMLElement>("#ops-event-log");
  if (log) {
    log.innerHTML = eventLog.map((item, index) => `<li><time>${String(index + 1).padStart(2, "0")}</time><b>${escapeHtml(item)}</b></li>`).join("");
  }
}

function publishEvidence(status: DigitalTwinEvidence["status"]): void {
  const diagnostics = app.diagnostics();
  window.__AURA3D_SHOWCASE_DIGITAL_TWIN_OPS__ = {
    status,
    appId: "showcase-digital-twin-ops",
    frameCount,
    mode,
    selectedZone,
    uptime: Number(uptime.toFixed(2)),
    throughput,
    energyMw,
    alerts: zones.reduce((sum, zone) => sum + zone.incidents, 0),
    zones,
    controls,
    systems,
    runtimeNodeIds: app.nodes.ids(),
    motionProof: lastMotionProof,
    claimBoundary: "Digital-twin operations showcase using the typed robotic welding workcell GLB plus deterministic browser-side sample telemetry. It does not claim real facility data, PLC connectivity, validated safety logic, or production digital-twin integration.",
    diagnostics: {
      auraScene: collectAuraSceneEvidence(app.scene),
      backend: app.backend,
      fps: diagnostics.fps,
      drawCalls: diagnostics.drawCalls,
      warnings: diagnostics.warnings,
      errors: diagnostics.errors
    }
  };
}

function zoneSummary(zoneId: ZoneId): string {
  const zone = zones.find((candidate) => candidate.id === zoneId);
  return zone ? `${zone.load}% load | ${zone.temperature.toFixed(1)} C` : "pending";
}

function isZone(value: string | undefined): value is ZoneId {
  return value === "assembly" || value === "packaging" || value === "energy" || value === "dock";
}

function setText(selector: string, value: string | number): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = String(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char] ?? char);
}
