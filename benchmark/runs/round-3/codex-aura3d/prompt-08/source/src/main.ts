import {
  camera,
  createAuraApp,
  effects,
  interactions,
  lights,
  material,
  prefabs,
  primitives,
  scene,
  type AuraApp,
  type AuraSceneNode
} from "@aura3d/engine";

type CityMode = "day" | "night";

const root = document.querySelector<HTMLElement>("#app");
const toggle = document.querySelector<HTMLButtonElement>("#mode-toggle");
const label = document.querySelector<HTMLElement>("#mode-label");

let mode: CityMode = "day";
let app: AuraApp | undefined;

const streetLampPositions: ReadonlyArray<readonly [number, number, number]> = [
  [-3.15, 0.74, 0.35],
  [-1.05, 0.74, 0.35],
  [1.05, 0.74, 0.35],
  [3.15, 0.74, 0.35],
  [-3.15, 0.74, -1.75],
  [-1.05, 0.74, -1.75],
  [1.05, 0.74, -1.75],
  [3.15, 0.74, -1.75]
];

function makeModeLighting(nextMode: CityMode): AuraSceneNode[] {
  if (nextMode === "day") {
    return [
      lights.ambient({ name: "cool daylight ambient", color: "#e8f6ff", intensity: 0.72 }).toJSON(),
      lights.directional({
        name: "high afternoon sun",
        color: "#fff2d1",
        intensity: 2.2,
        position: [-3.5, 5.2, 4.8]
      }).toJSON(),
      lights.point({
        name: "soft storefront bounce",
        color: "#ffffff",
        intensity: 0.5,
        position: [2.2, 1.6, 1.2]
      }).toJSON()
    ];
  }

  return [
    lights.ambient({ name: "low blue night ambient", color: "#5573a6", intensity: 0.18 }).toJSON(),
    lights.directional({
      name: "dim moon light",
      color: "#a8c6ff",
      intensity: 0.45,
      position: [3.0, 4.5, 2.2]
    }).toJSON(),
    ...streetLampPositions.map(([x, y, z], index) =>
      lights
        .point({
          name: `street lamp glow ${index + 1}`,
          color: "#ffd98a",
          intensity: 1.25,
          position: [x, y, z]
        })
        .toJSON()
    )
  ];
}

function makeModeAccents(nextMode: CityMode): AuraSceneNode[] {
  if (nextMode === "day") {
    return [
      primitives
        .sphere({
          name: "visible sun disk",
          material: material.emissive({ color: "#ffe6a4", emissive: "#ffe6a4" })
        })
        .position(-3.4, 4.2, -2.8)
        .scale(0.34)
        .toJSON(),
      effects.fog({ name: "clear daytime aerial haze", color: "#b8e3ff", density: 0.025 }).toJSON()
    ];
  }

  return [
    primitives
      .sphere({
        name: "visible moon disk",
        material: material.emissive({ color: "#d9e7ff", emissive: "#d9e7ff" })
      })
      .position(3.35, 3.7, -2.9)
      .scale(0.24)
      .toJSON(),
    effects.fog({ name: "blue night street haze", color: "#1b2d4e", density: 0.07 }).toJSON(),
    effects.bloom({ name: "night window and lamp bloom", color: "#ffd98a", intensity: 0.42 }).toJSON()
  ];
}

function buildCityScene(nextMode: CityMode) {
  const sky = nextMode === "day" ? "#8dcaf2" : "#030914";

  return scene()
    .background(sky)
    .addMany(prefabs.cityBlock({ blocks: 20, litWindows: true }))
    .addMany(makeModeLighting(nextMode))
    .addMany(makeModeAccents(nextMode))
    .add(interactions.orbit())
    .camera(
      camera.perspective({
        position: [4.4, 3.35, 5.55],
        target: [0, 0.72, -0.82],
        fov: 46
      })
    );
}

function render() {
  if (!root) return;

  app?.dispose();
  root.innerHTML = "";
  app = createAuraApp(root, {
    diagnostics: false,
    scene: buildCityScene(mode)
  });

  if (toggle && label) {
    const isDay = mode === "day";
    toggle.textContent = isDay ? "Switch to night" : "Switch to day";
    toggle.setAttribute("aria-pressed", String(!isDay));
    label.textContent = isDay ? "Day" : "Night";
    document.documentElement.dataset.mode = mode;
  }
}

toggle?.addEventListener("click", () => {
  mode = mode === "day" ? "night" : "day";
  render();
});

render();
