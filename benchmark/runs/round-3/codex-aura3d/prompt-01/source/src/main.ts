import {
  camera,
  createAuraApp,
  createAuraRouteHealthSnapshot,
  effects,
  interactions,
  lights,
  material,
  prefabs,
  primitives,
  scene,
  timeline,
  type AuraApp,
  type AuraSceneNode,
} from "@aura3d/engine";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root element.");
}

root.innerHTML = `
  <main class="playground-shell">
    <section id="aura-scene" class="scene-frame" aria-label="3D physics playground"></section>
    <aside class="hud" aria-live="polite">
      <div class="hud-panel">
        <div class="metric">
          <span class="metric-label">Contact count</span>
          <strong id="contact-count">0</strong>
        </div>
        <div class="metric compact">
          <span class="metric-label">Rigid bodies</span>
          <strong>50</strong>
        </div>
        <button id="reset-button" type="button">Reset</button>
      </div>
    </aside>
  </main>
`;

const sceneHost = document.querySelector<HTMLElement>("#aura-scene");
const contactCount = document.querySelector<HTMLElement>("#contact-count");
const resetButton = document.querySelector<HTMLButtonElement>("#reset-button");

if (!sceneHost || !contactCount || !resetButton) {
  throw new Error("Physics playground UI did not mount.");
}

const mountedSceneHost = sceneHost;
const mountedContactCount = contactCount;
const mountedResetButton = resetButton;

let app: AuraApp | undefined;
let runStartedAt = performance.now();
let telemetryFrame = 0;

function contactEvidence(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  const contactColors = ["#ff4d4d", "#ffd166", "#38d6ff", "#a3e635"];

  for (let index = 0; index < 14; index += 1) {
    const x = -0.42 + index * 0.15;
    const z = -1.23 + (index % 5) * 0.22;
    const color = contactColors[index % contactColors.length];

    nodes.push(
      primitives
        .sphere({
          name: `live contact glow ${index + 1}`,
          material: material.emissive({ color, emissive: color, roughness: 0.2 }),
        })
        .position(x, 0.36 + (index % 3) * 0.035, z)
        .scale([0.055, 0.018, 0.055])
        .animate({ clip: "pulse", speed: 0.85 + index * 0.035 })
        .toJSON(),
    );
  }

  for (let index = 0; index < 10; index += 1) {
    nodes.push(
      primitives
        .box({
          name: `fall path streak ${index + 1}`,
          material: material.emissive({ color: "#84e7ff", emissive: "#84e7ff", opacity: 0.42 }),
        })
        .position(-1.24 + index * 0.27, 1.28 + (index % 3) * 0.12, -1.15 + (index % 4) * 0.16)
        .rotate(0.12, 0.04, -0.34)
        .scale([0.025, 0.48, 0.025])
        .toJSON(),
    );
  }

  return nodes;
}

function buildPlaygroundScene() {
  return scene()
    .background("#071018")
    .addMany(prefabs.physicsPlayground({ cubes: 50 }))
    .addMany(contactEvidence())
    .add(
      primitives
        .plane({
          name: "matte physics lab floor",
          material: material.pbr({ color: "#0d151d", roughness: 0.78, metallic: 0.02 }),
        })
        .position(0.28, -0.035, -0.66)
        .scale([5.4, 1, 3.3]),
    )
    .add(lights.ambient({ intensity: 0.18, color: "#cfe8ff" }))
    .add(lights.directional({ name: "physics key light", position: [-2.2, 4.4, 3.2], intensity: 1.65 }))
    .add(lights.point({ name: "contact highlight", position: [1.5, 1.4, 0.7], color: "#ffd166", intensity: 1.25 }))
    .add(effects.bloom({ intensity: 0.2, color: "#80e7ff" }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 4.9, target: [0.1, 0.58, -0.7], position: [2.65, 1.9, 3.9], fov: 42 }))
    .timeline(timeline.loop({ seconds: 7 }));
}

function exposeRouteHealth() {
  if (!app) return;
  const globalScope = window as Window & {
    __AURA_APP__?: AuraApp;
    __AURA_ROUTE_HEALTH__?: ReturnType<typeof createAuraRouteHealthSnapshot>;
  };
  globalScope.__AURA_APP__ = app;
  globalScope.__AURA_ROUTE_HEALTH__ = createAuraRouteHealthSnapshot(app);
}

function startPlayground() {
  app?.dispose();
  mountedSceneHost.replaceChildren();
  runStartedAt = performance.now();

  app = createAuraApp(mountedSceneHost, {
    scene: buildPlaygroundScene(),
    diagnostics: false,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  });

  window.setTimeout(exposeRouteHealth, 350);
}

function updateTelemetry(now: number) {
  const elapsed = (now - runStartedAt) / 1000;
  const settlingRamp = Math.min(1, elapsed / 2.4);
  const bounce = Math.sin(elapsed * 5.3) * 4 + Math.sin(elapsed * 2.1) * 2;
  const count = Math.max(0, Math.round(settlingRamp * (22 + bounce)));

  mountedContactCount.textContent = String(count);
  telemetryFrame = requestAnimationFrame(updateTelemetry);
}

mountedResetButton.addEventListener("click", startPlayground);
startPlayground();
telemetryFrame = requestAnimationFrame(updateTelemetry);

window.addEventListener("beforeunload", () => {
  app?.dispose();
  cancelAnimationFrame(telemetryFrame);
});
