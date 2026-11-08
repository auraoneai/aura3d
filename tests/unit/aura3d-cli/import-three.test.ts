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
// @ts-expect-error plain .mjs helper shared with the paired three.js page
import { seededRandom as browserSeededRandom } from "../../../tools/three-bridge/pages/seeded.mjs";

const THREE_DIR = resolve("tools/three-bridge/node_modules/three");

function node(name: string, children: ThreeObjectLike[] = [], userData: Record<string, unknown> = {}): ThreeObjectLike {
  const self = { type: "Object3D", name, visible: true, parent: null, children, userData } as unknown as ThreeObjectLike;
  for (const child of children) (child as { parent: ThreeObjectLike | null }).parent = self;
  return self;
}

describe("import-three headless runtime", () => {
  it("seeded random is deterministic and matches the browser copy used by the three.js page", () => {
    const a = seededRandom(7), b = seededRandom(7), c = (browserSeededRandom as (s: number) => () => number)(7);
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

describe("import-three packaging", () => {
  it("keeps three out of @aura3d/cli dependencies", () => {
    const pkg = JSON.parse(readFileSync("packages/aura3d-cli/package.json", "utf8")) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain("three");
  });
});

describe("import-three emission", () => {
  const data: BridgeSceneData = {
    name: "city-block",
    nodeIds: ["street", "sign"],
    hiddenNodeNames: ["sign"],
    materials: ["asphalt"],
    clips: [],
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
  const sun = new THREE.DirectionalLight("#ffffff", 2);
  sun.position.set(1, 3, 2);
  scene.add(sun);
  const clip = new THREE.AnimationClip("bob", 1, [new THREE.VectorKeyframeTrack("block.position", [0, 1], [0, 0, 0, 0, 1, 0])]);
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
  camera.position.set(4, 4, 8);
  return { scene, camera, cameraTarget: [2, 0, 0], clips: [clip], assets: [Promise.resolve()] };
}
`);
      const first = await importThree({ projectDir: dir, factory: "recipe.mjs", name: "blocks", seed: 3, threeDir: THREE_DIR });
      expect(first.admitted).toBe(true);
      expect(first.data.hiddenNodeNames).toEqual(["spare", "sign"]);
      expect(first.data.clips).toEqual(["bob"]);
      expect(first.rows.some((r) => r.status === "unsupported" && r.construct === "ShaderMaterial")).toBe(true);
      expect(first.data.lights).toHaveLength(1);
      expect(readFileSync(join(dir, "src/aura-assets.ts"), "utf8")).toContain('"blocks"');
      const glb = readFileSync(first.glbPath);
      expect(glb.subarray(0, 4).toString("latin1")).toBe("glTF");
      const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8")) as { nodes: { name: string }[]; animations?: { channels: unknown[] }[]; extensionsUsed?: string[] };
      expect(json.nodes.map((n) => n.name)).toContain("spare");
      expect(json.nodes.map((n) => n.name)).not.toContain("sun");
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
