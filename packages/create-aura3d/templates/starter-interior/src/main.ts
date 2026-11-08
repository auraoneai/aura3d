// Starter: interior scene. A furnished living room under the `interior-warm` look (warm key with full shadows,
// interior fill, soft haze and a warm grade as one unit), plus one practical: a floor lamp with a real point light.
// Architecture is layout (floor, walls, window frame); furniture uses the named surface materials
// (fabric, lacquer, brushed metal, ceramic, felt, glass) so each reads as its material, not as grey plastic.
// Move or restyle the pieces, keep the look, the lamp light and the camera. Real props: `npx @aura3d/cli@latest assets resolve "<object>"`.
import { camera, createAuraApp, group, instances, interactions, lights, looks, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

const LOOK_ID = "interior-warm" as const;
const W = 7, D = 6, H = 3; // room width (x), depth (z) and height in metres

const plaster = material.pbr({ color: "#d9cbb5", roughness: 0.92 });
const oak = material.lacquer({ color: "#8a5a35", roughness: 0.38 });
const darkWood = material.lacquer({ color: "#4a2f1d", roughness: 0.45 });
const steel = material.brushedMetal({ color: "#b8b2a8" });
const sofaFabric = material.fabric({ color: "#2f5d62" });
const cushion = material.fabric({ color: "#d98e48" });

// Back wall with a window opening (1.8 m x 1.4 m): four wall blocks around the hole, a frame and a glass pane.
const backWall = group("back wall", [
  primitives.box({ name: "wall left", size: [3.6, H, 0.2], material: plaster }).position(-1.7, H / 2, 0),
  primitives.box({ name: "wall right", size: [1.6, H, 0.2], material: plaster }).position(2.7, H / 2, 0),
  primitives.box({ name: "wall under window", size: [1.8, 1, 0.2], material: plaster }).position(1, 0.5, 0),
  primitives.box({ name: "wall over window", size: [1.8, 0.6, 0.2], material: plaster }).position(1, H - 0.3, 0),
  primitives.box({ name: "window sill", size: [2, 0.06, 0.34], material: oak }).position(1, 1.02, 0.06),
  primitives.box({ name: "window mullion", size: [0.06, 1.4, 0.08], material: darkWood }).position(1, 1.7, 0),
  primitives.box({ name: "window glass", size: [1.8, 1.4, 0.02], material: material.glass({ color: "#cfe6ff" }) }).position(1, 1.7, 0),
  primitives.plane({ name: "view outside", size: [6, 1, 2.6], material: material.emissive({ color: "#bcd9f2", emissive: "#a8cdf0", emissiveIntensity: 1.2 }) }).position(1, 1.8, -1.6).rotate(Math.PI / 2, 0, 0)
], { position: [0, 0, -D / 2] });

// Sofa from rounded boxes: seat, back, two arms, two cushions.
const sofa = group("sofa", [
  primitives.roundedBox({ name: "sofa seat", size: [2.2, 0.42, 0.95], material: sofaFabric }).position(0, 0.32, 0),
  primitives.roundedBox({ name: "sofa back", size: [2.2, 0.62, 0.24], material: sofaFabric }).position(0, 0.72, -0.38),
  primitives.roundedBox({ name: "sofa arm left", size: [0.24, 0.56, 0.95], material: sofaFabric }).position(-1.1, 0.5, 0),
  primitives.roundedBox({ name: "sofa arm right", size: [0.24, 0.56, 0.95], material: sofaFabric }).position(1.1, 0.5, 0),
  primitives.roundedBox({ name: "cushion a", size: [0.5, 0.42, 0.14], material: cushion }).position(-0.6, 0.72, -0.2).rotate(-0.2, 0.15, 0),
  primitives.roundedBox({ name: "cushion b", size: [0.5, 0.42, 0.14], material: material.fabric({ color: "#e8dcc6" }) }).position(0.62, 0.72, -0.2).rotate(-0.2, -0.2, 0)
], { position: [-W / 2 + 0.6, 0, -0.2], rotation: [0, Math.PI / 2, 0] });

const table = group("coffee table", [
  primitives.roundedBox({ name: "table top", size: [1.2, 0.06, 0.7], material: oak }).position(0, 0.42, 0),
  ...[[-0.5, -0.27], [0.5, -0.27], [-0.5, 0.27], [0.5, 0.27]].map(([x, z], i) =>
    primitives.cylinder({ name: `table leg ${i}`, size: [0.04, 0.4, 0.04], material: steel }).position(x!, 0.2, z!)),
  primitives.cylinder({ name: "vase", size: [0.16, 0.3, 0.16], material: material.ceramic({ color: "#e9e4da" }), params: { radiusTop: 0.6, radiusBottom: 1 } }).position(-0.3, 0.6, 0.05),
  primitives.box({ name: "book stack", size: [0.3, 0.08, 0.22], material: material.pbr({ color: "#7a2e2a", roughness: 0.7 }) }).position(0.25, 0.49, -0.05).rotate(0, 0.3, 0)
], { position: [-0.9, 0, -0.1] });

// Floor lamp: metal pole, glowing shade and the real light that warms the corner and casts soft shadows.
const lamp = group("floor lamp", [
  primitives.cylinder({ name: "lamp base", size: [0.36, 0.04, 0.36], material: steel }).position(0, 0.02, 0),
  primitives.cylinder({ name: "lamp pole", size: [0.04, 1.5, 0.04], material: steel }).position(0, 0.77, 0),
  primitives.cylinder({ name: "lamp shade", size: [0.44, 0.34, 0.44], params: { radiusTop: 0.7, openEnded: true }, material: material.emissive({ color: "#ffe2b0", emissive: "#ffc77a", emissiveIntensity: 2.2 }) }).position(0, 1.6, 0),
  lights.point({ name: "lamp light", position: [0, 1.55, 0], intensity: 9, color: "#ffb870", distance: 7, decay: 2, shadow: true })
], { position: [-W / 2 + 0.55, 0, -D / 2 + 0.6] });

// Bookshelf on the back wall: a frame plus one instanced draw of books with per-instance colours.
const books: AuraTransformSpec[] = [];
const bookColors: string[] = [];
const palette = ["#7a2e2a", "#2f5d62", "#c9a227", "#e8dcc6", "#3d3a5c", "#a4532c"];
for (let shelf = 0; shelf < 3; shelf += 1) for (let i = 0; i < 9; i += 1) {
  const h = 0.24 + ((i * 7 + shelf * 3) % 5) * 0.025;
  books.push({ position: [-0.62 + i * 0.15, 0.08 + shelf * 0.5 + h / 2, 0], scale: [0.11, h, 0.22] });
  bookColors.push(palette[(i + shelf * 2) % palette.length]!);
}
const shelf = group("bookshelf", [
  primitives.box({ name: "shelf back", size: [1.6, 1.6, 0.04], material: darkWood }).position(0, 0.8, -0.14),
  ...[0, 1, 2, 3].map((k) => primitives.box({ name: `shelf board ${k}`, size: [1.6, 0.04, 0.3], material: darkWood }).position(0, 0.06 + k * 0.5, 0)),
  instances.box({ name: "books", transforms: books, colors: bookColors, material: material.pbr({ color: "#ffffff", roughness: 0.75 }) })
], { position: [3.1 - 1.6 / 2 - 0.25, 0, -D / 2 + 0.28] });

// A potted plant: ceramic pot and an instanced crown of leaves.
const leaves: AuraTransformSpec[] = Array.from({ length: 22 }, (_, i) => {
  const a = i * 2.4, r = 0.12 + (i % 4) * 0.05, y = 0.62 + (i % 5) * 0.12;
  return { position: [Math.cos(a) * r, y, Math.sin(a) * r], rotation: [0.6 * Math.cos(a), a, 0.6 * Math.sin(a)], scale: [0.16, 0.05, 0.3] };
});
const plant = group("plant", [
  primitives.cylinder({ name: "pot", size: [0.4, 0.44, 0.4], params: { radiusBottom: 0.75 }, material: material.ceramic({ color: "#b5643c" }) }).position(0, 0.22, 0),
  instances.sphere({ name: "leaves", transforms: leaves, material: material.pbr({ color: "#3f7a35", roughness: 0.6 }) })
], { position: [2.75, 0, -D / 2 + 0.55] });

// Keep the 16:9 horizontal field of view on narrower (portrait) windows by widening the vertical one.
const fitFov = (fov: number): number => {
  const aspect = innerWidth / Math.max(1, innerHeight);
  if (aspect >= 16 / 9) return fov;
  const half = Math.atan(Math.tan((fov * Math.PI) / 360) * (16 / 9));
  return Math.min(80, (2 * Math.atan(Math.tan(half) / aspect) * 180) / Math.PI);
};

const app = createAuraApp("#app", {
  scene: scene()
    .add(looks.preset(LOOK_ID, { exposureEv: -0.8, fogDensityScale: 0.2, grade: { contrast: 1.1, saturation: 1.1 } }))
    .add(primitives.plane({ name: "floor", size: [W, 1, D + 3], material: material.lacquer({ color: "#6b4a30", roughness: 0.6 }), receiveShadow: true }).position(0, 0, 1.5))
    .add(primitives.plane({ name: "rug", size: [2.6, 1, 1.9], material: material.felt({ color: "#a4532c" }), receiveShadow: true }).position(-1.1, 0.005, 0))
    .add(primitives.box({ name: "ceiling", size: [W, 0.12, D + 3], material: plaster, castShadow: false }).position(0, H + 0.06, 1.5))
    .add(primitives.box({ name: "left wall", size: [0.2, H, D + 3], material: plaster }).position(-W / 2, H / 2, 1.5))
    .add(primitives.box({ name: "skirting", size: [W, 0.1, 0.03], material: darkWood }).position(0, 0.05, -D / 2 + 0.115))
    .add(backWall)
    .add(sofa)
    .add(table)
    .add(lamp)
    .add(shelf)
    .add(plant)
    .add(interactions.orbit({ target: "coffee table" }))
    .camera(camera.orbit({ position: [2.9, 1.75, 3.9], target: [-0.7, 0.9, -1.2], fov: fitFov(50) })),
  ...looks.appOptions(LOOK_ID)
});

(window as unknown as { __AURA3D_STARTER__?: unknown }).__AURA3D_STARTER__ = {
  starter: "interior",
  look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
  hero: { procedural: "living room from primitives and named surface materials", practicalLights: ["lamp light"] }
};

void app.ready().then(() => {
  const diagnostics = app.diagnostics();
  document.body.dataset.aura3dReady = "true";
  document.body.dataset.aura3dDrawCalls = String(diagnostics.drawCalls);
  (window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__ = { ready: true, diagnostics };
}).catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});
