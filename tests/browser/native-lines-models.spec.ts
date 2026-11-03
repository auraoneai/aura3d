import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createServer, type Plugin, type ViteDevServer } from "vite";
import { installedAuraPackageAliases } from "./installed-package-resolve";

// The fixture is authored here, rather than imported from another engine or a
// network service. It has one square with two named glTF material variants.
function modelFixture(): Buffer {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const binary = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)]);
  const document = {
    asset: { version: "2.0", generator: "Aura3D native model options test" },
    extensionsUsed: ["KHR_materials_unlit", "KHR_materials_variants"],
    extensions: { KHR_materials_variants: { variants: [{ name: "blue" }] } },
    buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }, { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [-1, -1, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 6, type: "SCALAR" }
    ],
    materials: [
      { name: "red", pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] }, extensions: { KHR_materials_unlit: {} } },
      { name: "blue", pbrMetallicRoughness: { baseColorFactor: [0, 0, 1, 1] }, extensions: { KHR_materials_unlit: {} } }
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0, extensions: { KHR_materials_variants: { mappings: [{ material: 1, variants: [0] }] } } }] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
  };
  const rawJson = Buffer.from(JSON.stringify(document));
  const json = Buffer.concat([rawJson, Buffer.alloc((4 - rawJson.length % 4) % 4, 0x20)]);
  const data = Buffer.concat([binary, Buffer.alloc((4 - binary.length % 4) % 4)]);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + data.length, 8);
  const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(json.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const dataHeader = Buffer.alloc(8); dataHeader.writeUInt32LE(data.length, 0); dataHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, json, dataHeader, data]);
}

const glb = modelFixture();
const digest = createHash("sha256").update(glb).digest("hex");
const fixture = `
import { camera, createAuraApp, defineAuraAssets, lines, material, model, scene } from "@aura3d/engine";
const stage = document.querySelector("#stage");
const assets = defineAuraAssets({ square: { type: "model", format: "glb", url: "/native-model-options.glb", hash: "sha256-${digest}", bounds: [2,2,0.01] } });
const cameraFor = () => camera.orthographic({ position: [0, 0, 5], target: [0, 0, 0], orthographicSize: 2, near: 0.1, far: 20 });
async function pixels(app) {
  app.step(0);
  const image = await app.capture({ type: "image-bitmap" });
  const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("2D readback unavailable");
  context.drawImage(image, 0, 0); image.close();
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let red = 0, blue = 0, purple = 0, colored = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r,g,b] = [data[i],data[i+1],data[i+2]];
    if (r > 40 && r > 1.3*b && r > 1.3*g) red++;
    if (b > 40 && b > 1.3*r && b > 1.3*g) blue++;
    if (r > 40 && b > 40 && g < Math.min(r,b)*0.7) purple++;
    if (Math.max(r,g,b) > 40) colored++;
  }
  return { red, blue, purple, colored, drawCalls: app.diagnostics().drawCalls, errors: app.diagnostics().errors };
}
async function draw(node, options = {}) {
  stage.replaceChildren(); stage.style.width = (options.width || 192) + "px"; stage.style.height = (options.height || 192) + "px";
  const app = createAuraApp(stage, { autoStart: false, resize: false, pixelRatio: options.dpr || 1,
    qualityRebuild: { flags: ["A3D_PARITY_LINES"], allowUrlFlags: false },
    scene: scene({ camera: cameraFor(), background: "#000000" }).add(node) });
  try { await app.ready(); return await pixels(app); } finally { await app.disposeAsync(); }
}
window.__auraNativeLinesModels = {
  line: (world, dashed, dpr) => draw(lines.fat({ points: [[-1.4,0,0],[0,0,0],[1.4,0,0]], colors: ["#ff0000", "#ffffff", "#0000ff"],
    width: world ? 0.16 : 8, worldUnits: world, ...(dashed ? { dashed: true, dashSize: 0.3, gapSize: 0.2 } : {}),
    material: material.emissive({ color: "#ffffff", emissive: "#ffffff" }) }), { dpr }),
  model: (kind) => draw(model(assets.square, { scaleMode: "world", ...(kind === "variant" ? { variant: "blue" } : {}),
    ...(kind === "custom" ? { material: material.custom({ glsl: { fragment: "out vec4 outColor; void main(){outColor=vec4(1.0,0.0,1.0,1.0);}" }, side: "double" }) } : {}) })),
  mutate: async () => {
    stage.replaceChildren();
    const app = createAuraApp(stage, { autoStart: false, resize: false, pixelRatio: 1,
      qualityRebuild: { flags: ["A3D_PARITY_LINES"], allowUrlFlags: false },
      scene: scene({ camera: cameraFor(), background: "#000000" }).add(lines.fat({ name: "mutable", points: [[-1,0,0],[1,0,0]], width: 10, colors: ["#ff0000","#0000ff"] }).runtime({ id: "mutable" })) });
    try { await app.ready(); const before = await pixels(app); app.nodes.require("mutable").setGeometry({ positions: [[-1,0,0],[1,1,0]] });
      const after = await pixels(app); return { before, after }; } finally { await app.disposeAsync(); }
  }
};
`;

