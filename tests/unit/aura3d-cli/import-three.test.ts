// B1 three.js asset bridge (`aura3d import-three`): headless shims, stable ids, emission, and one end-to-end
// regeneration run. The end-to-end case needs a local three install (tools/three-bridge: `npm install`); it is
// skipped when that folder has no node_modules, since three is never a dependency of @aura3d/cli.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { assignStableIds, retargetClipTracks } from "../../../packages/aura3d-cli/src/import-three/analyze";
import type { BridgeSceneData, CompatRow, ThreeObjectLike } from "../../../packages/aura3d-cli/src/import-three/contract";
import { emitBridgeModule, emitNativeSceneModule } from "../../../packages/aura3d-cli/src/import-three/emit";
import { encodePng, installHeadlessExportShims, seededRandom } from "../../../packages/aura3d-cli/src/import-three/headless";
import { convertShaderMaterial } from "../../../packages/aura3d-cli/src/import-three/shader";
import { material as auraMaterial } from "../../../packages/engine/src/agent-api/nodes/material";
// plain .mjs helper shared with the paired three.js page
import { seededRandom as browserSeededRandom } from "../../../tools/three-bridge/pages/seeded.mjs";

const THREE_DIR = resolve("tools/three-bridge/node_modules/three");

function node(name: string, children: ThreeObjectLike[] = [], userData: Record<string, unknown> = {}): ThreeObjectLike {
  const self = { type: "Object3D", name, visible: true, parent: null, children, userData } as unknown as ThreeObjectLike;
  for (const child of children) (child as { parent: ThreeObjectLike | null }).parent = self;
  return self;
}

describe("import-three headless runtime", () => {
  it("seeded random is deterministic and matches the browser copy used by the three.js page", () => {
    const a = seededRandom(7), b = seededRandom(7), c = browserSeededRandom(7);
    const seq = Array.from({ length: 16 }, () => a());
    expect(Array.from({ length: 16 }, () => b())).toEqual(seq);
    expect(Array.from({ length: 16 }, () => c())).toEqual(seq);
    expect(seq.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("encodes RGBA pixels as a valid PNG that round-trips", () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255, 10, 20, 30, 40]);
    const png = encodePng(2, 2, rgba);
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png.buffer);
    expect(view.getUint32(16)).toBe(2);
    expect(view.getUint32(20)).toBe(2);
    const idatLength = view.getUint32(33);
    const raw = inflateSync(png.slice(41, 41 + idatLength));
    expect(Array.from(raw)).toEqual([0, ...rgba.slice(0, 8), 0, ...rgba.slice(8)]);
  });

  it("installs FileReader/OffscreenCanvas shims only while exporting", async () => {
    const scope = globalThis as Record<string, unknown>;
    const hadReader = scope.FileReader !== undefined;
    const restore = installHeadlessExportShims();
    const Reader = scope.FileReader as new () => { result: unknown; onloadend: (() => void) | null; readAsArrayBuffer(b: Blob): void };
    const reader = new Reader();
    const done = new Promise<void>((r) => { reader.onloadend = () => r(); });
    reader.readAsArrayBuffer(new Blob([new Uint8Array([1, 2, 3])]));
    await done;
    expect(Array.from(new Uint8Array(reader.result as ArrayBuffer))).toEqual([1, 2, 3]);
    restore();
    expect(scope.FileReader !== undefined).toBe(hadReader);
  });
});

describe("import-three stable ids", () => {
  it("derives path ids, suffixes duplicates, sanitises explicit ids, and retargets clip tracks", () => {
    const wheelA = node("wheel"), wheelB = node("wheel");
    const car = node("Car Body", [wheelA, wheelB, node("")]);
    const lot = node("ignored", [node("tower")], { auraId: "lot.1/2" });
    const root = node("scene", [car, lot]);
    const rows: CompatRow[] = [];
    const renamed = new Map<string, string>();
    const ids = assignStableIds(root, rows, renamed);
    expect(ids).toEqual(["Car_Body", "Car_Body__wheel", "Car_Body__wheel_1", "Car_Body__object3d", "lot_1_2", "lot_1_2__tower"]);
    expect(wheelA.name).toBe("Car_Body__wheel");
    expect(wheelA.userData).toMatchObject({ auraId: "Car_Body__wheel", threeName: "wheel" });
    expect(rows).toEqual([]);
    // Same structure, same ids: what lets native edits survive regeneration.
    const again = node("scene", [node("Car Body", [node("wheel"), node("wheel"), node("")]), node("ignored", [node("tower")], { auraId: "lot.1/2" })]);
    expect(assignStableIds(again, [])).toEqual(ids);
    const clip = { tracks: [{ name: "wheel.quaternion" }, { name: "Car Body.position" }, { name: "unknown.scale" }] };
    expect(retargetClipTracks([clip], renamed)).toBe(2);
    expect(clip.tracks.map((t) => t.name)).toEqual(["Car_Body__wheel.quaternion", "Car_Body.position", "unknown.scale"]);
  });

  it("reports duplicate explicit ids instead of colliding", () => {
    const rows: CompatRow[] = [];
    const ids = assignStableIds(node("s", [node("a", [], { auraId: "x" }), node("b", [], { auraId: "x" })]), rows);
    expect(ids).toEqual(["x", "x~1"]);
    expect(rows[0]).toMatchObject({ status: "approximated", construct: "userData.auraId" });
  });
});

