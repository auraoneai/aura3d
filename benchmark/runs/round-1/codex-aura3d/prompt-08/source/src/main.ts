import {
  type AuraSceneBuilder,
  camera,
  createAuraApp,
  effects,
  interactions,
  lights,
  material,
  primitives,
  scene,
} from "@aura3d/engine";

type Mode = "day" | "night";

type BuildingSpec = {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  color: string;
};

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app container");
}

root.innerHTML = `
  <div class="city-shell">
    <div id="city-canvas"></div>
    <div class="city-toolbar" aria-label="Scene controls">
      <span id="mode-label">Day</span>
      <button id="mode-toggle" type="button" aria-pressed="false">Switch to Night</button>
    </div>
  </div>
`;

const canvasHost = document.querySelector<HTMLDivElement>("#city-canvas");
const toggle = document.querySelector<HTMLButtonElement>("#mode-toggle");
const label = document.querySelector<HTMLSpanElement>("#mode-label");

if (!canvasHost || !toggle || !label) {
  throw new Error("Missing city UI controls");
}

let mode: Mode = "day";
let app = createAuraApp(canvasHost, {
  diagnostics: false,
  pixelRatio: Math.min(window.devicePixelRatio, 2),
  scene: buildCityScene(mode),
});

toggle.addEventListener("click", () => {
  mode = mode === "day" ? "night" : "day";
  app.dispose();
  canvasHost.innerHTML = "";
  app = createAuraApp(canvasHost, {
    diagnostics: false,
    pixelRatio: Math.min(window.devicePixelRatio, 2),
    scene: buildCityScene(mode),
  });
  const isNight = mode === "night";
  label.textContent = isNight ? "Night" : "Day";
  toggle.textContent = isNight ? "Switch to Day" : "Switch to Night";
  toggle.setAttribute("aria-pressed", String(isNight));
  document.documentElement.dataset.mode = mode;
});

document.documentElement.dataset.mode = mode;

function buildCityScene(currentMode: Mode): AuraSceneBuilder {
  const isNight = currentMode === "night";
  const sky = isNight ? "#071027" : "#89c9f7";
  const asphalt = material.pbr({
    color: isNight ? "#10151d" : "#22272b",
    roughness: isNight ? 0.28 : 0.52,
    metallic: isNight ? 0.16 : 0.05,
  });
  const sidewalk = material.pbr({
    color: isNight ? "#313744" : "#aeb5bb",
    roughness: 0.66,
    metallic: 0.02,
  });
  const lane = material.emissive({
    color: isNight ? "#f6d86b" : "#f8e9a2",
    emissive: isNight ? "#f6d86b" : "#d8c46b",
  });

  const city = scene()
    .background(sky)
    .camera(camera.orbit({ position: [8.5, 8, 11.5], target: [0, 1.8, 0], distance: 13, fov: 52 }))
    .add(lights.ambient({ color: isNight ? "#31466f" : "#dcefff", intensity: isNight ? 0.32 : 0.82 }))
    .add(lights.directional({ color: isNight ? "#7890c8" : "#fff1c8", intensity: isNight ? 0.45 : 1.55, position: [-4, 8, 5] }))
    .add(interactions.orbit());

  city
    .add(primitives.plane({ name: "full city ground", material: material.pbr({ color: isNight ? "#171d24" : "#788278", roughness: 0.75 }) }).position(0, -0.04, 0).scale([22, 1, 18]))
    .add(primitives.box({ name: "east west asphalt street", material: asphalt }).position(0, 0.005, 0).scale([21, 0.035, 2.5]))
    .add(primitives.box({ name: "north south asphalt street", material: asphalt }).position(0, 0.01, 0).scale([2.6, 0.035, 17.5]))
    .add(primitives.box({ name: "center intersection", material: material.pbr({ color: isNight ? "#0d1118" : "#1c2227", roughness: 0.35, metallic: 0.08 }) }).position(0, 0.03, 0).scale([2.9, 0.04, 2.75]))
    .add(primitives.box({ name: "north sidewalk band", material: sidewalk }).position(0, 0.045, -2.02).scale([21, 0.055, 0.34]))
    .add(primitives.box({ name: "south sidewalk band", material: sidewalk }).position(0, 0.045, 2.02).scale([21, 0.055, 0.34]))
    .add(primitives.box({ name: "west sidewalk band", material: sidewalk }).position(-2.05, 0.05, 0).scale([0.34, 0.055, 17.5]))
    .add(primitives.box({ name: "east sidewalk band", material: sidewalk }).position(2.05, 0.05, 0).scale([0.34, 0.055, 17.5]));

  for (const x of [-8.5, -5.3, -2.1, 2.1, 5.3, 8.5]) {
    city.add(primitives.box({ name: "east west dashed lane marker", material: lane }).position(x, 0.065, 0).scale([0.9, 0.025, 0.065]));
  }
  for (const z of [-6.8, -4.2, -1.6, 1.6, 4.2, 6.8]) {
    city.add(primitives.box({ name: "north south dashed lane marker", material: lane }).position(0, 0.07, z).scale([0.065, 0.025, 0.82]));
  }

  addBuildings(city, currentMode);
  addStreetLights(city, currentMode);

  if (isNight) {
    city
      .add(effects.bloom({ intensity: 0.34 }))
      .add(effects.fog({ density: 0.075, color: "#18213d" }));
  } else {
    city.add(effects.fog({ density: 0.018, color: "#c9e8ff" }));
  }

  return city;
}

