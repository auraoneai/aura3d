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

type Mode = "day" | "night";

const buildingLayout = [
  [-3.15, -2.12, 0.58, 1.25],
  [-2.15, -2.1, 0.68, 1.8],
  [-1.05, -2.18, 0.54, 1.05],
  [1.0, -2.12, 0.78, 2.15],
  [2.15, -2.08, 0.62, 1.45],
  [3.14, -2.14, 0.7, 2.45],
  [-3.25, -0.88, 0.72, 1.65],
  [-2.1, -0.82, 0.58, 2.75],
  [1.05, -0.85, 0.64, 1.35],
  [2.15, -0.82, 0.7, 2.3],
  [3.2, -0.9, 0.56, 1.15],
  [-3.1, 0.82, 0.62, 2.05],
  [-2.05, 0.88, 0.72, 1.4],
  [-1.0, 0.82, 0.56, 2.55],
  [1.05, 0.86, 0.7, 1.75],
  [2.15, 0.84, 0.6, 2.9],
  [3.18, 0.9, 0.74, 1.25]
] as const;

let app: AuraApp | undefined;
let mode: Mode = "day";

function buildingMaterial(index: number, currentMode: Mode) {
  const dayColors = ["#8b9aaa", "#6f8193", "#9aa4ad", "#74838f", "#566677"];
  const nightColors = ["#202937", "#172231", "#263142", "#1d2735", "#121b28"];
  const palette = currentMode === "day" ? dayColors : nightColors;

  return material.pbr({
    color: palette[index % palette.length],
    roughness: 0.58,
    metallic: index % 4 === 0 ? 0.16 : 0.05
  });
}

function windowMaterial(index: number, currentMode: Mode) {
  if (currentMode === "night") {
    const colors = ["#ffd36f", "#fff0b0", "#75d9ff", "#ff9d5c"];
    const color = colors[index % colors.length];

    return material.emissive({ color, emissive: color, roughness: 0.18 });
  }

  return material.pbr({
    color: index % 2 === 0 ? "#dbeafe" : "#b7d6e9",
    roughness: 0.2,
    metallic: 0.14
  });
}

function addWindowRows(
  nodes: AuraSceneNode[],
  x: number,
  z: number,
  width: number,
  height: number,
  index: number,
  currentMode: Mode
) {
  const floors = Math.max(3, Math.floor(height / 0.24));
  const columns = width > 0.66 ? 3 : 2;
  const startX = x - (columns - 1) * 0.14;

  for (let floor = 0; floor < floors; floor += 1) {
    for (let column = 0; column < columns; column += 1) {
      if ((floor + column + index) % 5 === 0 && currentMode === "night") {
        continue;
      }

      nodes.push(
        primitives
          .box({
            name: `window ${index + 1}-${floor + 1}-${column + 1}`,
            material: windowMaterial(index + floor + column, currentMode)
          })
          .position(startX + column * 0.14, 0.22 + floor * 0.24, z + 0.32)
          .scale([0.07, 0.07, 0.025])
          .toJSON()
      );
    }
  }

  for (let floor = 1; floor < floors; floor += 2) {
    nodes.push(
      primitives
        .box({
          name: `side window band ${index + 1}-${floor}`,
          material: windowMaterial(index + floor + 7, currentMode)
        })
        .position(x + width * 0.52, 0.2 + floor * 0.24, z)
        .rotate(0, 1.5708, 0)
        .scale([0.26, 0.052, 0.022])
        .toJSON()
    );
  }
}

function createBuildingNodes(currentMode: Mode): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];

  buildingLayout.forEach(([x, z, width, height], index) => {
    nodes.push(
      primitives
        .box({
          name: `procedural varied-height building ${index + 4}`,
          material: buildingMaterial(index, currentMode)
        })
        .position(x, height / 2, z)
        .scale([width, height, 0.62])
        .toJSON()
    );

    nodes.push(
      primitives
        .box({
          name: `roof cap ${index + 4}`,
          material: material.pbr({
            color: currentMode === "day" ? "#384452" : "#0b111b",
            roughness: 0.5,
            metallic: 0.12
          })
        })
        .position(x, height + 0.035, z)
        .scale([width * 0.88, 0.07, 0.5])
        .toJSON()
    );

    addWindowRows(nodes, x, z, width, height, index, currentMode);
  });

  return nodes;
}