describe("import-three regenerate command", () => {
  it("records every non-default option and shell-quotes params", async () => {
    const { formatRegenerateCommand } = await import("../../../packages/aura3d-cli/src/import-three/run");
    expect(formatRegenerateCommand("recipes/car.mjs", "car", 1, {})).toBe("aura3d import-three recipes/car.mjs --name car --seed 1");
    expect(formatRegenerateCommand("recipes/car.mjs", "car", 2, { params: { paint: "#fff", label: "it's" }, outDir: "src/bridged", stageDir: "tmp/stage", license: "CC0-1.0", admit: false }))
      .toBe(`aura3d import-three recipes/car.mjs --name car --seed 2 --params '{"paint":"#fff","label":"it'\\''s"}' --out src/bridged --stage tmp/stage --license CC0-1.0 --no-admit`);
  }, 60_000);
});

describe("import-three packaging", () => {
  it("keeps three out of @aura3d/cli dependencies", () => {
    const pkg = JSON.parse(readFileSync("packages/aura3d-cli/package.json", "utf8")) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain("three");
  });
});

describe("import-three ShaderMaterial -> material.custom", () => {
  const vec = (x: number, y: number, z?: number) => (z === undefined ? { x, y, isVector2: true } : { x, y, z, isVector3: true });
  const shader = (fields: Record<string, unknown>) => ({ type: "ShaderMaterial", name: "glow", uuid: "u1", isShaderMaterial: true, ...fields }) as never;

  it("passes GLSL 1 ShaderMaterial source through with three built-ins, lowered to GLSL 3, and a valid spec", () => {
    const result = convertShaderMaterial(shader({
      vertexShader: "uniform float time;\nvarying vec2 vUv;\nvarying vec3 vNormal;\nvoid main() {\n  vUv = uv;\n  vNormal = normalize(normalMatrix * normal);\n  vec3 p = position + normal * 0.05 * sin(time);\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);\n}",
      fragmentShader: "uniform vec3 tint;\nuniform vec2 scale;\nuniform float time;\nvarying vec2 vUv;\nvarying vec3 vNormal;\nvoid main() {\n  float s = 0.5 + 0.5 * sin(vUv.x * scale.x + time);\n  gl_FragColor = vec4(tint * s, 1.0);\n}",
      uniforms: { time: { value: 0 }, tint: { value: { r: 1, g: 0.5, b: 0.25, isColor: true } }, scale: { value: vec(12, 4) } },
      side: 2, transparent: true, blending: 2, defines: { STEPS: 4, OFF: false }
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { vertex, fragment } = result.spec.glsl;
    expect(vertex).not.toMatch(/uniform float time|\bvarying\b|\btime\b/);
    expect(vertex).toContain("out vec2 vUv;");
    expect(vertex).toContain("sin(uTime)");
    expect(vertex).toContain("projectionMatrix * modelViewMatrix * vec4(p, 1.0)");
    expect(fragment).toContain("out highp vec4 a3dThreeFragColor;");
    expect(fragment).toContain("a3dThreeFragColor = vec4(tint * s, 1.0);");
    expect(fragment).not.toMatch(/uniform vec3 tint|gl_FragColor/);
    expect(result.spec.uniforms).toEqual({ tint: { type: "vec3", value: [1, 0.5, 0.25] }, scale: { type: "vec2", value: [12, 4] } });
    expect(result.spec).toMatchObject({ defines: { STEPS: 4 }, side: "double", transparent: true, blending: "additive" });
    expect(result.notes.join(" ")).toContain("Aura3D clock");
    // The engine accepts the spec as-is (synchronous material.custom validation).
    expect(auraMaterial.custom(result.spec as never).kind).toBe("custom");
  });

  it("drops a RawShaderMaterial's own built-in declarations so the prelude aliases bind", () => {
    const result = convertShaderMaterial(shader({
      type: "RawShaderMaterial", isRawShaderMaterial: true,
      vertexShader: "precision highp float;\nuniform mat4 modelViewMatrix;\nuniform mat4 projectionMatrix;\nattribute vec3 position;\nvoid main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "precision highp float;\nuniform float level;\nvoid main() { gl_FragColor = vec4(vec3(level), 1.0); }",
      uniforms: { level: { value: 0.75 } }
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.glsl.vertex).not.toMatch(/uniform mat4|attribute|\bin vec3 position/);
    expect(result.spec.glsl.vertex).toContain("precision highp float;");
    expect(result.spec.uniforms).toEqual({ level: { type: "f32", value: 0.75 } });
    expect(auraMaterial.custom(result.spec as never).kind).toBe("custom");
  });

  it("refuses what it cannot carry exactly, with reasons", () => {
    const refused = (fields: Record<string, unknown>) => {
      const result = convertShaderMaterial(shader({ vertexShader: "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }", fragmentShader: "void main() { gl_FragColor = vec4(1.0); }", ...fields }));
      expect(result.ok).toBe(false);
      return result.ok ? "" : result.reasons.join("; ");
    };
    expect(refused({ fragmentShader: "#include <common>\nvoid main() { gl_FragColor = vec4(1.0); }" })).toContain("#include");
    expect(refused({ fragmentShader: "uniform sampler2D map;\nvarying vec2 vUv;\nvoid main() { gl_FragColor = texture2D(map, vUv); }", uniforms: { map: { value: null } } })).toContain("sampler2D");
    expect(refused({ vertexShader: "attribute float offset;\nvoid main() { gl_Position = vec4(position * offset, 1.0); }" })).toContain('custom attribute "offset"');
    expect(refused({ lights: true })).toContain("lights: true");
    expect(refused({ fragmentShader: "uniform mat4 frame;\nvoid main() { gl_FragColor = frame[0]; }", uniforms: { frame: { value: { elements: [], isMatrix4: true } } } })).toContain('uniform "frame"');
  });
});

describe("import-three emission", () => {
  const data: BridgeSceneData = {
    name: "city-block",
    nodeIds: ["street", "sign"],
    hiddenNodeNames: ["sign"],
    materials: ["asphalt"],
    clips: [],
    customMaterials: [],
    lights: [{ kind: "directional", id: "sun", color: "#ffffff", intensity: 2.4, position: [-8, 14, 10], target: [0, 0, 0], shadow: true }],
    camera: { position: [14, 12, 18], target: [0, 1.5, 0], fov: 40, near: 0.1, far: 300 },
    background: "#b9c7d6",
    toneMapping: "aces",
    exposure: 1,
    castShadow: true,
    receiveShadow: true
  };

  it("emits a typed bridge module that keeps the authored output and hides unsupported nodes", () => {
    const src = emitBridgeModule(data, { assetKey: "city-block", assetsImport: "../aura-assets", regenerateCommand: "aura3d import-three x" });
    expect(src).toContain('model(assets["city-block"], {');
    expect(src).toContain('scaleMode: "world"');
    expect(src).toContain('cityBlockHiddenNodes: readonly CityBlockNodeId[] = ["sign"]');
    expect(src).toContain('lights.directional({ name: "sun", color: "#ffffff", intensity: 2.4, position: [-8, 14, 10], target: [0, 0, 0], shadow: true })');
    expect(src).toContain('camera.perspective({ position: [14, 12, 18], target: [0, 1.5, 0], fov: 40, near: 0.1, far: 300 })');
    expect(src).toContain('{ toneMapping: "aces", exposure: 1 }');
    expect(emitBridgeModule({ ...data, name: "car" }, { assetKey: "car", assetsImport: "../aura-assets", regenerateCommand: "x" })).toContain("model(assets.car, {");
    expect(src).not.toContain("materialOverrides: [");
  });

  it("installs carried shaders on their placeholder slots through materialOverrides", () => {
    const spec = { glsl: { vertex: "void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }\n", fragment: "out highp vec4 c;\nvoid main() { c = vec4(1.0); }\n" } };
    const src = emitBridgeModule({ ...data, customMaterials: [{ name: "neon", spec }] }, { assetKey: "city-block", assetsImport: "../aura-assets", regenerateCommand: "x" });
    expect(src).toContain('import { camera, lights, model, material, type AuraModelMaterialOverride');
    expect(src).toContain('"neon": material.custom({');
    expect(src).toContain("materialOverrides: [...cityBlockMaterialOverrides, ...(options.materialOverrides ?? [])]");
  });

  it("emits a native scene module that only imports the bridge module", () => {
    const src = emitNativeSceneModule(data);
    expect(src).toContain('from "./city-block.bridge"');
    expect(src).toContain("export function mountCityBlock(");
  });
});

describe.skipIf(!existsSync(THREE_DIR))("import-three end to end (local three install)", () => {
  it("exports deterministically, reports unsupported constructs, and preserves native edits across regeneration", async () => {
    const { importThree } = await import("../../../packages/aura3d-cli/src/import-three/run");
    const dir = mkdtempSync(join(tmpdir(), "a3d-import-three-"));
    try {
      writeFileSync(join(dir, "recipe.mjs"), `
export const params = { count: 3 };
export default function createScene({ THREE, random, params }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#336699");
  const mat = new THREE.MeshStandardMaterial({ name: "stone", color: "#888888" });
  for (let i = 0; i < params.count; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1 + random(), 1), mat);
    m.name = "block";
    m.position.x = i * 2;
    scene.add(m);
  }
  const hidden = new THREE.Mesh(new THREE.SphereGeometry(0.5), mat);
  hidden.name = "spare";
  hidden.visible = false;
  scene.add(hidden);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ name: "neon" }));
  sign.name = "sign";
  scene.add(sign);
  const chunky = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ name: "chunks", fragmentShader: "#include <common>\\nvoid main() { gl_FragColor = vec4(1.0); }" }));
  chunky.name = "chunky";
  scene.add(chunky);
  const sun = new THREE.DirectionalLight("#ffffff", 2);
  sun.position.set(1, 3, 2);
  scene.add(sun);
  const lamp = new THREE.PointLight("#ffcc88", 3);
  lamp.name = "lamp";
  lamp.position.set(0, 2, 0);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1), mat);
  bulb.name = "bulb";
  lamp.add(bulb);
  scene.add(lamp);
  const off = new THREE.SpotLight("#ff0000", 50);
  off.name = "off";
  off.visible = false;
  scene.add(off);
  const clip = new THREE.AnimationClip("bob", 1, [new THREE.VectorKeyframeTrack("block.position", [0, 1], [0, 0, 0, 0, 1, 0])]);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  camera.position.set(4, 4, 8);
  return { scene, camera, cameraTarget: [2, 0, 0], clips: [clip], assets: [Promise.resolve()] };
}
`);
      const first = await importThree({ projectDir: dir, factory: "recipe.mjs", name: "blocks", seed: 3, threeDir: THREE_DIR });
      expect(first.admitted).toBe(true);
      // The default ShaderMaterial (three's built-in pass-through shaders) is carried as material.custom; the
      // chunk-including one is refused and its mesh hidden.
      expect(first.data.hiddenNodeNames).toEqual(["spare", "chunky"]);
      expect(first.data.clips).toEqual(["bob"]);
      expect(first.data.customMaterials.map((m) => m.name)).toEqual(["neon"]);
      expect(first.rows.some((r) => r.status === "unsupported" && r.construct === "ShaderMaterial" && r.subject === "chunks")).toBe(true);
      // A hidden light is not emitted (three does not light with it); a light's child mesh still exports.
      expect(first.data.lights.map((l) => l.kind)).toEqual(["directional", "point"]);
      expect(first.data.hiddenNodeNames).not.toContain("off");
      expect(readFileSync(join(dir, "src/aura-assets.ts"), "utf8")).toContain('"blocks"');
      const glb = readFileSync(first.glbPath);
      expect(glb.subarray(0, 4).toString("latin1")).toBe("glTF");
      const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8")) as { nodes: { name: string }[]; animations?: { channels: unknown[] }[]; extensionsUsed?: string[] };
      expect(json.nodes.map((n) => n.name)).toContain("spare");
      expect(json.nodes.map((n) => n.name)).not.toContain("sun");
      expect(json.nodes.map((n) => n.name)).toEqual(expect.arrayContaining(["lamp", "lamp__bulb"]));
      expect(json.nodes.map((n) => n.name)).not.toContain("off");
      expect((json as { materials?: { name?: string }[] }).materials?.map((m) => m.name)).toContain("neon");
      expect(json.animations?.[0]?.channels.length).toBe(1);

      const sceneFile = first.sceneModule;
      const edited = readFileSync(sceneFile, "utf8").replace(".add(blocksModel())", '.add(blocksModel({ hiddenNodeNames: ["block_1"] }))');
      writeFileSync(sceneFile, edited);
      const second = await importThree({ projectDir: dir, factory: "recipe.mjs", name: "blocks", seed: 3, threeDir: THREE_DIR });
      expect(second.glbSha256).toBe(first.glbSha256);
      expect(second.sceneModuleWritten).toBe(false);
      expect(readFileSync(sceneFile, "utf8")).toBe(edited);
      expect(second.ids).toEqual({ kept: first.data.nodeIds.length, added: [], removed: [] });

      const third = await importThree({ projectDir: dir, factory: "recipe.mjs", name: "blocks", seed: 3, params: { count: 2 }, threeDir: THREE_DIR });
      expect(third.glbSha256).not.toBe(first.glbSha256);
      expect(third.ids.removed).toEqual(["block_2"]);
      expect(readFileSync(sceneFile, "utf8")).toBe(edited);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

});