function addBuildings(city: AuraSceneBuilder, currentMode: Mode): void {
  const isNight = currentMode === "night";
  const buildings = createBuildings();

  for (const [index, building] of buildings.entries()) {
    city.add(
      primitives
        .box({
          name: `varied height building ${index + 1}`,
          material: material.pbr({ color: building.color, roughness: 0.48, metallic: 0.08 }),
        })
        .position(building.x, building.height / 2, building.z)
        .scale([building.width, building.height, building.depth]),
    );

    city.add(
      primitives
        .box({
          name: `roof cap ${index + 1}`,
          material: material.pbr({ color: "#2a3038", roughness: 0.62, metallic: 0.04 }),
        })
        .position(building.x, building.height + 0.04, building.z)
        .scale([building.width * 1.05, 0.08, building.depth * 1.05]),
    );

    addWindows(city, building, index, isNight);
  }
}

function addWindows(city: AuraSceneBuilder, building: BuildingSpec, index: number, isNight: boolean): void {
  const litWindow = material.emissive({
    color: isNight ? "#ffd66e" : "#9fd4ee",
    emissive: isNight ? "#ffd66e" : "#6fa8c8",
  });
  const darkWindow = material.pbr({
    color: isNight ? "#151d2d" : "#29475a",
    roughness: 0.22,
    metallic: 0.18,
  });
  const floors = Math.max(2, Math.floor(building.height / 0.52));
  const frontColumns = Math.max(2, Math.floor(building.width / 0.46));
  const sideColumns = Math.max(2, Math.floor(building.depth / 0.5));

  for (let floor = 0; floor < floors; floor += 1) {
    const y = 0.38 + floor * 0.48;
    if (y > building.height - 0.18) continue;

    for (let column = 0; column < frontColumns; column += 1) {
      const offset = ((column + 0.5) / frontColumns - 0.5) * building.width * 0.72;
      const lit = isNight || (floor + column + index) % 3 !== 0;
      city.add(
        primitives
          .box({ name: `front window ${index + 1}-${floor}-${column}`, material: lit ? litWindow : darkWindow })
          .position(building.x + offset, y, building.z + building.depth / 2 + 0.018)
          .scale([0.16, 0.18, 0.028]),
      );
    }

    if (floor % 2 === 0 || building.height > 2.8) {
      for (let column = 0; column < sideColumns; column += 1) {
        const offset = ((column + 0.5) / sideColumns - 0.5) * building.depth * 0.68;
        const lit = isNight || (floor + column + index) % 4 !== 0;
        city.add(
          primitives
            .box({ name: `side window ${index + 1}-${floor}-${column}`, material: lit ? litWindow : darkWindow })
            .position(building.x + building.width / 2 + 0.018, y, building.z + offset)
            .scale([0.028, 0.17, 0.16]),
        );
      }
    }
  }
}

function addStreetLights(city: AuraSceneBuilder, currentMode: Mode): void {
  const isNight = currentMode === "night";
  const pole = material.pbr({ color: "#353b41", roughness: 0.38, metallic: 0.6 });
  const glow = material.emissive({
    color: isNight ? "#ffe3a1" : "#f7f1d1",
    emissive: isNight ? "#ffe3a1" : "#d6c98f",
  });
  const positions: Array<[number, number]> = [
    [-8.8, -1.72],
    [-5.2, 1.72],
    [-1.72, -6.5],
    [1.72, -4.0],
    [1.72, 4.0],
    [-1.72, 6.5],
    [5.2, -1.72],
    [8.8, 1.72],
  ];

  for (const [index, [x, z]] of positions.entries()) {
    city
      .add(primitives.box({ name: `street light pole ${index + 1}`, material: pole }).position(x, 0.62, z).scale([0.07, 1.2, 0.07]))
      .add(primitives.box({ name: `street light arm ${index + 1}`, material: pole }).position(x + (x < 0 ? 0.28 : -0.28), 1.2, z).scale([0.52, 0.055, 0.055]))
      .add(primitives.sphere({ name: `visible street light bulb ${index + 1}`, material: glow }).position(x + (x < 0 ? 0.55 : -0.55), 1.17, z).scale(0.13));

    if (isNight) {
      city.add(
        lights.point({
          name: `warm street light ${index + 1}`,
          color: "#ffd38a",
          intensity: 0.72,
          position: [x + (x < 0 ? 0.55 : -0.55), 1.2, z],
        }),
      );
      city.add(
        primitives
          .box({ name: `street light pool ${index + 1}`, material: material.emissive({ color: "#6d552e", emissive: "#a77838" }) })
          .position(x + (x < 0 ? 0.55 : -0.55), 0.075, z)
          .scale([0.82, 0.018, 0.46]),
      );
    }
  }
}

function createBuildings(): BuildingSpec[] {
  const heights = [1.4, 2.8, 4.2, 2.1, 3.6, 5.3, 1.9, 3.1, 4.8, 2.5, 3.9, 1.7, 4.5, 2.9, 5.0, 2.2, 3.4, 4.0, 2.6, 3.7];
  const colors = ["#6f7981", "#8c7867", "#596c84", "#7f878c", "#9a8a73", "#52606d", "#757c85", "#806f68"];
  const xSlots = [-8.2, -5.1, -2.4, 2.4, 5.2];
  const zSlots = [-6.1, -3.45, 3.45, 6.1];

  return zSlots.flatMap((z, row) =>
    xSlots.map((x, column) => {
      const index = row * xSlots.length + column;
      return {
        x,
        z,
        width: 1.25 + ((index + row) % 3) * 0.18,
        depth: 1.16 + ((index + column) % 4) * 0.12,
        height: heights[index],
        color: colors[index % colors.length],
      };
    }),
  );
}
