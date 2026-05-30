import {
  camera,
  createAuraApp,
  createAuraRouteHealthSnapshot,
  effects,
  lights,
  material,
  primitives,
  scene,
  timeline,
  type AuraSceneNode
} from "@aura3d/engine";

const neonCyan = "#36f6ff";
const neonPink = "#ff3ef5";
const neonAmber = "#ffd166";
const tunnelBlue = "#07111f";
const deepViolet = "#0b0620";

function panelRing(z: number, ringIndex: number): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  const segments = 18;
  const radius = 1.72 + Math.sin(ringIndex * 0.42) * 0.1;

  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const hot = (index + ringIndex) % 4 === 0;
    const accent = (index + ringIndex * 2) % 7 === 0;
    const color = hot ? neonCyan : accent ? neonPink : index % 2 === 0 ? tunnelBlue : deepViolet;

    nodes.push(
      primitives
        .box({
          name: hot || accent ? `emissive tunnel segment ${ringIndex}-${index}` : `dark tube panel ${ringIndex}-${index}`,
          material:
            hot || accent
              ? material.emissive({ color, emissive: color, roughness: 0.16, metallic: 0.2 })
              : material.pbr({ color, roughness: 0.48, metallic: 0.18 })
        })
        .position(x, y, z)
        .rotate(0, 0, angle)
        .scale([0.52, hot || accent ? 0.06 : 0.09, 0.2])
        .toJSON()
    );
  }

  return nodes;
}

function longitudinalRibs(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];
  const ribs = 12;

  for (let index = 0; index < ribs; index += 1) {
    const angle = (index / ribs) * Math.PI * 2 + Math.PI / ribs;
    const radius = 1.54;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const color = index % 3 === 0 ? neonCyan : index % 3 === 1 ? neonPink : neonAmber;

    nodes.push(
      primitives
        .box({
          name: `continuous neon guide rib ${index + 1}`,
          material: material.emissive({ color, emissive: color, roughness: 0.18, metallic: 0.12 })
        })
        .position(x, y, -6.8)
        .rotate(0, 0, angle)
        .scale([0.08, 0.08, 20.5])
        .toJSON()
    );
  }

  return nodes;
}

function centerDepthMarkers(): AuraSceneNode[] {
  const nodes: AuraSceneNode[] = [];

  for (let index = 0; index < 11; index += 1) {
    const z = 3.5 - index * 1.7;
    const color = index % 2 === 0 ? neonCyan : neonPink;

    nodes.push(
      primitives
        .sphere({
          name: `distant bloom haze marker ${index + 1}`,
          material: material.emissive({ color, emissive: color, roughness: 0.2 })
        })
        .position(Math.sin(index * 1.7) * 0.28, Math.cos(index * 1.2) * 0.22, z)
        .scale(index < 3 ? 0.035 : 0.055)
        .toJSON()
    );
  }

  return nodes;
}

const tunnelNodes: AuraSceneNode[] = [
  ...longitudinalRibs(),
  ...centerDepthMarkers()
];

for (let ringIndex = 0; ringIndex < 17; ringIndex += 1) {
  tunnelNodes.push(...panelRing(4.2 - ringIndex * 1.28, ringIndex));
}

const neonTunnelScene = scene()
  .background("#01030a")
  .addMany(tunnelNodes)
  .add(lights.ambient({ intensity: 0.045, color: "#6bdfff" }))
  .add(lights.point({ name: "cyan glow spilling from near ring", position: [0.4, 0.2, 2.8], color: neonCyan, intensity: 2.7 }))
  .add(lights.point({ name: "magenta depth pulse", position: [-0.55, -0.35, -4.2], color: neonPink, intensity: 3.2 }))
  .add(lights.point({ name: "warm far tunnel flare", position: [0.3, 0.55, -12.5], color: neonAmber, intensity: 1.7 }))
  .add(effects.fog({ density: 0.18, color: "#172642" }))
  .add(effects.bloom({ intensity: 0.62, color: "#72f8ff" }))
  .camera(
    camera.dolly({
      from: [0.18, 0.02, 5.1],
      to: [-0.18, 0.1, -7.3],
      target: [0, 0, -12.5],
      seconds: 8,
      fov: 72
    })
  )
  .timeline(timeline.loop({ seconds: 8 }))
  .diagnostics(true);

const app = createAuraApp("#app", {
  diagnostics: { overlay: true, performancePanel: true },
  pixelRatio: 1.5,
  scene: neonTunnelScene
});

console.log("Neon tunnel flythrough runtime evidence", {
  routeHealth: createAuraRouteHealthSnapshot(app),
  cameraAnimation: {
    mode: "dolly",
    seconds: 8,
    from: [0.18, 0.02, 5.1],
    to: [-0.18, 0.1, -7.3],
    target: [0, 0, -12.5]
  },
  visualEvidence: [
    "procedural tube interior built from repeated ring panels",
    "emissive cyan, magenta, and amber segments line the tunnel",
    "bloom effect is enabled for glow",
    "fog density creates depth falloff through the tunnel"
  ]
});