let server: ViteDevServer;
let origin: string;
test.beforeAll(async () => {
  const aliases = installedAuraPackageAliases();
  if (!process.env.A3D_INSTALLED_PACKAGE_ROOT) throw new Error("A3D_INSTALLED_PACKAGE_ROOT must name the validated packed candidate");
  const plugin: Plugin = {
    name: "native-lines-models-fixture",
    resolveId: (id) => id === "virtual:native-lines-models" ? "\0native-lines-models" : undefined,
    load: (id) => id === "\0native-lines-models" ? fixture : undefined,
    configureServer(dev) {
      dev.middlewares.use("/native-model-options.glb", (_request, response) => { response.setHeader("Content-Type", "model/gltf-binary"); response.end(glb); });
      dev.middlewares.use("/native-lines-models.html", (_request, response) => { response.setHeader("Content-Type", "text/html"); response.end('<style>html,body{margin:0}#stage{width:192px;height:192px}</style><div id="stage"></div><script type="module" src="/@id/__x00__native-lines-models"></script>'); });
    }
  };
  server = await createServer({ configFile: false, root: process.cwd(), logLevel: "error", resolve: { alias: [...aliases] }, plugins: [plugin] });
  await server.listen(0);
  origin = server.resolvedUrls?.local[0] ?? "";
  if (!origin) throw new Error("Fixture server has no local origin");
});
test.afterAll(async () => { await server?.close(); });

type Frame = { red: number; blue: number; purple: number; colored: number; drawCalls: number; errors: string[] };
type Fixture = { line(world: boolean, dashed: boolean, dpr: number): Promise<Frame>; model(kind: string): Promise<Frame>; mutate(): Promise<{ before: Frame; after: Frame }> };

test("world and pixel width lines show gradients and continuous dashes", async ({ page }) => {
  await page.goto(`${origin}native-lines-models.html`);
  await page.waitForFunction(() => Boolean((window as unknown as { __auraNativeLinesModels?: unknown }).__auraNativeLinesModels));
  const result = await page.evaluate(async () => {
    const h = (window as unknown as { __auraNativeLinesModels: Fixture }).__auraNativeLinesModels;
    return { screen: await h.line(false, false, 1), screenDpr2: await h.line(false, false, 2), world: await h.line(true, false, 1), dashed: await h.line(true, true, 1), mutation: await h.mutate() };
  });
  for (const frame of [result.screen, result.screenDpr2, result.world, result.dashed, result.mutation.before, result.mutation.after]) {
    expect(frame.errors).toEqual([]); expect(frame.drawCalls).toBeGreaterThan(0);
  }
  expect(result.world.red).toBeGreaterThan(20); expect(result.world.blue).toBeGreaterThan(20);
  expect(result.dashed.colored).toBeLessThan(result.world.colored * 0.9);
  expect(result.dashed.colored).toBeGreaterThan(result.world.colored * 0.2);
  expect(result.screenDpr2.colored / result.screen.colored).toBeGreaterThan(3);
  expect(result.screenDpr2.colored / result.screen.colored).toBeLessThan(5);
  expect(result.mutation.after.colored).not.toBe(result.mutation.before.colored);
});

test("imported variant and custom shader change visible model pixels", async ({ page }) => {
  await page.goto(`${origin}native-lines-models.html`);
  await page.waitForFunction(() => Boolean((window as unknown as { __auraNativeLinesModels?: unknown }).__auraNativeLinesModels));
  const result = await page.evaluate(async () => {
    const h = (window as unknown as { __auraNativeLinesModels: Fixture }).__auraNativeLinesModels;
    return { base: await h.model("base"), variant: await h.model("variant"), custom: await h.model("custom") };
  });
  for (const frame of Object.values(result)) { expect(frame.errors).toEqual([]); expect(frame.drawCalls).toBeGreaterThan(0); }
  expect(result.base.red).toBeGreaterThan(300);
  expect(result.variant.blue).toBeGreaterThan(300);
  expect(result.custom.purple).toBeGreaterThan(300);
});