function createStreetNodes(currentMode: Mode): AuraSceneNode[] {
  const asphalt = material.pbr({
    color: currentMode === "day" ? "#2e3338" : "#070b12",
    roughness: currentMode === "day" ? 0.68 : 0.24,
    metallic: currentMode === "day" ? 0.02 : 0.2
  });
  const curb = material.pbr({ color: currentMode === "day" ? "#9aa0a6" : "#2a3038", roughness: 0.6 });

  return [
    primitives.plane({ name: "full city block asphalt ground", material: asphalt }).position(0, -0.06, -0.52).scale([8.4, 1, 5.7]).toJSON(),
    primitives.box({ name: "north-south street", material: asphalt }).position(0, 0.005, -0.55).scale([0.95, 0.035, 5.6]).toJSON(),
    primitives.box({ name: "east-west street", material: asphalt }).position(0, 0.01, -0.05).scale([8.2, 0.035, 0.78]).toJSON(),
    primitives.box({ name: "yellow center line north", material: material.emissive({ color: "#f4d35e", emissive: "#f4d35e" }) }).position(-0.08, 0.04, -1.72).scale([0.05, 0.025, 1.55]).toJSON(),
    primitives.box({ name: "yellow center line south", material: material.emissive({ color: "#f4d35e", emissive: "#f4d35e" }) }).position(0.08, 0.04, 1.18).scale([0.05, 0.025, 1.55]).toJSON(),
    primitives.box({ name: "crosswalk left stripe 1", material: material.emissive({ color: "#f7f8f8", emissive: "#f7f8f8" }) }).position(-0.55, 0.05, -0.55).scale([0.08, 0.025, 0.58]).toJSON(),
    primitives.box({ name: "crosswalk left stripe 2", material: material.emissive({ color: "#f7f8f8", emissive: "#f7f8f8" }) }).position(-0.75, 0.05, -0.55).scale([0.08, 0.025, 0.58]).toJSON(),
    primitives.box({ name: "crosswalk right stripe 1", material: material.emissive({ color: "#f7f8f8", emissive: "#f7f8f8" }) }).position(0.55, 0.05, -0.55).scale([0.08, 0.025, 0.58]).toJSON(),
    primitives.box({ name: "crosswalk right stripe 2", material: material.emissive({ color: "#f7f8f8", emissive: "#f7f8f8" }) }).position(0.75, 0.05, -0.55).scale([0.08, 0.025, 0.58]).toJSON(),
    primitives.box({ name: "left sidewalk curb", material: curb }).position(-1.02, 0.045, -0.55).scale([0.08, 0.08, 5.55]).toJSON(),
    primitives.box({ name: "right sidewalk curb", material: curb }).position(1.02, 0.045, -0.55).scale([0.08, 0.08, 5.55]).toJSON(),
    primitives.box({ name: "front sidewalk curb", material: curb }).position(0, 0.045, 0.42).scale([8.2, 0.08, 0.08]).toJSON(),
    primitives.box({ name: "back sidewalk curb", material: curb }).position(0, 0.045, -0.55).scale([8.2, 0.08, 0.08]).toJSON()
  ];
}

function createStreetLightNodes(currentMode: Mode): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  const lampPositions = [
    [-0.72, 0.58],
    [0.72, 0.58],
    [-0.72, -1.32],
    [0.72, -1.32],
    [-3.7, -0.15],
    [3.72, -0.15],
    [-3.7, -2.45],
    [3.72, 1.05]
  ] as const;
  const glowColor = currentMode === "night" ? "#ffd889" : "#fff4c4";

  lampPositions.forEach(([x, z], index) => {
    nodes.push(
      primitives
        .cylinder({
          name: `street light pole ${index + 1}`,
          material: material.metal({ color: currentMode === "day" ? "#59626b" : "#252c35", roughness: 0.35 })
        })
        .position(x, 0.43, z)
        .scale([0.035, 0.86, 0.035])
        .toJSON()
    );
    nodes.push(
      primitives
        .sphere({
          name: `visible glowing street light ${index + 1}`,
          material:
            currentMode === "night"
              ? material.emissive({ color: glowColor, emissive: glowColor })
              : material.pbr({ color: glowColor, roughness: 0.28 })
        })
        .position(x, 0.91, z)
        .scale(0.105)
        .toJSON()
    );

    if (currentMode === "night") {
      nodes.push(
        lights
          .point({
            name: `street light warm pool ${index + 1}`,
            color: glowColor,
            intensity: 0.75,
            position: [x, 0.96, z]
          })
          .toJSON()
      );
    }
  });

  return nodes;
}

function buildScene(currentMode: Mode) {
  const sky = currentMode === "day" ? "#9ed4ff" : "#050914";

  return scene()
    .background(sky)
    .addMany(prefabs.cityBlock({ blocks: 3, litWindows: currentMode === "night" }))
    .addMany(createStreetNodes(currentMode))
    .addMany(createBuildingNodes(currentMode))
    .addMany(createStreetLightNodes(currentMode))
    .add(lights.ambient({ color: currentMode === "day" ? "#e9f5ff" : "#40577d", intensity: currentMode === "day" ? 0.82 : 0.2 }))
    .add(
      lights.directional({
        name: currentMode === "day" ? "low afternoon sun" : "cool moonlight",
        color: currentMode === "day" ? "#fff0c7" : "#7da7ff",
        intensity: currentMode === "day" ? 1.35 : 0.34,
        position: currentMode === "day" ? [-3.5, 5.4, 2.8] : [2.3, 4.8, 1.5]
      })
    )
    .add(effects.fog({ color: currentMode === "day" ? "#cfeaff" : "#080f1e", density: currentMode === "day" ? 0.025 : 0.055 }))
    .add(effects.bloom({ intensity: currentMode === "day" ? 0.08 : 0.38, color: currentMode === "day" ? "#ffffff" : "#ffd889" }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 6.2, position: [4.8, 3.2, 5.2], target: [0, 0.78, -0.55], fov: 48 }));
}

function render() {
  app?.dispose();
  document.querySelector("#app")?.replaceChildren();
  app = createAuraApp("#app", {
    diagnostics: false,
    pixelRatio: Math.min(window.devicePixelRatio, 2),
    scene: buildScene(mode)
  });

  document.body.dataset.mode = mode;
  const status = document.querySelector<HTMLElement>("[data-status]");
  if (status) {
    status.textContent = mode === "day" ? "Day lighting" : "Night lighting";
  }
}

function installInterface() {
  const style = document.createElement("style");
  style.textContent = `
    :root {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #050914;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-width: 320px;
      min-height: 100vh;
      overflow: hidden;
      background: #050914;
    }

    #app {
      position: fixed;
      inset: 0;
    }

    canvas {
      width: 100%;
      height: 100%;
      display: block;
    }

    .hud {
      position: fixed;
      top: 18px;
      left: 18px;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      background: rgba(6, 10, 18, 0.68);
      color: #f8fafc;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.24);
      backdrop-filter: blur(10px);
    }

    .hud__label {
      display: grid;
      gap: 2px;
      min-width: 112px;
      line-height: 1.1;
    }

    .hud__title {
      font-size: 13px;
      font-weight: 700;
    }

    .hud__status {
      color: #cbd5e1;
      font-size: 12px;
    }

    .toggle {
      position: relative;
      width: 66px;
      height: 34px;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.32);
      border-radius: 999px;
      background: linear-gradient(90deg, #7fc8ff, #f7cf67);
      cursor: pointer;
    }

    .toggle::after {
      content: "";
      position: absolute;
      top: 4px;
      left: 5px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #fff7d2;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
      transition: transform 160ms ease, background 160ms ease;
    }

    body[data-mode="night"] .toggle {
      background: linear-gradient(90deg, #07111f, #223b68);
    }

    body[data-mode="night"] .toggle::after {
      transform: translateX(31px);
      background: #dbeafe;
    }

    @media (max-width: 540px) {
      .hud {
        top: 12px;
        left: 12px;
        gap: 9px;
        padding: 9px 10px;
      }

      .hud__label {
        min-width: 94px;
      }
    }
  `;
  document.head.append(style);

  const hud = document.createElement("div");
  hud.className = "hud";
  hud.innerHTML = `
    <div class="hud__label">
      <span class="hud__title">City Block</span>
      <span class="hud__status" data-status>Day lighting</span>
    </div>
    <button class="toggle" type="button" aria-label="Toggle day and night lighting"></button>
  `;
  document.body.append(hud);

  document.querySelector<HTMLButtonElement>(".toggle")?.addEventListener("click", () => {
    mode = mode === "day" ? "night" : "day";
    render();
  });
}

installInterface();
render();
