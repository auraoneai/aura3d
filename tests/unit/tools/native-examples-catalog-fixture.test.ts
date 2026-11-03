import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { inflateSync } from "node:zlib";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGameRacingKit } from "../../../packages/engine/src/agent-api/GameGenreKits.js";
import { createChaseRig } from "../../../packages/engine/src/agent-api/camera/rigs/chase.js";
import { createShoulderRig } from "../../../packages/engine/src/agent-api/camera/rigs/shoulder.js";
import { createCameraProbe } from "../../../packages/engine/src/agent-api/camera/Probe.js";
import { subjectFromHandle } from "../../../packages/engine/src/agent-api/camera/subject.js";
import { createAuraRuntimeNodeRegistry, runtimeNodeQueryState } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { setPrd01ColorParsing, withPrd01ColorParsing } from "../../../packages/engine/src/agent-api/compiler/color.js";
import { qrPrimitiveGeometryOptions } from "../../../packages/engine/src/agent-api/compiler/geometry.js";
import { createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives.js";
import { createProductionRuntimeRendererInput, setPrd01ModelMatrixCache } from "../../../packages/engine/src/agent-api/compiler/renderInput.js";
import { modelMatrixFor } from "../../../packages/engine/src/agent-api/compiler/sceneGraph.js";
import { colorToLinearRgb } from "../../../packages/engine/src/agent-api/colorUtils.js";
import { createModelMatrixCache } from "../../../packages/engine/src/agent-api/sceneGraph.js";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags.js";
import { createTypedGLBActor, type TypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { clearTypedGLBActorQrFlags, setTypedGLBActorQrFlags } from "../../../packages/engine/src/production-runtime/actor/extensions.js";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets.js";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera.js";
import { material } from "../../../packages/engine/src/agent-api/nodes/material.js";
import { model } from "../../../packages/engine/src/agent-api/nodes/model.js";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives.js";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import type { AuraModelNode } from "../../../packages/engine/src/agent-api/nodes/types.js";
import type { AuraCameraPose } from "../../../packages/engine/src/contracts/camera.js";
import {
  catalogRouteErrors,
  compareNumericCatalogRegions,
  loadExpectations,
  type NumericRegion
} from "../../browser/native-examples-catalog.spec.js";

// These generated pixels test the oracle only. They are not screenshots or
// evidence that a template, scenario, renderer, or browser worked.
const WIDTH = 1280;
const HEIGHT = 720;
const root = process.cwd();
const fixturePath = "tests/fixtures/native-examples-catalog/expectations.json";
interface FixtureCase {
  id: string;
  kind: "numeric";
  author: string;
  provenance: string;
  subject: string;
  surface: { kind: "canvas"; selector: string };
  query?: string;
  settle?: { signal: string; equals?: string | number | boolean; atLeast?: number; timeoutMs?: number };
  driver?: { call: string; args?: Array<string | number | boolean | null> };
  presentation?: "gpu-canvas" | "canvas2d";
  source: { path: string; sha256: string };
  sourceDependencies?: Array<{ path: string; sha256: string }>;
  regions: NumericRegion[];
}
interface FixtureFile { schema: string; cases: FixtureCase[] }

function fixture(): FixtureFile {
  return JSON.parse(readFileSync(resolve(root, fixturePath), "utf8")) as FixtureFile;
}

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

function temporaryManifest(value: unknown): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), "aura3d-catalog-fixture-"));
  temporary.push(directory);
  const path = "expectations.json";
  writeFileSync(join(directory, path), JSON.stringify(value));
  return { directory, path };
}

type Vec3 = readonly [number, number, number];
function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
}
function project(point: Vec3, eye: Vec3, target: Vec3, fov: number): { x: number; y: number; depth: number } {
  const forward = normalize(subtract(target, eye));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const offset = subtract(point, eye);
  const depth = dot(offset, forward);
  const focal = HEIGHT / (2 * Math.tan(fov * Math.PI / 360));
  return {
    x: WIDTH / 2 + focal * dot(offset, right) / depth,
    y: HEIGHT / 2 - focal * dot(offset, up) / depth,
    depth
  };
}
function projectOrthographic(point: Vec3, eye: Vec3, target: Vec3, size: number): { x: number; y: number } {
  const forward = normalize(subtract(target, eye));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const offset = subtract(point, eye);
  const scale = HEIGHT / (2 * size);
  return { x: WIDTH / 2 + scale * dot(offset, right), y: HEIGHT / 2 - scale * dot(offset, up) };
}
function inside(region: NumericRegion, point: { x: number; y: number }): boolean {
  return point.x >= region.x && point.x <= region.x + region.width &&
    point.y >= region.y && point.y <= region.y + region.height;
}
function triangleArea(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
}
function image(): Uint8Array {
  return new Uint8Array(WIDTH * HEIGHT * 3).fill(24);
}
function paint(pixels: Uint8Array, x: number, y: number, width: number, height: number, color: readonly number[]): void {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      pixels.set(color, (row * WIDTH + column) * 3);
    }
  }
}

describe("source-backed native example catalog fixture", () => {
  it("finds the controller's default self-collision before admitting a subject region", async () => {
    const source = readFileSync(resolve(root, "packages/create-aura3d/templates/character-controller/src/main.ts"), "utf8");
    const extension = readFileSync(resolve(root, "packages/engine/src/agent-api/camera/extension.ts"), "utf8");
    expect(source).toContain("autoStart: true");
    expect(source).toContain("const HERO_SCALE = 1.62 / assets.auraclashPlayerRig.bounds[1]");
    expect(source).toContain('.animate({ clip: CERTIFIED_CLIP, loop: true, speed: 0 })');
    expect(source).toContain('const CERTIFIED_CLIP = "Walk_Loop"');
    expect(source).toContain('app.camera?.use(camera.rigs.shoulder({ target: "hero", collision: true }))');
    expect(source).toContain("heroNode.setPosition(position.x, position.y, position.z).setRotation(0, yaw, 0)");
    // The inert right-half look pad that covered the canvas was removed.
    expect(source).not.toContain("look-pad");
    for (const spec of [
      'name: "walkable ground", size: [30, 0.1, 30], position: [0, -0.05, 0]',
      'name: "distance marker north", size: [0.4, 1.4, 0.4], position: [0, 0.7, -6]',
      'name: "distance marker east", size: [0.4, 1.4, 0.4], position: [5, 0.7, 0]',
      'name: "distance marker south-east", size: [0.4, 1.4, 0.4], position: [3.5, 0.7, 4.5]',
      'name: "collision wall", size: [0.4, 2.4, 4], position: [2.4, 1.2, 4.2]'
    ]) expect(source).toContain(spec);
    expect(extension).toContain("...(registry?.all() ?? [])");
    expect(extension).toContain("const b = h.bounds()");
    const path = "packages/create-aura3d/templates/character-controller/public/aura-assets/auraclash-player-rig.glb";
    const bytes = readFileSync(resolve(root, path));
    const typed = readFileSync(resolve(root, "packages/create-aura3d/templates/character-controller/src/aura-assets.ts"), "utf8");
    expect(typed).toContain("bounds: [1.669, 1.788, 0.349]");
    expect(typed).toContain("sha256-3318d671632878ed27b8af6de88c6e5ca647e0d4a04cf03780d555fa07cec087");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("3318d671632878ed27b8af6de88c6e5ca647e0d4a04cf03780d555fa07cec087");
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8")) as {
      images: Array<{ uri?: string; bufferView?: number }>;
      buffers: Array<{ uri?: string }>;
    };
    expect(gltf.images.length).toBeGreaterThan(0);
    expect(gltf.images.every((image) => image.bufferView !== undefined && image.uri === undefined)).toBe(true);
    expect(gltf.buffers.every((buffer) => buffer.uri === undefined)).toBe(true);
    const flags = resolveQrFlags({ options: ["game"], env: {} });
    expect(flags.on("A3D_QR_CAMERA")).toBe(true);
    expect(flags.on("A3D_QR_ANIMATION")).toBe(true);
    const owner = {};
    setTypedGLBActorQrFlags(flags, owner);
    const release = setPrd01ModelMatrixCache(createModelMatrixCache(modelMatrixFor(flags)), owner);
    const defs = defineAuraAssets({ hero: {
      type: "model", format: "glb", url: "/aura-assets/auraclash-player-rig.glb",
      bounds: [1.669, 1.788, 0.349],
      hash: "sha256-3318d671632878ed27b8af6de88c6e5ca647e0d4a04cf03780d555fa07cec087"
    } });
    const snapshot = scene()
      .add(model(defs.hero, { name: "certified hero humanoid-a", castShadow: true })
        .position(0, 0, 0).scale(1.62 / 1.788).animate({ clip: "Walk_Loop", loop: true, speed: 0 })
        .runtime({ id: "hero", tags: ["player"] }))
      .camera(camera.perspective({ position: [0.55, 1.75, -2.8], target: [0, 1.35, 1.1], fov: 55 }))
      .toJSON();
    const node = snapshot.nodes.find((candidate): candidate is AuraModelNode => candidate.kind === "model")!;
    const registry = createAuraRuntimeNodeRegistry(snapshot, { flags });
    const handle = registry.require("hero");
    handle.setPosition(0, 0, 0).setRotation(0, 0, 0);
    const canvas = { width: WIDTH, height: HEIGHT } as HTMLCanvasElement;
    const url = "https://controller-fixture.invalid/aura-assets/auraclash-player-rig.glb";
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const actual = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (actual !== url) throw new Error(`Unexpected offline controller request: ${actual}`);
      return new Response(new Uint8Array(bytes), { status: 200 });
    });
    let actor: TypedGLBActor | undefined;
    try {
      actor = await createTypedGLBActor({
        asset: { ...node.asset, url }, id: "hero", name: node.name,
        runtimeOwner: owner, width: WIDTH, height: HEIGHT, shareTextures: false,
        imageDecoder: async (source) => {
          if (!source.data) throw new Error("controller texture is not embedded");
          const { data, info } = await sharp(Buffer.from(source.data)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
          return { width: info.width, height: info.height, data: new Uint8Array(data) };
        }
      });
      const warnings = new Set<string>();
      let items: ReturnType<NonNullable<ReturnType<typeof createProductionRuntimeRendererInput>["source"]["collectRenderItems"]>> = [];
      for (let frame = 0; frame <= 30; frame += 1) {
        const input = createProductionRuntimeRendererInput(snapshot, canvas, [{ node, actor }], [], frame * 1000 / 60,
          registry, warnings, { color: [0, 0, 0], intensity: 0 }, [], undefined, undefined, undefined, owner);
        items = input.source.collectRenderItems?.() ?? [];
      }
      const rig = createShoulderRig({ target: "hero", collision: true });
      const probe = createCameraProbe({ bounds: () => [
        { id: "hero", ...handle.bounds() },
        { id: "ground", min: [-15, -0.1, -15], max: [15, 0, 15] },
        { id: "north", min: [-0.2, 0, -6.2], max: [0.2, 1.4, -5.8] },
        { id: "east", min: [4.8, 0, -0.2], max: [5.2, 1.4, 0.2] },
        { id: "south-east", min: [3.3, 0, 4.3], max: [3.7, 1.4, 4.7] },
        { id: "wall", min: [2.2, 0, 2.2], max: [2.6, 2.4, 6.2] }
      ] });
      let pose: AuraCameraPose = { position: [0.55, 1.75, -2.8], target: [0, 1.35, 1.1], up: [0, 1, 0], roll: 0, fov: 55, near: 0.1, far: 1000 };
      rig.reset?.(pose);
      for (let frame = 0; frame < 120; frame += 1) {
        probe.beginFrame();
        pose = rig.update({ dt: 1 / 60, time: frame * 1000 / 60, aspect: WIDTH / HEIGHT, previous: pose,
          subject: (id) => id === "hero" ? subjectFromHandle(handle) : undefined, probe });
      }
      const allDepths: number[] = [];
      const forward = normalize(subtract(pose.target, pose.position));
      for (const item of items) {
        if (!item.skinning) continue;
        const geometry = item.geometry;
        const positions = geometry.getAttributeBuffer("position");
        const joints = geometry.getAttributeBuffer("joints");
        const weights = geometry.getAttributeBuffer("weights");
        for (let vertex = 0; vertex < geometry.vertexBuffer.vertexCount; vertex += 1) {
          const p = positions.getDecodedAttribute(vertex, "position");
          const js = joints.getDecodedAttribute(vertex, "joints");
          const ws = weights.getDecodedAttribute(vertex, "weights");
          const local = [0, 0, 0];
          for (let k = 0; k < 4; k += 1) {
            const off = js[k]! * 16, m = item.skinning.matrices, w = ws[k]!;
            for (let axis = 0; axis < 3; axis += 1) {
              local[axis]! += w * (m[off + axis]! * p[0]! + m[off + 4 + axis]! * p[1]! + m[off + 8 + axis]! * p[2]! + m[off + 12 + axis]!);
            }
          }
          const m = item.modelMatrix!;
          const world = [0, 1, 2].map((axis) => m[axis]! * local[0]! + m[4 + axis]! * local[1]! + m[8 + axis]! * local[2]! + m[12 + axis]!) as unknown as Vec3;
          allDepths.push(dot(subtract(world, pose.position), forward));
        }
      }
      probe.beginFrame();
      expect(probe.sphereCast([0, 0.8525, 2.2], [-0.85, 1.55, -2.6], 0.2).node).toBe("hero");
      expect(pose.position[0]).toBeCloseTo(-0.304655, 4);
      expect(pose.position[1]).toBeCloseTo(1.102496, 4);
      expect(pose.position[2]).toBeCloseTo(0.479595, 4);
      expect(pose.target[2]).toBeCloseTo(2.2, 4);
      expect([...warnings]).toEqual([]);
      expect(actor.animation.snapshot().lastApply?.clipName).toBe("mixer:Walk_Loop");
      expect(actor.animation.snapshot().lastApply?.time).toBe(0);
      expect(items[0]!.skinning?.jointCount).toBe(65);
      expect(items[0]!.modelMatrix![0]).toBeCloseTo(0.7856316, 5);
      expect(items[0]!.modelMatrix![13]).toBeCloseTo(0.0066048, 5);
      expect(allDepths.length).toBeGreaterThan(20_000);
      expect(allDepths.filter((depth) => depth < pose.near).length / allDepths.length).toBeGreaterThan(0.9);
      expect(Math.max(...allDepths)).toBeLessThan(0.2);
      expect(items.length).toBeGreaterThan(0);
    } finally {
      actor?.dispose();
      registry.dispose();
      release();
      clearTypedGLBActorQrFlags(owner);
      vi.unstubAllGlobals();
    }
  }, 30_000);

  it("admits the mini-game's key and star only with their verified Platformer Kit texture", async () => {
    const base = "packages/create-aura3d/templates/mini-game";
    const source = readFileSync(resolve(root, `${base}/src/main.ts`), "utf8");
    const typed = readFileSync(resolve(root, `${base}/src/aura-assets.ts`), "utf8");
    const compiler = readFileSync(resolve(root, "packages/engine/src/agent-api/compiler/compileScene.ts"), "utf8");
    expect(source).toContain("model(assets.kenneyPlatformerKitStar");
    expect(source).toContain("model(assets.kenneyPlatformerKitKey");
    expect(source).toContain("void miniGame.ready().then(");
    expect(compiler).toContain("const settled = await Promise.allSettled(modelNodes.map");
    expect(compiler).toContain("throw failure?.reason");
    // The Kenney Platformer Kit colormap, byte-identical to the texture embedded in
    // two independent Platformer Kit derivatives (showcaseKenneyOobiPlatformerHero
    // from the official kit zip, and linksAlpineSnowPine). Not a similarly named file.
    const textureDigest = "439dfcac935cfd75dc16f28333a4c8284fffcc4b24f857c61cfb4c8a964a15bd";
    const texture = readFileSync(resolve(root, `${base}/public/aura-assets/Textures/colormap.png`));
    expect(createHash("sha256").update(texture).digest("hex")).toBe(textureDigest);
    const entries = [
      ["kenneyPlatformerKitKey.2e930961.glb", "2e9309616c56536495d96fee85e75def26b63354139d19533773f23900984986"],
      ["kenneyPlatformerKitStar.a102a1b9.glb", "a102a1b961fe0932c98ca29200ee6becae711b42437f14d58703388114eeff3c"]
    ] as const;
    for (const [file, digest] of entries) {
      const bytes = readFileSync(resolve(root, `${base}/public/aura-assets/${file}`));
      const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8")) as {
        images: Array<{ uri?: string }>;
      };
      expect(json.images.map(({ uri }) => uri)).toContain("Textures/colormap.png");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest);
      expect(typed).toContain(`url: "/aura-assets/${file}"`);
      expect(typed).toContain(`hash: "sha256-${digest}"`);
      const integrity = {
        version: 1 as const,
        digest: `sha256-${digest}`,
        dependencies: { "Textures/colormap.png": `sha256-${textureDigest}` },
        requireDependencies: true
      };
      expect(typed).toContain(`integrity: { version: 1, digest: "sha256-${digest}", dependencies: { "Textures/colormap.png": "sha256-${textureDigest}" }, requireDependencies: true }`);
      const url = `https://mini-fixture.invalid/aura-assets/${file}`;
      const textureUrl = "https://mini-fixture.invalid/aura-assets/Textures/colormap.png";
      const requests: string[] = [];
      vi.stubGlobal("fetch", async (input: string | URL | Request) => {
        const actual = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        requests.push(actual);
        if (actual === url) return new Response(new Uint8Array(bytes), { status: 200 });
        if (actual === textureUrl) return new Response(new Uint8Array(texture), { status: 200 });
        throw new Error(`Unexpected offline mini-game request: ${actual}`);
      });
      let actor: TypedGLBActor | undefined;
      try {
        // Without the admitted dependency digest the typed loader still fails
        // closed before fetching the image.
        const failure = await createTypedGLBActor({
          asset: { url, format: "glb", hash: `sha256-${digest}` },
          id: file, width: WIDTH, height: HEIGHT, shareTextures: false
        }).then(() => undefined, (error: unknown) => error);
        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).name).toBe("AssetIntegrityError");
        expect((failure as Error).message).toBe(`Missing required dependency integrity metadata for ${textureUrl}`);
        expect(requests).toEqual([url]);
        // With the template's integrity the verified texture is fetched and decoded.
        requests.length = 0;
        const decoded: number[] = [];
        actor = await createTypedGLBActor({
          asset: { url, format: "glb", hash: `sha256-${digest}`, integrity },
          id: file, width: WIDTH, height: HEIGHT, shareTextures: false,
          imageDecoder: async (image) => {
            if (!image.data) throw new Error("mini-game texture bytes were not supplied");
            decoded.push(image.data.byteLength);
            const { data, info } = await sharp(Buffer.from(image.data)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            return { width: info.width, height: info.height, data: new Uint8Array(data) };
          }
        });
        expect(requests).toContain(textureUrl);
        expect(decoded).toEqual([texture.byteLength]);
      } finally {
        actor?.dispose();
        vi.unstubAllGlobals();
      }
    }
  }, 15_000);
  it("grounds the model, bounds, grade, animation and controls subjects in the admitted texture and camera", async () => {
    const entries = [
      "capability-example:typed-model", "capability-example:bounds-query",
      "capability-example:postprocess", "capability-example:animation", "capability-example:controls"
    ]
      .map((id) => fixture().cases.find((candidate) => candidate.id === id)!);
    const source = readFileSync(resolve(root, entries[0]!.source.path), "utf8");
    expect(source).toContain('.position(-1, 0.8, 0)');
    expect(source).toContain('camera.perspective({ position: [3.8, 2.8, 6], target: [0, 0.8, 0], fov: 42 })');
    expect(source).toContain("effects.colorGrade({ contrast: 1.12, saturation: 0.8 })");
    expect(source).toContain("subject.animate({ clip: options.animationClip!, loop: true })");
    expect(source).toContain('interactions.orbit({ target: "subject" })');
    expect(source).toContain('createOrbitRig({ target: "subject", distance, fov: pose.fov })');
    expect(source).toContain("bindOrbitPointer(app.canvas, rig)");
    const controls = entries.find(({ id }) => id === "capability-example:controls")!;
    const orbit = readFileSync(resolve(root, "packages/engine/src/agent-api/camera/rigs/orbit.ts"), "utf8");
    expect(orbit).toContain('} from "@aura3d/input"');
    expect(orbit).toContain("acquirePointerCapture(element, contact.pointerId, owner)");
    expect(controls.sourceDependencies!.map(({ path }) => path)).toEqual(expect.arrayContaining([
      "packages/input/src/index.ts", "packages/input/src/PointerLeases.ts"
    ]));
    for (const entry of entries) {
      const eye: Vec3 = entry.id === "capability-example:controls" ? [2.8, 2.8, 6] : [3.8, 2.8, 6];
      const target: Vec3 = entry.id === "capability-example:controls" ? [-1, 0.8, 0] : [0, 0.8, 0];
      for (const point of [[-1, 0.8, 0], [-1, 1.6, 0], [-1, 2.2, 0]] as const) {
        expect(inside(entry.regions[0]!, project(point, eye, target, 42))).toBe(true);
      }
    }

    const asset = entries[0]!.sourceDependencies!.find(({ path }) => path.endsWith("kaykit-barbarian.glb"))!;
    const bytes = readFileSync(resolve(root, asset.path));
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
    const jsonLength = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")) as {
      images: Array<{ bufferView: number }>;
      bufferViews: Array<{ byteOffset?: number; byteLength: number; byteStride?: number }>;
      accessors: Array<{ bufferView: number; byteOffset?: number; componentType: number; count: number }>;
      meshes: Array<{ name: string; primitives: Array<{ attributes: { TEXCOORD_0: number } }> }>;
      nodes: Array<{ name?: string }>;
      animations: Array<{
        name: string;
        channels: Array<{ sampler: number; target: { node: number; path: string } }>;
        samplers: Array<{ input: number; output: number }>;
      }>;
    };
    const binHeader = 20 + jsonLength;
    expect(bytes.readUInt32LE(binHeader + 4)).toBe(0x004e4942);
    const binStart = binHeader + 8;
    const imageView = gltf.bufferViews[gltf.images[0]!.bufferView]!;
    const imageStart = binStart + (imageView.byteOffset ?? 0);
    const { data, info } = await sharp(bytes.subarray(imageStart, imageStart + imageView.byteLength))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([1024, 1024, 4]);
    for (const [meshName, expected] of [
      ["PrototypePete_body.022", [73, 103, 124]],
      ["Cube.167", [246, 192, 156]]
    ] as const) {
      const primitive = gltf.meshes.find(({ name }) => name === meshName)!.primitives[0]!;
      const accessor = gltf.accessors[primitive.attributes.TEXCOORD_0]!;
      const view = gltf.bufferViews[accessor.bufferView]!;
      expect(accessor.componentType).toBe(5126);
      let matches = 0;
      for (let index = 0; index < accessor.count; index += 1) {
        const offset = binStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + index * (view.byteStride ?? 8);
        const u = bytes.readFloatLE(offset);
        const v = bytes.readFloatLE(offset + 4);
        const x = Math.min(info.width - 1, Math.floor(((u % 1 + 1) % 1) * info.width));
        const y = Math.min(info.height - 1, Math.floor(((v % 1 + 1) % 1) * info.height));
        const pixel = (y * info.width + x) * 4;
        if (expected.every((value, channel) => data[pixel + channel] === value)) matches += 1;
      }
      expect(matches).toBeGreaterThan(0);
    }
    const idle = gltf.animations.find(({ name }) => name === "Idle")!;
    const hips = idle.channels.find(({ target }) => gltf.nodes[target.node]?.name === "hips" && target.path === "translation")!;
    const sampler = idle.samplers[hips.sampler]!;
    const times = gltf.accessors[sampler.input]!;
    const samples = gltf.accessors[sampler.output]!;
    expect(times.count).toBe(33);
    expect(samples.count).toBe(33);
    const timeView = gltf.bufferViews[times.bufferView]!;
    const timeStart = binStart + (timeView.byteOffset ?? 0) + (times.byteOffset ?? 0);
    expect(bytes.readFloatLE(timeStart + 32 * 4)).toBeCloseTo(32 / 30, 6);
    const valueView = gltf.bufferViews[samples.bufferView]!;
    const valueStart = binStart + (valueView.byteOffset ?? 0) + (samples.byteOffset ?? 0);
    const stride = valueView.byteStride ?? 12;
    const y0 = bytes.readFloatLE(valueStart + 4);
    const yHalf = bytes.readFloatLE(valueStart + 16 * stride + 4);
    expect(y0 - yHalf).toBeGreaterThan(0.02);
  });

  it("contains the arena north rail under its authored top-down camera", () => {
    const entry = fixture().cases.find(({ id }) => id === "template:arena-shooter")!;
    const source = readFileSync(resolve(root, entry.source.path), "utf8");
    expect(source).toContain('name: "rim north"');
    expect(source).toContain("position: [0, 0.02, ARENA.minZ - 2.07]");
    expect(source).toContain("distance: 5.4");
    expect(source).toContain("targetLeadZ: -1.4");
    const eye: Vec3 = [0, 5.4 * Math.sin(Math.PI / 3), 5.4 * Math.cos(Math.PI / 3)];
    for (const point of [[-3, 0.02, -6.57], [0, 0.1, -6.57], [3, -0.06, -6.57]] as const) {
      expect(inside(entry.regions[0]!, project(point, eye, [0, 0.45, -1.4], 50))).toBe(true);
    }
  });

  it("grounds the instanced-gradient bands in the authored color endpoints", () => {
    const entry = fixture().cases.find(({ id }) => id === "starter-example:instancing-performance")!;
    const source = readFileSync(resolve(root, entry.source.path), "utf8");
    expect(source).toContain("const GRID = 64");
    expect(source).toContain("0.35 + (column / GRID) * 0.6");
    expect(source).toContain("0.45 + (row / GRID) * 0.45");
    expect(source).toContain("0.75 - (column / GRID) * 0.35");
    expect(source).toContain("baseColor: [0.72, 0.76, 0.82, 1]");
    const srgb = (value: number) => Math.round(255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055));
    for (const [column, row, index] of [[63, 63, 0], [0, 0, 1]] as const) {
      const sample = [
        srgb(0.72 * (0.35 + column / 64 * 0.6)),
        srgb(0.76 * (0.45 + row / 64 * 0.45)),
        srgb(0.82 * (0.75 - column / 64 * 0.35))
      ];
      const band = entry.regions[0]!.colors[index]!;
      for (const [channel, range] of [band.red, band.green, band.blue].entries()) {
        expect(sample[channel]).toBeGreaterThanOrEqual(range[0]);
        expect(sample[channel]).toBeLessThanOrEqual(range[1]);
      }
    }
  });

  it("contains the primitive animation subjects while avoiding the builder panel", () => {
    for (const id of ["template:prompt-animation-channel", "template:episode-builder"]) {
      const entry = fixture().cases.find((candidate) => candidate.id === id)!;
      const source = readFileSync(resolve(root, entry.source.path), "utf8");
      expect(source).toContain('const typedAnimationAssets = assets as Partial');
      expect(source).toContain('fallback body - add ${assetKey} with the Aura3D CLI');
      expect(source).toContain('camera.perspective({ position: [0, 1.4, 4.2], target: [0, 0.7, 0], fov: 42 })');
      for (const point of [[-0.8, 0.75, 0], [-0.55, 0.75, 0.05], [0.8, 0.72, 0], [0.62, 0.72, -0.02]] as const) {
        expect(inside(entry.regions[0]!, project(point, [0, 1.4, 4.2], [0, 0.7, 0], 42))).toBe(true);
      }
    }
    const panel = readFileSync(resolve(root, "packages/create-aura3d/templates/episode-builder/src/builder.ts"), "utf8");
    expect(panel).toContain('"left:18px"');
    expect(panel).toContain('"width:min(390px,calc(100vw - 36px))"');
    expect(fixture().cases.find(({ id }) => id === "template:episode-builder")!.regions[0]!.x).toBeGreaterThan(18 + 390);
  });

  it("grounds the product cabinet hypothesis in GLB bytes and the authored frame", () => {
    const entry = fixture().cases.find(({ id }) => id === "template:product-viewer")!;
    const asset = entry.sourceDependencies!.find(({ path }) => path.endsWith("product-fixture.glb"))!;
    const bytes = readFileSync(resolve(root, asset.path));
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
    expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8")) as {
      materials: Array<{ name: string; pbrMetallicRoughness: { baseColorFactor: number[]; baseColorTexture: { index: number } } }>;
      textures: Array<{ source: number }>;
      images: Array<{ uri: string }>;
    };
    const material = gltf.materials.find(({ name }) => name === "satin-cabinet")!;
    expect(material.pbrMetallicRoughness.baseColorFactor).toEqual([0.42, 0.25, 0.13, 1]);
    const png = Buffer.from(gltf.images[gltf.textures[material.pbrMetallicRoughness.baseColorTexture.index]!.source]!.uri.split(",")[1]!, "base64");
    const chunks: Buffer[] = [];
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset);
      if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    expect([...inflateSync(Buffer.concat(chunks))]).toEqual([1, 255, 255, 0, 127]);
    const size: Vec3 = [1.9 * 1.62 / 2.9, 1.62, 1.1 * 1.62 / 2.9];
    const distance = Math.hypot(...size) / 2 / Math.tan(16 * Math.PI / 180) * 1.6;
    const target: Vec3 = [0, 0.18 + size[1] * 0.28, -0.62];
    const eye: Vec3 = [
      target[0] + Math.sin(0.62) * Math.cos(0.28) * distance,
      target[1] + Math.sin(0.28) * distance,
      target[2] + Math.cos(0.62) * Math.cos(0.28) * distance
    ];
    for (const point of [[0, 1.08, -0.62], [0.5, 1.08, -0.62], [-0.5, 1.08, -0.62]] as const) {
      expect(inside(entry.regions[0]!, project(point, eye, target, 32))).toBe(true);
    }
  });

  it("contains the seeded falling-board cells under the authored orthographic camera", () => {
    const entry = fixture().cases.find(({ id }) => id === "template:falling-blocks-starter")!;
    const source = readFileSync(resolve(root, entry.source.path), "utf8");
    expect(source).toContain('falling.setActive({ kind: "I", x: 3, y: boardHeight - 3, rotation: 0 })');
    expect(source).toContain('x >= 3 && x <= 6 ? null : "O"');
    const region = entry.regions[0]!;
    const eye: Vec3 = [0.35, 0.75, 4.6];
    const target: Vec3 = [0, 0.22, 0];
    for (const x of [0, 1, 2, 7, 8, 9]) {
      expect(inside(region, projectOrthographic([-1.2 + (x + 0.5) * 0.24, -2.06, 0], eye, target, 2.9))).toBe(true);
    }
    for (const x of [3, 4, 5, 6]) {
      expect(inside(region, projectOrthographic([-1.2 + (x + 0.5) * 0.24, -1.82, 0.14], eye, target, 2.9))).toBe(true);
    }
  });

  it("loads the real fixture and binds every case to existing source bytes", () => {
    const data = fixture();
    const loaded = loadExpectations();
    expect(data.schema).toBe("aura3d.native-example-expectations/1");
    expect(data.cases.length).toBeGreaterThan(0);
    expect([...loaded.keys()]).toEqual(data.cases.map(({ id }) => id));
    for (const entry of data.cases) {
      expect(entry.kind).toBe("numeric");
      expect(entry.author.trim()).not.toBe("");
      expect(entry.provenance).toMatch(/no reference capture/i);
      expect(entry.provenance).toMatch(/unverified/i);
      expect(entry.subject.trim()).not.toBe("");
      // Documented examples may name their presenting canvas (a framed lab or a
      // 2D readback composite); templates and capability scenarios keep the bare canvas.
      expect(entry.surface.kind).toBe("canvas");
      if (entry.id.startsWith("documented-example:")) expect(entry.surface.selector.trim()).not.toBe("");
      else expect(entry.surface).toEqual({ kind: "canvas", selector: "canvas" });
      expect(catalogRouteErrors(entry), entry.id).toEqual([]);
      if (!entry.id.startsWith("documented-example:")) {
        expect(entry.query ?? entry.settle ?? entry.driver ?? entry.presentation, entry.id).toBeUndefined();
      }
      expect(entry.regions.some(({ label }) => label === "subject")).toBe(true);
      for (const input of [entry.source, ...(entry.sourceDependencies ?? [])]) {
        const source = resolve(root, input.path);
        const path = relative(realpathSync(root), realpathSync(source));
        expect(isAbsolute(input.path)).toBe(false);
        expect(path === ".." || path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)).toBe(false);
        expect(input.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(createHash("sha256").update(readFileSync(source)).digest("hex")).toBe(input.sha256);
      }
    }
  });

  it("rejects empty, malformed, duplicate and unprovenanced manifests through the browser fixture loader", () => {
    const original = fixture().cases[0]!;
    for (const invalid of [
      { schema: "wrong", cases: [original] },
      { schema: "aura3d.native-example-expectations/1", cases: [] },
      { schema: "aura3d.native-example-expectations/1", cases: [original, original] },
      { schema: "aura3d.native-example-expectations/1", cases: [{ ...original, id: " " }] },
      { schema: "aura3d.native-example-expectations/1", cases: [{ ...original, provenance: "" }] },
      { schema: "aura3d.native-example-expectations/1", cases: [{ ...original, author: 42 }] },
      { schema: "aura3d.native-example-expectations/1", cases: [{ ...original, subject: "" }] },
      { schema: "aura3d.native-example-expectations/1", cases: [{ ...original, regions: null }] },
      { schema: "aura3d.native-example-expectations/1", cases: [{ ...original, regions: [] }] },
      { schema: "aura3d.native-example-expectations/1", cases: [{ ...original, regions: [{ ...original.regions[0], label: "output" }] }] },
      { schema: "aura3d.native-example-expectations/1", cases: [{ ...original, reference: "capture.png" }] },
      { schema: "aura3d.native-example-expectations/1", cases: [{ ...original, surface: { kind: "canvas", selector: " " } }] }
    ]) {
      const { directory, path } = temporaryManifest(invalid);
      expect(() => loadExpectations(directory, path)).toThrow();
    }
    const { directory, path } = temporaryManifest({
      schema: "aura3d.native-example-expectations/1",
      cases: [{ ...original, kind: "reference", reference: "reference.png", sha256: "0".repeat(64) }]
    });
    writeFileSync(join(directory, "reference.png"), "not the declared reference");
    expect(() => loadExpectations(directory, path)).toThrow(/reference digest mismatch/);
    writeFileSync(join(directory, path), JSON.stringify({
      schema: "aura3d.native-example-expectations/1",
      cases: [{ ...original, kind: "reference", reference: "/tmp/untrusted.png", sha256: "0".repeat(64) }]
    }));
    expect(() => loadExpectations(directory, path)).toThrow(/unsafe relative path/);
    const outside = mkdtempSync(join(tmpdir(), "aura3d-catalog-outside-"));
    temporary.push(outside);
    writeFileSync(join(outside, "outside.png"), "outside fixture directory");
    symlinkSync(join(outside, "outside.png"), join(directory, "linked.png"));
    writeFileSync(join(directory, path), JSON.stringify({
      schema: "aura3d.native-example-expectations/1",
      cases: [{ ...original, kind: "reference", reference: "linked.png", sha256: "0".repeat(64) }]
    }));
    expect(() => loadExpectations(directory, path)).toThrow(/path escapes/);
  });

  it("derives bounded regions from the authored scenario and template cameras rather than a captured frame", () => {
    const entries = new Map(fixture().cases.map((entry) => [entry.id, entry]));
    const scenario = readFileSync(resolve(root, "examples/native-capabilities/index.ts"), "utf8");
    const template = readFileSync(resolve(root, "packages/create-aura3d/templates/material-authoring/src/main.ts"), "utf8");
    const camera = readFileSync(resolve(root, "packages/engine/src/agent-api/nodes/camera.ts"), "utf8");
    expect(scenario).toContain("position: [3.8, 2.8, 6], target: [0, 0.8, 0], fov: 42");
    expect(scenario).toContain("positions: new Float32Array([-0.7, 0, 0, 0.7, 0, 0, 0, 1.4, 0])");
    expect(scenario).toContain('color: "#d88a4a"');
    expect(scenario).toContain('color: "#b4c8d4"');
    expect(scenario).toContain('color: "#e0ba71"');
    expect(scenario).toContain('color: "#db8e4a"');
    expect(scenario).toContain("outColor = vec4(0.12, 0.56, 0.72, 1.0)");
    expect(template).toContain('color: "#c66f53"');
    expect(template).toContain('camera.orbit({ target: [0, 0.55, 0], distance: 6.2, fov: 38 })');
    for (const coefficient of ["0.62", "0.42", "0.78"]) expect(camera).toContain(`distance * ${coefficient}`);

    const eye: Vec3 = [3.8, 2.8, 6];
    const target: Vec3 = [0, 0.8, 0];
    const trianglePoints: Vec3[] = [[0.3, 0.05, 0], [1.7, 0.05, 0], [1, 1.45, 0]];
    const triangle = trianglePoints.map((point) => project(point, eye, target, 42));
    const triangleRegion = entries.get("capability-example:custom-geometry")!.regions[0]!;
    expect(triangle.every((point) => inside(triangleRegion, point))).toBe(true);
    const triangleFraction = triangleArea(triangle[0]!, triangle[1]!, triangle[2]!) / (triangleRegion.width * triangleRegion.height);
    expect(triangleFraction).toBeGreaterThan(triangleRegion.colors[0]!.minFraction);
    expect(triangleFraction).toBeLessThan(triangleRegion.colors[0]!.maxFraction);

    const sphere = project([1, 0.8, 0], eye, target, 42);
    const sphereRegion = entries.get("capability-example:custom-shader")!.regions[0]!;
    expect(inside(sphereRegion, sphere)).toBe(true);
    const sphereRadius = HEIGHT * 0.5 / (2 * Math.tan(42 * Math.PI / 360) * sphere.depth);
    const sphereFraction = Math.PI * sphereRadius ** 2 / (sphereRegion.width * sphereRegion.height);
    expect(sphereFraction).toBeGreaterThan(sphereRegion.colors[0]!.minFraction);
    expect(sphereFraction).toBeLessThan(sphereRegion.colors[0]!.maxFraction);
    const metalRegion = entries.get("capability-example:material-lighting")!.regions[0]!;
    expect(inside(metalRegion, sphere)).toBe(true);
    expect(sphereFraction).toBeGreaterThan(metalRegion.colors[0]!.minFraction);
    expect(sphereFraction).toBeLessThan(metalRegion.colors[0]!.maxFraction);

    const textRegion = entries.get("capability-example:world-text")!.regions[0]!;
    expect(inside(textRegion, project([0.1, 0.8, 0], eye, target, 42))).toBe(true);
    expect(inside(textRegion, project([1.85, 1.15, 0], eye, target, 42))).toBe(true);
    const geometry = readFileSync(resolve(root, "packages/engine/src/agent-api/RootGeometry.ts"), "utf8");
    expect(geometry).toContain("const spacing = nonNegative(options.letterSpacing, size * 0.14");
    expect(geometry).toContain("cursor += cell * 5 + spacing");
    const textFraction = 103 * (0.35 / 7 * 0.92) ** 2 * 125 ** 2 / (textRegion.width * textRegion.height);
    expect(textFraction).toBeGreaterThan(textRegion.colors[0]!.minFraction);
    expect(textFraction).toBeLessThan(textRegion.colors[0]!.maxFraction);

    const physicsRegion = entries.get("capability-example:physics")!.regions[0]!;
    for (const height of [0.5, 2]) expect(inside(physicsRegion, project([1, height, 0], eye, target, 42))).toBe(true);
    const physicsRadius = HEIGHT * 0.3 / (2 * Math.tan(42 * Math.PI / 360) * sphere.depth);
    const physicsFraction = Math.PI * physicsRadius ** 2 / (physicsRegion.width * physicsRegion.height);
    expect(physicsFraction).toBeGreaterThan(physicsRegion.colors[0]!.minFraction);
    expect(physicsFraction).toBeLessThan(physicsRegion.colors[0]!.maxFraction);

    const swatch = project([-2.5, 0.55, 0.55], [3.844, 3.154, 4.836], [0, 0.55, 0], 38);
    const swatchRegion = entries.get("template:material-authoring")!.regions[0]!;
    expect(inside(swatchRegion, swatch)).toBe(true);
    const swatchRadius = HEIGHT * 0.45 / (2 * Math.tan(38 * Math.PI / 360) * swatch.depth);
    const swatchFraction = Math.PI * swatchRadius ** 2 / (swatchRegion.width * swatchRegion.height);
    expect(swatchFraction).toBeGreaterThan(swatchRegion.colors[0]!.minFraction);
    expect(swatchFraction).toBeLessThan(swatchRegion.colors[0]!.maxFraction);
  });

  it("anchors starter subjects to their authored cameras, colors, and robot material", () => {
    const entries = new Map(fixture().cases.map((entry) => [entry.id, entry]));
    const robotRegion = entries.get("starter-example:hello-world-typed-asset")!.regions[0]!;
    const robotSource = readFileSync(resolve(root, "apps/hello-world-typed-asset/src/main.ts"), "utf8");
    expect(robotSource).toContain('model(assets.robot, { name: "typed GLB robot" }).position(-0.5, 0.04, -0.7)');
    expect(robotSource).toContain("position: [0.06, 1.02, 3.42], target: [-0.24, 0.58, -0.78], fov: 34");
    const robotEye: Vec3 = [0.06, 1.02, 3.42], robotTarget: Vec3 = [-0.24, 0.58, -0.78];
    expect(inside(robotRegion, project([-0.5, 0.8, -0.7], robotEye, robotTarget, 34))).toBe(true);
    const accents: Vec3[] = [[0.54, 0.42, -0.62], [0.78, 0.62, -0.58], [-1.28, 0.72, -0.82], [1.25, 0.72, -0.84]];
    for (const point of accents) {
      expect(inside(robotRegion, project(point, robotEye, robotTarget, 34))).toBe(false);
    }
    const glb = readFileSync(resolve(root, "apps/hello-world-typed-asset/robot-fixture.glb"));
    expect(glb.subarray(0, 4).toString()).toBe("glTF");
    const jsonLength = glb.readUInt32LE(12);
    const model = JSON.parse(glb.subarray(20, 20 + jsonLength).toString()) as {
      materials: Array<{ name: string; pbrMetallicRoughness?: { baseColorFactor?: number[] } }>;
      meshes: Array<{ primitives: Array<{ material?: number }> }>;
      nodes: Array<{ name?: string; mesh?: number }>;
    };
    const mainIndex = model.materials.findIndex(({ name }) => name === "Main");
    expect(mainIndex).toBeGreaterThanOrEqual(0);
    const mainColor = model.materials[mainIndex]!.pbrMetallicRoughness!.baseColorFactor!;
    expect(mainColor.slice(0, 3)).toEqual([0.590328395366669, 0.291314452886581, 0.0383376032114029]);
    for (const name of ["Torso", "Head"]) {
      const node = model.nodes.find((entry) => entry.name === name && typeof entry.mesh === "number");
      expect(node?.mesh).toBeTypeOf("number");
      expect(model.meshes[node!.mesh!]!.primitives.some(({ material }) => material === mainIndex)).toBe(true);
    }

    const materials = readFileSync(resolve(root, "apps/material-lighting/src/main.ts"), "utf8");
    expect(materials).toContain('name: "magenta emissive sample"');
    expect(materials).toContain('name: "cyan emissive sample"');
    expect(materials).toContain('emissive: "#ff00b8"');
    expect(materials).toContain('emissive: "#00d8ff"');
    const materialsRegion = entries.get("starter-example:material-lighting")!.regions[0]!;
    const materialsEye: Vec3 = [0.08, 0.92, 3.45], materialsTarget: Vec3 = [0, 0.36, -0.86];
    const magenta = project([0.38, 0.54, -0.78], materialsEye, materialsTarget, 38);
    const cyan = project([1.06, 0.49, -0.78], materialsEye, materialsTarget, 38);
    for (const point of [magenta, cyan]) expect(inside(materialsRegion, point)).toBe(true);
    const focal = HEIGHT / (2 * Math.tan(38 * Math.PI / 360));
    for (const [point, radius, index] of [[magenta, 0.315, 0], [cyan, 0.24, 1]] as const) {
      const fraction = Math.PI * (focal * radius / point.depth) ** 2 / (materialsRegion.width * materialsRegion.height);
      expect(fraction).toBeGreaterThan(materialsRegion.colors[index]!.minFraction);
      expect(fraction).toBeLessThan(materialsRegion.colors[index]!.maxFraction);
    }

    const cameraSource = readFileSync(resolve(root, "apps/camera-path/src/main.ts"), "utf8");
    expect(cameraSource).toContain('name: "brass camera faceplate"');
    expect(cameraSource).toContain('name: "blue lens glass"');
    expect(cameraSource).toContain("from: [0, 1.18, 4.95], to: [0.32, 1.06, 3.7]");
    const cameraRegion = entries.get("starter-example:camera-path")!.regions[0]!;
    const cameraEyes: Vec3[] = [[0, 1.18, 4.95], [0.32, 1.06, 3.7]];
    const cameraSubjects: Vec3[] = [[0, 0.42, -0.78], [0, 0.42, -0.46]];
    for (const cameraEye of cameraEyes) {
      for (const subject of cameraSubjects) {
        expect(inside(cameraRegion, project(subject, cameraEye, [0.02, 0.46, -0.96], 41))).toBe(true);
      }
    }
  });

  it("projects the cinematic recipe's actual neon sign at the paused initial dolly pose", () => {
    const entry = fixture().cases.find(({ id }) => id === "template:cinematic-scene")!;
    const source = readFileSync(resolve(root, entry.source.path), "utf8");
    const compiler = readFileSync(resolve(root, "packages/engine/src/agent-api/nodes/prompt/promptPlanV2.ts"), "utf8");
    const recipes = readFileSync(resolve(root, "packages/engine/src/agent-api/nodes/prompt/promptRecipes.ts"), "utf8");
    expect(source).toContain('sceneType: "cinematic-scene"');
    expect(source).toContain("void app.ready().then(() => app.step(0))");
    expect(compiler).toContain("promptRecipes[plan.sceneType](subject.asset, plan, look.id)");
    expect(recipes).toContain('name: "cyan neon sign", material: material.glowingEmissive({ color: "#32ddff", emissiveIntensity: 2.6 })');
    expect(recipes).toContain(".position(-2.22, 1.35, -1.55).rotate(0.05, 0, -0.24).scale([0.055, 1.48, 0.12])");
    expect(recipes).toContain("from: [0.46, 1.05, 4.28], to: [0.08, 0.86, 3.14], target: [-0.08, 0.56, -0.86], seconds: 8, fov: 39");
    const eye: Vec3 = [0.46, 1.05, 4.28];
    const target: Vec3 = [-0.08, 0.56, -0.86];
    const halfHeight = 1.48 / 2;
    const ends: Vec3[] = [
      [-2.22, 1.35, -1.55],
      [-2.22 + Math.sin(0.24) * halfHeight, 1.35 + Math.cos(0.24) * halfHeight, -1.55],
      [-2.22 - Math.sin(0.24) * halfHeight, 1.35 - Math.cos(0.24) * halfHeight, -1.55]
    ];
    for (const point of ends) expect(inside(entry.regions[0]!, project(point, eye, target, 39))).toBe(true);
    const center = project(ends[0]!, eye, target, 39);
    const focal = HEIGHT / (2 * Math.tan(39 * Math.PI / 360));
    const projectedFace = 0.055 * 1.48 * (focal / center.depth) ** 2;
    const fraction = projectedFace / (entry.regions[0]!.width * entry.regions[0]!.height);
    expect(fraction).toBeGreaterThan(entry.regions[0]!.colors[0]!.minFraction);
    expect(fraction).toBeLessThan(entry.regions[0]!.colors[0]!.maxFraction);
    const band = entry.regions[0]!.colors[0]!;
    for (const [value, range] of [[0x32, band.red], [0xdd, band.green], [0xff, band.blue]] as const) {
      expect(value).toBeGreaterThanOrEqual(range[0]);
      expect(value).toBeLessThanOrEqual(range[1]);
    }
  });

  it("grounds the postprocess Miko region in its own orbit pose, mesh bounds and embedded texture UVs", async () => {
    const entry = fixture().cases.find(({ id }) => id === "template:postprocess-scene")!;
    const source = readFileSync(resolve(root, entry.source.path), "utf8");
    expect(source).toContain('model(assets.miko, { name: "glowing showcase miko" }).position(1.15, 0.02, 0.85).rotate(0, -0.45, 0).scale(1.05)');
    expect(source).toContain('camera.orbit({ target: [0, 1.05, 0], distance: 6.4, fov: 40 })');
    const eye: Vec3 = [6.4 * 0.62, 1.05 + 6.4 * 0.42, 6.4 * 0.78];
    const target: Vec3 = [0, 1.05, 0];
    for (const point of [[1.15, 0.5, 0.85], [1.15, 1, 0.85], [1.15, 1.5, 0.85], [1.15, 1.9, 0.85], [0.65, 1, 0.85], [1.65, 1, 0.85]] as const) {
      expect(inside(entry.regions[0]!, project(point, eye, target, 40))).toBe(true);
    }
    const bytes = readFileSync(resolve(root, "packages/create-aura3d/templates/postprocess-scene/public/aura-assets/showcaseMiko.fcdc2b75.glb"));
    expect(bytes.toString("ascii", 0, 4)).toBe("glTF");
    const jsonLength = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")) as {
      images: Array<{ bufferView: number }>;
      bufferViews: Array<{ byteOffset?: number; byteLength: number; byteStride?: number }>;
      accessors: Array<{ bufferView: number; byteOffset?: number; componentType: number; count: number; min?: number[]; max?: number[] }>;
      materials: Array<{ name: string }>;
      meshes: Array<{ primitives: Array<{ material: number; attributes: { POSITION: number; TEXCOORD_0: number } }> }>;
    };
    const binStart = 20 + jsonLength + 8;
    const image = gltf.bufferViews[gltf.images[0]!.bufferView]!;
    const { data, info } = await sharp(bytes.subarray(binStart + (image.byteOffset ?? 0), binStart + (image.byteOffset ?? 0) + image.byteLength))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([1024, 1024, 4]);
    for (const [materialName, expected, index] of [
      ["miko_body_mat", [57, 142, 186], 0],
      ["miko_skin_mat", [223, 171, 135], 1]
    ] as const) {
      const materialIndex = gltf.materials.findIndex(({ name }) => name === materialName);
      expect(materialIndex).toBeGreaterThanOrEqual(0);
      const primitive = gltf.meshes[0]!.primitives.find(({ material }) => material === materialIndex)!;
      const positions = gltf.accessors[primitive.attributes.POSITION]!;
      expect(positions.min![1]).toBeLessThan(positions.max![1]!);
      const uv = gltf.accessors[primitive.attributes.TEXCOORD_0]!;
      expect(uv.componentType).toBe(5126);
      const view = gltf.bufferViews[uv.bufferView]!;
      const start = binStart + (view.byteOffset ?? 0) + (uv.byteOffset ?? 0);
      let matches = 0;
      for (let n = 0; n < uv.count; n += 1) {
        const offset = start + n * (view.byteStride ?? 8);
        const u = bytes.readFloatLE(offset), v = bytes.readFloatLE(offset + 4);
        const x = Math.min(info.width - 1, Math.floor(((u % 1 + 1) % 1) * info.width));
        const y = Math.min(info.height - 1, Math.floor(((v % 1 + 1) % 1) * info.height));
        const pixel = (y * info.width + x) * 4;
        if (expected.every((value, channel) => data[pixel + channel] === value)) matches += 1;
      }
      expect(matches).toBeGreaterThan(0);
      const band = entry.regions[0]!.colors[index]!;
      for (const [channel, range] of [band.red, band.green, band.blue].entries()) {
        expect(expected[channel]).toBeGreaterThanOrEqual(range[0]);
        expect(expected[channel]).toBeLessThanOrEqual(range[1]);
      }
    }
  });

  it("projects the racing car's actual body and lamp triangles through the starting chase rig", async () => {
    const entry = fixture().cases.find(({ id }) => id === "template:racing-starter")!;
    const source = readFileSync(resolve(root, entry.source.path), "utf8");
    const points = [[-0.4, -0.25], [2.4, -0.9], [5.4, 0.15], [5.9, 2.7], [3.2, 3.9], [0.3, 3.15], [-0.75, 1.15]] as const;
    expect(source).toContain("const ROUTE_SCALE = 3.5");
    expect(source).toContain("startProgress: 0.04");
    expect(source).toContain("const TRACK_Y = -1.0");
    expect(source).toContain("const CAR_RIDE_Y = 1.206");
    expect(source).toContain('.setPosition(state.position.x, CAR_RIDE_Y, state.position.y)');
    expect(source).toContain(".setRotation(0, -state.heading + Math.PI / 2, 0)");
    expect(source).toContain('target: "race-car"');
    expect(source).toContain('qualityRebuild: { flags: ["game"] }');
    expect(source).toContain("fov: { base: 60, perSpeed: 0.4 }");
    expect(source).toContain("lookAhead: { seconds: 0.35, max: 4 }");
    expect(source).toContain('model(assets.carModel, { name: "typed playable sports car", castShadow: true })');
    expect(source).toContain('model(assets.trackModel, { name: "typed kart circuit asset" })\n      .position(ROUTE_BOUNDS.centerX, TRACK_Y, ROUTE_BOUNDS.centerZ)\n      .scale(1)');
    expect(source).toContain('model(assets.carModel, { name: "typed playable sports car", castShadow: true })\n      .position(0, CAR_RIDE_Y, 0)\n      .scale(1)');
    expect(source).toContain("centerX: ((-0.75 + 5.9) / 2) * ROUTE_SCALE");
    expect(source).toContain("centerZ: ((-0.9 + 3.9) / 2) * ROUTE_SCALE");
    expect(source).toContain(".position(ROUTE_BOUNDS.centerX, TRACK_Y, ROUTE_BOUNDS.centerZ)");
    expect(source).toContain(".position(0.06 * ROUTE_SCALE, CAR_RIDE_Y, 0.2 * ROUTE_SCALE)");
    expect(source).toContain(".position(0.1 * ROUTE_SCALE, CAR_RIDE_Y - 0.1, 0.05 * ROUTE_SCALE)");
    expect(source).toContain('.scale([0.7, 1.2, 4.2])');
    expect(source).toContain('finishMarker.setScale(state.status === "finished" ? [1.15, 0.08, 0.14] : [0.86, 0.08, 0.12])');
    for (const [x, z] of points) {
      expect(source).toContain(`{ x: ${x} * ROUTE_SCALE, y: ${z} * ROUTE_SCALE }`);
    }
    expect(readFileSync(resolve(root, "packages/rendering/src/contracts/flags.state.ts"), "utf8")).toContain('A3D_QR_CAMERA: "default-on"');
    expect(readFileSync(resolve(root, "packages/engine/src/agent-api/GameRuntimeCore.ts"), "utf8")).toContain("model.setVelocity(next.speed ?? 0)");
    expect(readFileSync(resolve(root, "packages/engine/src/agent-api/SceneGroundingUtils.ts"), "utf8")).toContain("AURA_NORMALIZED_MODEL_MAX_DIMENSION = 1.55");
    expect(readFileSync(resolve(root, "packages/engine/src/agent-api/sceneMath.ts"), "utf8")).toContain('return node?.scaleMode !== "world"');

    // The closed route's first segment contains 4% of its total length.
    const route = points.map(([x, z]) => [x * 3.5, z * 3.5] as const);
    const lengths = route.map(([x, z], i) => Math.hypot(route[(i + 1) % route.length]![0] - x, route[(i + 1) % route.length]![1] - z));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    const t = total * 0.04 / lengths[0]!;
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
    const dx = route[1]![0] - route[0]![0], dz = route[1]![1] - route[0]![1];
    const heading = Math.atan2(dz, dx), yaw = -heading + Math.PI / 2;
    const position: Vec3 = [route[0]![0] + dx * t, 1.206, route[0]![1] + dz * t];
    expect(position[0]).toBeCloseTo(1.096112, 5);
    expect(position[2]).toBeCloseTo(-1.454455, 5);
    const racing = createGameRacingKit({
      route: {
        id: "starter-kart-loop", width: 2.2 * 3.5,
        points: route.map(([x, y]) => ({ x, y })),
        checkpoints: [0.14, 0.27, 0.4, 0.53, 0.66, 0.79]
      },
      startProgress: 0.04, checkpointRadius: 0.08, lapsToWin: 3,
      maxSpeed: 40, acceleration: 60, drag: 1.4, steerRate: 2.85, model: "bicycle", chassis: true
    });
    const initial = racing.snapshot();
    expect(initial.position.x).toBeCloseTo(position[0], 5);
    expect(initial.position.y).toBeCloseTo(position[2], 5);
    expect(initial.heading).toBeCloseTo(heading, 5);
    expect(initial.speed).toBe(0);
    for (let frame = 0; frame < 120; frame += 1) {
      const state = racing.step(1 / 60, { throttle: false, brake: false, steer: 0, drift: false, boost: false });
      expect(state.position.x).toBeCloseTo(position[0], 5);
      expect(state.position.y).toBeCloseTo(position[2], 5);
      expect(state.heading).toBeCloseTo(heading, 5);
      expect(state.speed).toBeCloseTo(0, 6);
      expect(state.offTrack).toBe(false);
      expect(state.checkpoint).toBe(0);
    }
    const rig = createChaseRig({
      target: "race-car", fov: { base: 60, perSpeed: 0.4 },
      lookAhead: { seconds: 0.35, max: 4 }, bank: { gain: 0.5, maxDeg: 6 }
    });
    const subject = {
      position,
      velocity: [0, 0, 0] as Vec3,
      forward: [Math.sin(yaw), 0, Math.cos(yaw)] as Vec3,
      bounds: { min: position, max: position }
    };
    let pose: AuraCameraPose = { position: [0, 1.6, 5], target: [0, 1, 0], up: [0, 1, 0], roll: 0, fov: 60, near: 0.1, far: 1000 };
    rig.reset?.(pose);
    for (let frame = 0; frame < 120; frame += 1) {
      pose = rig.update({
        dt: 1 / 60, time: frame * 1000 / 60, aspect: WIDTH / HEIGHT, previous: pose,
        subject: (ref) => ref === "race-car" ? subject : undefined,
        probe: { sphereCast: () => ({ hit: false, distance: 0 }), occluders: () => [] }
      });
    }
    expect(pose.position[0]).toBeCloseTo(-2.800276, 5);
    expect(pose.position[1]).toBeCloseTo(3.006, 5);
    expect(pose.position[2]).toBeCloseTo(-0.549936, 5);
    expect(pose.target[0]).toBeCloseTo(position[0], 5);
    expect(pose.target[1]).toBeCloseTo(2.406, 5);
    expect(pose.target[2]).toBeCloseTo(position[2], 5);
    expect(pose.fov).toBe(60);

    type Accessor = { bufferView: number; byteOffset?: number; componentType: number; type: string; count: number; min?: number[]; max?: number[] };
    type RigidGlb = {
      scenes: Array<{ nodes: number[] }>;
      nodes: Array<{ children?: number[]; mesh?: number; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }>;
      meshes: Array<{ primitives: Array<{ attributes: { POSITION: number }; indices: number; material: number }> }>;
      accessors: Accessor[];
      bufferViews: Array<{ byteOffset?: number; byteStride?: number }>;
      materials: Array<{ name: string; doubleSided?: boolean; emissiveFactor?: number[]; pbrMetallicRoughness?: { baseColorFactor?: number[]; baseColorTexture?: unknown } }>;
      images?: unknown[];
    };
    const readGlb = (name: string) => {
      const bytes = readFileSync(resolve(root, `packages/create-aura3d/templates/racing-starter/public/aura-assets/${name}`));
      expect(bytes.toString("ascii", 0, 4)).toBe("glTF");
      const jsonLength = bytes.readUInt32LE(12);
      const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")) as RigidGlb;
      expect(json.scenes[0]!.nodes).toEqual([0]);
      expect(json.nodes[0]!.children).toEqual([1]);
      expect(json.nodes[1]!.children!.map((node) => json.nodes[node]!.mesh)).toEqual(json.meshes.map((_, index) => index));
      expect(json.nodes[0]!.matrix).toEqual([1, 0, 0, 0, 0, 2.220446049250313e-16, -1, 0, 0, 1, 2.220446049250313e-16, 0, 0, 0, 0, 1]);
      for (const node of [json.nodes[1]!, ...json.nodes[1]!.children!.map((index) => json.nodes[index]!)]) {
        expect(node.matrix).toBeUndefined();
        expect(node.translation).toBeUndefined();
        expect(node.rotation).toBeUndefined();
        expect(node.scale).toBeUndefined();
      }
      return { bytes, json, binStart: 20 + jsonLength + 8 };
    };
    const car = readGlb("showcaseCleanSportsCar.1c69283f.glb");
    const circuit = readGlb("showcaseReadableKartCircuit.5cbb912e.glb");
    expect(car.json.images ?? []).toEqual([]);
    const orange = car.json.materials[0]!, red = car.json.materials[5]!;
    expect(orange.name).toBe("Material.001");
    expect(orange.pbrMetallicRoughness?.baseColorFactor).toEqual([1, 0.5122415946564827, 0, 1]);
    expect(orange.pbrMetallicRoughness?.baseColorTexture).toBeUndefined();
    expect(red.name).toBe("Material.006");
    expect(red.pbrMetallicRoughness?.baseColorFactor).toEqual([1, 0, 0, 1]);
    expect(red.emissiveFactor).toEqual([1, 0, 0]);
    expect(red.pbrMetallicRoughness?.baseColorTexture).toBeUndefined();
    const srgb = (value: number) => Math.round(255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055));
    for (const [factor, band] of [
      [orange.pbrMetallicRoughness!.baseColorFactor!, entry.regions[0]!.colors[0]!],
      [red.pbrMetallicRoughness!.baseColorFactor!, entry.regions[0]!.colors[1]!]
    ] as const) {
      for (const [axis, range] of [band.red, band.green, band.blue].entries()) {
        expect(srgb(factor[axis]!)).toBeGreaterThanOrEqual(range[0]);
        expect(srgb(factor[axis]!)).toBeLessThanOrEqual(range[1]);
      }
    }

    // Both GLBs have the same -90-degree X root transform and otherwise
    // identity mesh parents. Bounds are the union of transformed accessors,
    // not the larger, differently oriented manifest size.
    const rootTransform = ([x, y, z]: Vec3): Vec3 => [x, z, -y];
    const bounds = (gltf: RigidGlb) => {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
        const a = gltf.accessors[primitive.attributes.POSITION]!;
        for (let bits = 0; bits < 8; bits += 1) {
          const p = rootTransform([0, 1, 2].map((axis) => bits & (1 << axis) ? a.max![axis]! : a.min![axis]!) as unknown as Vec3);
          for (let axis = 0; axis < 3; axis += 1) {
            min[axis] = Math.min(min[axis]!, p[axis]!);
            max[axis] = Math.max(max[axis]!, p[axis]!);
          }
        }
      }
      return { min: min as unknown as Vec3, max: max as unknown as Vec3 };
    };
    const carBounds = bounds(car.json), circuitBounds = bounds(circuit.json);
    const fitting = (box: { min: Vec3; max: Vec3 }) => {
      const scale = 1.55 / Math.max(...box.max.map((value, axis) => value - box.min[axis]!));
      return { scale, center: [(box.min[0] + box.max[0]) / 2, box.min[1], (box.min[2] + box.max[2]) / 2] as Vec3 };
    };
    const carFit = fitting(carBounds), trackFit = fitting(circuitBounds);
    expect(carFit.scale).toBeCloseTo(0.4872997, 6);
    expect(trackFit.scale).toBeCloseTo(0.0628774, 6);
    const worldCar = (raw: Vec3): Vec3 => {
      const v = rootTransform(raw).map((value, axis) => (value - carFit.center[axis]!) * carFit.scale);
      return [
        position[0] + Math.cos(yaw) * v[0]! + Math.sin(yaw) * v[2]!,
        position[1] + v[1]!,
        position[2] - Math.sin(yaw) * v[0]! + Math.cos(yaw) * v[2]!
      ];
    };
    const region = entry.regions[0]!;
    // Re-run the relevant frame-input path with the real typed GLB bytes and
    // default-on app flags. The offline fetch stub permits only these two
    // in-memory assets. No browser, GPU, image capture, or network is used.
    const flags = resolveQrFlags({ options: ["game"], env: {} });
    expect(flags.on("A3D_QR_CORE")).toBe(true);
    expect(flags.on("A3D_QR_CAMERA")).toBe(true);
    expect(flags.on("A3D_QR_COMPILER")).toBe(true);
    // Pin the app/renderer wiring separately: this test reconstructs the
    // relevant input and does not claim to have mounted the template.
    const appCore = readFileSync(resolve(root, "packages/engine/src/agent-api/app/createAuraAppCore.ts"), "utf8");
    const renderer = readFileSync(resolve(root, "packages/engine/src/agent-api/compiler/renderer.ts"), "utf8");
    const compiler = readFileSync(resolve(root, "packages/engine/src/agent-api/compiler/compileScene.ts"), "utf8");
    expect(appCore).toContain('setPrd01ModelMatrixCache(qrFlags.on("A3D_QR_CORE") ? createModelMatrixCache(modelMatrixFor(qrFlags)) : null, runtimeOwner)');
    expect(appCore).toContain('setPrd01ColorParsing(qrFlags.on("A3D_QR_CORE") ? { strict: options.strict ?? qrFlags.on("A3D_QR_STRICT") } : null, runtimeOwner)');
    expect(appCore).toMatch(/mountAbort\.signal,\s*runtimeOwner,/);
    expect(renderer).toContain("const runtimeOwner = mountContext?.runtimeOwner ?? canvas");
    expect(renderer).toMatch(/const sceneCompileCtx:[\s\S]*?=\s*\{[\s\S]*?\bruntimeOwner,/);
    expect(renderer).toMatch(/createProductionRuntimeRendererInput\([\s\S]*?textureResidency,\s*undefined,\s*runtimeOwner\s*\)/);
    expect(compiler).toMatch(/createProductionRuntimeRendererInput\([\s\S]*?\{\s*owner:\s*impl,\s*snapshot\s*\},\s*ctx\.runtimeOwner\s*\)/);
    const owner = {}, disabledOwner = {};
    const releaseMatrix = setPrd01ModelMatrixCache(createModelMatrixCache(modelMatrixFor(flags)), owner);
    const releaseColor = setPrd01ColorParsing({ strict: flags.on("A3D_QR_STRICT") }, owner);
    const releaseDisabledColor = setPrd01ColorParsing(null, disabledOwner);
    setTypedGLBActorQrFlags(flags, owner);
    // The route's CSS hex colors parse to the same linear values in the
    // owner-scoped and legacy paths; the GLB factors are checked separately.
    for (const color of ["#7ff0c5", "#f9f1d0", "#c98a5a"]) {
      const scoped = withPrd01ColorParsing(owner, () => colorToLinearRgb(color));
      const legacy = withPrd01ColorParsing(disabledOwner, () => colorToLinearRgb(color));
      scoped.forEach((channel, axis) => expect(channel).toBeCloseTo(legacy[axis]!, 12));
    }
    const assetManifest = JSON.parse(readFileSync(resolve(root, "packages/create-aura3d/templates/racing-starter/aura.assets.json"), "utf8")) as {
      assets: Array<{ id: string; url: string; hash: string; bounds: [number, number, number]; license: string; author: string; sourcePage: string }>;
    };
    const typedSource = readFileSync(resolve(root, "packages/create-aura3d/templates/racing-starter/src/aura-assets.ts"), "utf8");
    const definition = (id: string) => {
      const asset = assetManifest.assets.find((candidate) => candidate.id === id)!;
      expect(asset).toBeDefined();
      expect(typedSource).toContain(`url: "${asset.url}"`);
      expect(typedSource).toContain(`hash: "${asset.hash}"`);
      expect(typedSource).toContain(`bounds: [${asset.bounds.join(", ")}]`);
      return {
        type: "model" as const, format: "glb" as const, url: asset.url, hash: asset.hash, bounds: asset.bounds,
        metadata: { license: asset.license, author: asset.author, sourcePage: asset.sourcePage }
      };
    };
    const racingAssets = defineAuraAssets({ carModel: definition("carModel"), trackModel: definition("trackModel") });
    const snapshot = scene()
      .add(model(racingAssets.trackModel, { name: "typed kart circuit asset" }).position(9.0125, -1, 5.25).scale(1))
      .add(model(racingAssets.carModel, { name: "typed playable sports car", castShadow: true })
        .position(0, 1.206, 0).scale(1).runtime({ id: "race-car", tags: ["player", "vehicle", "typed-asset", "runtime"] }))
      .add(primitives.box({ name: "checkpoint marker", material: material.neon({ color: "#7ff0c5", emissive: "#7ff0c5", emissiveIntensity: 0.7 }) })
        .position(0.21, 1.206, 0.7).scale([0.7, 1.2, 4.2]).runtime({ id: "checkpoint-marker" }))
      .add(primitives.box({ name: "finish stripe", material: material.neon({ color: "#f9f1d0", emissive: "#f9f1d0", emissiveIntensity: 0.75 }) })
        .position(0.35, 1.106, 0.175).scale([3.8, 0.36, 0.5]).runtime({ id: "finish-marker" }))
      .camera(camera.perspective({ position: pose.position, target: pose.target, fov: pose.fov, near: pose.near, far: pose.far }))
      .toJSON();
    const nodes = snapshot.nodes.filter((node): node is AuraModelNode => node.kind === "model");
    expect(nodes).toHaveLength(2);
    const canvas = { width: WIDTH, height: HEIGHT } as HTMLCanvasElement;
    const registry = createAuraRuntimeNodeRegistry(snapshot, { flags });
    const handle = registry.require("race-car");
    handle.setPosition(...position).setRotation(0, yaw, 0);
    registry.require("finish-marker").setScale([0.86, 0.08, 0.12]);
    const primitiveEntries = withPrd01ColorParsing(owner, () =>
      createProductionRuntimePrimitiveEntries(snapshot.nodes, qrPrimitiveGeometryOptions(flags)));
    const offlineAssets = new Map([
      ["https://racing-fixture.invalid/aura-assets/showcaseCleanSportsCar.1c69283f.glb", car.bytes],
      ["https://racing-fixture.invalid/aura-assets/showcaseReadableKartCircuit.5cbb912e.glb", circuit.bytes]
    ]);
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const bytes = offlineAssets.get(url);
      if (!bytes) throw new Error(`Unexpected offline racing asset request: ${url}`);
      return new Response(new Uint8Array(bytes), { status: 200 });
    });
    const actors: TypedGLBActor[] = [];
    try {
      for (const node of nodes) {
        const actor = await createTypedGLBActor({
          asset: { ...node.asset, url: new URL(node.asset.url, "https://racing-fixture.invalid").href },
          id: node.runtime?.id ?? node.asset.id, name: node.name, width: WIDTH, height: HEIGHT,
          runtimeOwner: owner, shareTextures: false
        });
        actors.push(actor);
      }
      const input = createProductionRuntimeRendererInput(
        snapshot, canvas, nodes.map((node, index) => ({ node, actor: actors[index]! })), primitiveEntries,
        0, registry, new Set(), { color: [0, 0, 0], intensity: 0 }, [], undefined, undefined, undefined, owner
      );
      const items = [...(input.source.collectRenderItems?.() ?? [])];
      const carItems = items.filter((item) => item.label?.startsWith("actor-1:"));
      const trackItems = items.filter((item) => item.label?.startsWith("actor-0:"));
      expect(carItems).toHaveLength(car.json.meshes.length);
      expect(trackItems).toHaveLength(circuit.json.meshes.length);
      expect(runtimeNodeQueryState(handle)?.renderItems).toEqual(carItems);
      const transform = (matrix: ArrayLike<number>, p: Vec3): Vec3 => [
        matrix[0]! * p[0] + matrix[4]! * p[1] + matrix[8]! * p[2] + matrix[12]!,
        matrix[1]! * p[0] + matrix[5]! * p[1] + matrix[9]! * p[2] + matrix[13]!,
        matrix[2]! * p[0] + matrix[6]! * p[1] + matrix[10]! * p[2] + matrix[14]!
      ];
      const samePoint = (actual: Vec3, expected: Vec3) =>
        actual.forEach((value, axis) => expect(value).toBeCloseTo(expected[axis]!, 5));
      for (const raw of [[0, 0, 0], [1, 2, 3], [-2, 3, -4]] as const) {
        for (const item of carItems) samePoint(transform(item.modelMatrix!, raw), worldCar(raw));
        const local = rootTransform(raw).map((value, axis) => (value - trackFit.center[axis]!) * trackFit.scale);
        const expected: Vec3 = [9.0125 + local[0]!, -1 + local[1]!, 5.25 + local[2]!];
        for (const item of trackItems) samePoint(transform(item.modelMatrix!, raw), expected);
      }
      for (const [name, expectedMin, expectedMax] of [
        ["checkpoint marker", [-0.14, 0.606, -1.4], [0.56, 1.806, 2.8]],
        ["finish stripe", [-0.08, 1.066, 0.115], [0.78, 1.146, 0.235]]
      ] as const) {
        const item = items.find((candidate) => candidate.label?.endsWith(`:${name}`));
        expect(item).toBeDefined();
        samePoint(transform(item!.modelMatrix!, [-0.5, -0.5, -0.5]), expectedMin);
        samePoint(transform(item!.modelMatrix!, [0.5, 0.5, 0.5]), expectedMax);
      }
      const materialName = (item: typeof carItems[number]) => {
        const value = item.material;
        return value && "baseMaterial" in value ? value.baseMaterial.name : value?.name;
      };
      const body = carItems.find((item) => materialName(item) === orange.name);
      const lamp = carItems.find((item) => materialName(item) === red.name);
      expect(body?.material?.getParameter("u_baseColor")).toEqual(orange.pbrMetallicRoughness!.baseColorFactor);
      expect(lamp?.material?.getParameter("u_baseColor")).toEqual(red.pbrMetallicRoughness!.baseColorFactor);
      expect(lamp?.material?.getParameter("u_emissiveColor")).toEqual(red.emissiveFactor);

      // Query handoff publishes rendered bounds, but this chase rig has no
      // framing/collision option: its aim and arm use the handle pose.
      const queriedSubject = subjectFromHandle(handle);
      const queriedRig = createChaseRig({
        target: "race-car", fov: { base: 60, perSpeed: 0.4 },
        lookAhead: { seconds: 0.35, max: 4 }, bank: { gain: 0.5, maxDeg: 6 }
      });
      let queriedPose: AuraCameraPose = { position: [0, 1.6, 5], target: [0, 1, 0], up: [0, 1, 0], roll: 0, fov: 60, near: 0.1, far: 1000 };
      queriedRig.reset?.(queriedPose);
      for (let frame = 0; frame < 120; frame += 1) {
        queriedPose = queriedRig.update({
          dt: 1 / 60, time: frame * 1000 / 60, aspect: WIDTH / HEIGHT, previous: queriedPose,
          subject: () => queriedSubject, probe: { sphereCast: () => ({ hit: false, distance: 0 }), occluders: () => [] }
        });
      }
      samePoint(queriedPose.position, pose.position);
      samePoint(queriedPose.target, pose.target);
      expect(queriedPose.fov).toBeCloseTo(pose.fov, 6);
      const vp = input.camera!.viewProjectionMatrix;
      for (const raw of [[0, 0, 0], [1, 2, 3], [-2, 3, -4]] as const) {
        const world = worldCar(raw), expected = project(world, pose.position, pose.target, pose.fov);
        const w = vp[3]! * world[0] + vp[7]! * world[1] + vp[11]! * world[2] + vp[15]!;
        const x = vp[0]! * world[0] + vp[4]! * world[1] + vp[8]! * world[2] + vp[12]!;
        const y = vp[1]! * world[0] + vp[5]! * world[1] + vp[9]! * world[2] + vp[13]!;
        expect((x / w + 1) * WIDTH / 2).toBeCloseTo(expected.x, 3);
        expect((1 - y / w) * HEIGHT / 2).toBeCloseTo(expected.y, 3);
      }
    } finally {
      releaseMatrix(); releaseColor(); releaseDisabledColor(); clearTypedGLBActorQrFlags(owner);
      registry.dispose();
      for (const actor of actors) actor.dispose();
      for (const entry of primitiveEntries) for (const resource of entry.resources) {
        resource.textureDisposer?.();
        resource.geometry.dispose();
        if (resource.shadowGeometry && resource.shadowGeometry !== resource.geometry) resource.shadowGeometry.dispose();
        resource.material.dispose();
        if (resource.texturedMaterial && resource.texturedMaterial !== resource.material) resource.texturedMaterial.dispose();
      }
      vi.unstubAllGlobals();
    }
    // The circuit has a similarly colored material. Its entire fitted AABB
    // projects well right of this region in the stationary chase pose.
    for (let bits = 0; bits < 8; bits += 1) {
      const p: Vec3 = [
        9.0125 + ((bits & 1 ? circuitBounds.max[0] : circuitBounds.min[0]) - trackFit.center[0]) * trackFit.scale,
        -1 + ((bits & 2 ? circuitBounds.max[1] : circuitBounds.min[1]) - trackFit.center[1]) * trackFit.scale,
        5.25 + ((bits & 4 ? circuitBounds.max[2] : circuitBounds.min[2]) - trackFit.center[2]) * trackFit.scale
      ];
      const screen = project(p, pose.position, pose.target, pose.fov);
      expect(screen.depth).toBeGreaterThan(0);
      expect(screen.x).toBeGreaterThan(region.x + region.width);
    }

    const readIndex = (a: Accessor, index: number): number => {
      const view = car.json.bufferViews[a.bufferView]!;
      const offset = car.binStart + (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + index * (a.componentType === 5123 ? 2 : 4);
      return a.componentType === 5123 ? car.bytes.readUInt16LE(offset) : car.bytes.readUInt32LE(offset);
    };
    const readPosition = (a: Accessor, index: number): Vec3 => {
      const view = car.json.bufferViews[a.bufferView]!;
      const offset = car.binStart + (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + index * (view.byteStride ?? 12);
      return [car.bytes.readFloatLE(offset), car.bytes.readFloatLE(offset + 4), car.bytes.readFloatLE(offset + 8)];
    };
    type Triangle = { mesh: number; offset: number; vertices: readonly [Vec3, Vec3, Vec3] };
    const triangles: Triangle[] = [];
    for (const [meshIndex, mesh] of car.json.meshes.entries()) {
      const primitive = mesh.primitives[0]!;
      const positions = car.json.accessors[primitive.attributes.POSITION]!;
      const indices = car.json.accessors[primitive.indices]!;
      expect(positions.componentType).toBe(5126);
      expect([5123, 5125]).toContain(indices.componentType);
      expect(car.json.materials[primitive.material]!.doubleSided).toBe(true);
      const vertices = Array.from({ length: positions.count }, (_, index) => worldCar(readPosition(positions, index)));
      for (let offset = 0; offset < indices.count; offset += 3) {
        triangles.push({
          mesh: meshIndex, offset,
          vertices: [vertices[readIndex(indices, offset)]!, vertices[readIndex(indices, offset + 1)]!, vertices[readIndex(indices, offset + 2)]!]
        });
      }
    }
    const occludedByCar = (point: Vec3, candidate: Triangle): boolean => {
      const direction = subtract(point, pose.position);
      return triangles.some((triangle) => {
        if (triangle === candidate) return false;
        const [a, b, c] = triangle.vertices, e1 = subtract(b, a), e2 = subtract(c, a);
        const h = cross(direction, e2), determinant = dot(e1, h);
        if (Math.abs(determinant) < 1e-9) return false;
        const inverse = 1 / determinant, s = subtract(pose.position, a);
        const u = inverse * dot(s, h);
        if (u < 0 || u > 1) return false;
        const q = cross(s, e1), v = inverse * dot(direction, q);
        if (v < 0 || u + v > 1) return false;
        const distance = inverse * dot(e2, q);
        return distance > 1e-7 && distance < 0.99999;
      });
    };
    const occludedByBox = (point: Vec3, min: Vec3, max: Vec3): boolean => {
      const direction = subtract(point, pose.position);
      let near = 0, far = 1;
      for (let axis = 0; axis < 3; axis += 1) {
        const a = (min[axis] - pose.position[axis]) / direction[axis];
        const b = (max[axis] - pose.position[axis]) / direction[axis];
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
      }
      return far >= near && near < 1 && far > 0;
    };
    for (const [mesh, bandIndex] of [
      [4, 0],
      [5, 1]
    ] as const) {
      expect(car.json.meshes[mesh]!.primitives[0]!.material).toBe(mesh === 4 ? 0 : 5);
      const candidates = triangles.filter((triangle) => triangle.mesh === mesh).map((triangle) => {
        const screens = triangle.vertices.map((point) => project(point, pose.position, pose.target, pose.fov));
        return { triangle, screens, area: triangleArea(screens[0]!, screens[1]!, screens[2]!) };
      }).filter(({ screens }) => screens.every((point) => point.depth > 0 && inside(region, point)))
        .sort((a, b) => b.area - a.area);
      let projectedArea = 0;
      const selected: number[] = [];
      const requiredArea = region.width * region.height * region.colors[bandIndex]!.minFraction * 2;
      for (const { triangle, area } of candidates) {
        let clear = true;
        for (const weights of [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]] as const) {
          const point = triangle.vertices[0].map((_, axis) =>
            triangle.vertices.reduce((sum, vertex, index) => sum + vertex[axis]! * weights[index]!, 0)
          ) as unknown as Vec3;
          if (occludedByCar(point, triangle) ||
              occludedByBox(point, [-0.14, 0.606, -1.4], [0.56, 1.806, 2.8]) ||
              occludedByBox(point, [-0.08, 1.066, 0.115], [0.78, 1.146, 0.235])) {
            clear = false;
            break;
          }
        }
        if (!clear) continue;
        selected.push(triangle.offset);
        projectedArea += area;
        if (projectedArea > requiredArea && selected.length >= 3) break;
      }
      expect(selected.length, `mesh ${mesh} needs multiple independently projected triangles`).toBeGreaterThanOrEqual(3);
      expect(projectedArea, `mesh ${mesh} selected indices ${selected.join(",")}`).toBeGreaterThan(requiredArea);
    }
  }, 15_000);

  it("does not mistake the racing look and checkpoint colors for the typed car", () => {
    const entry = fixture().cases.find(({ id }) => id === "template:racing-starter")!;
    const region = entry.regions[0]!;
    const look = readFileSync(resolve(root, "packages/engine/src/agent-api/looks/lookPresets.ts"), "utf8");
    const source = readFileSync(resolve(root, entry.source.path), "utf8");
    expect(look).toContain('background: "#c98a5a"');
    expect(source).toContain('color: "#7ff0c5"');
    const synthetic = image();
    paint(synthetic, region.x, region.y, region.width, region.height, [0xc9, 0x8a, 0x5a]);
    paint(synthetic, region.x + 20, region.y + 20, 20, 60, [0x7f, 0xf0, 0xc5]);
    const result = compareNumericCatalogRegions(synthetic, WIDTH, HEIGHT, entry.regions)[0]!;
    expect(result.contrast).toBeGreaterThanOrEqual(region.minContrast);
    expect(result.colors[1]!.fraction).toBe(0);
    expect(result.pass).toBe(false);
  });

  it("validates the route-start fields (query, settle signal, driver, presentation) and fails closed on malformed ones", () => {
    expect(catalogRouteErrors({})).toEqual([]);
    expect(catalogRouteErrors({ query: "?autostart=1", settle: { signal: "__GAME__.ready", equals: true, timeoutMs: 30_000 } })).toEqual([]);
    expect(catalogRouteErrors({ presentation: "canvas2d", surface: { kind: "canvas" },
      settle: { signal: "__LAB__.status", equals: "ready" }, driver: { call: "__LAB__.render", args: [1, "a", null] } })).toEqual([]);
    expect(catalogRouteErrors({ settle: { signal: "__APP__.runtime.time", atLeast: 2 } })).toEqual([]);
    for (const bad of [
      { query: "autostart=1" }, { query: "?a=<script>" }, { query: 1 },
      { settle: { signal: "window['x']" } }, { settle: { signal: "a.b", equals: 1, atLeast: 2 } },
      { settle: { signal: "a", timeoutMs: 500 } }, { settle: { signal: "a", extra: true } },
      { driver: { call: "__LAB__.render" } }, { settle: { signal: "a" }, driver: { call: "a.b()" } },
      { settle: { signal: "a" }, driver: { call: "a.b", args: [{}] } },
      { presentation: "webgl" }, { presentation: "canvas2d", surface: { kind: "svg" } }
    ]) expect(catalogRouteErrors(bad), JSON.stringify(bad)).not.toEqual([]);
    const original = fixture().cases[0]!;
    const { directory, path } = temporaryManifest({ schema: "aura3d.native-example-expectations/1", cases: [{ ...original, query: "start" }] });
    expect(() => loadExpectations(directory, path)).toThrow(/invalid route start/);
  });

  it("accepts only a bounded subject-colored sample in its own region, not blanks, wrong colors or misplaced subjects", () => {
    const samples: Record<string, readonly (readonly [number, number, number])[]> = {
      "capability-example:typed-model": [[246, 192, 156], [73, 103, 124]],
      "capability-example:bounds-query": [[246, 192, 156], [73, 103, 124]],
      "capability-example:postprocess": [[246, 192, 156], [73, 103, 124]],
      "capability-example:animation": [[246, 192, 156], [73, 103, 124]],
      "capability-example:controls": [[246, 192, 156], [73, 103, 124]],
      "template:arena-shooter": [[157, 184, 255]],
      "starter-example:instancing-performance": [[210, 200, 150], [137, 160, 205]],
      "template:prompt-animation-channel": [[125, 226, 255], [255, 225, 142]],
      "template:episode-builder": [[125, 226, 255], [255, 225, 142]],
      "template:product-viewer": [[173, 137, 20]],
      "template:falling-blocks-starter": [[240, 195, 90], [90, 220, 240]],
      "template:material-authoring": [[198, 111, 83]],
      "capability-example:custom-geometry": [[216, 138, 74]],
      "capability-example:material-lighting": [[180, 200, 212]],
      "capability-example:custom-shader": [[31, 143, 184]],
      "capability-example:world-text": [[224, 186, 113]],
      "capability-example:physics": [[219, 142, 74]],
      "capability-example:worker-render": [[246, 192, 156], [73, 103, 124]],
      "capability-example:interchange-export": [[216, 138, 74]],
      "starter-example:hello-world-typed-asset": [[151, 74, 10]],
      "starter-example:material-lighting": [[255, 0, 184], [0, 191, 255]],
      "starter-example:camera-path": [[159, 122, 68], [83, 221, 255]],
      "template:cinematic-scene": [[50, 221, 255]],
      "template:postprocess-scene": [[57, 142, 186], [223, 171, 135]],
      "template:racing-starter": [[255, 189, 0], [255, 0, 0]],
      // Template cases grounded in native-examples-catalog-templates.test.ts.
      "template:architecture-interior": [[123, 123, 166], [185, 116, 83]],
      "template:custom-scene": [[234, 145, 104], [220, 220, 233]],
      "template:asset-inspector": [[103, 103, 124], [244, 103, 67]],
      "template:character-viewer": [[171, 95, 65], [120, 190, 136]],
      "template:large-scene": [[100, 177, 137]],
      "template:premium-product-viewer": [[0, 120, 41], [138, 41, 22]],
      "template:mini-game": [[246, 190, 153], [110, 60, 60]],
      "template:character-controller": [[100, 65, 40], [215, 229, 236]],
      "template:fighting-game": [[100, 65, 40], [70, 20, 15]],
      "template:animation-channel": [[125, 226, 255]],
      "template:animation-studio": [[160, 163, 168]],
      // Documented examples: one sample inside each authored band.
      "documented-example:apps/postprocessing-custom": [[193,  110,  65]],
      "documented-example:apps/showcase-aura-fc-3d": [[160,  60,  55]],
      "documented-example:apps/showcase-aura-hoops-3d": [[213,  118,  50]],
      "documented-example:apps/showcase-bean-brawl-race": [[198,  64,  64]],
      "documented-example:apps/showcase-cross-hop": [[80,  100,  45]],
      "documented-example:apps/showcase-kart-havoc": [[203,  105,  35]],
      "documented-example:apps/showcase-pips-big-leap": [[140,  60,  35],  [215,  150,  75]],
      "documented-example:apps/showcase-slingshot-siege": [[173,  113,  70]],
      "documented-example:apps/showcase-turbo-ball": [[203,  85,  40]],
      "documented-example:examples/context-recovery-lab": [[105,  198,  198],  [223,  188,  128]],
      "documented-example:examples/custom-attributes-lab": [[223,  30,  30],  [30,  30,  223]],
      "documented-example:examples/custom-material-lab": [[128,  64,  198]],
      "documented-example:examples/custom-shader-lab": [[203,  155,  90]],
      "documented-example:examples/material-showroom": [[75,  203,  140]],
      "documented-example:examples/parity-texture-lab": [[203,  120,  60],  [65,  188,  203]],
      "documented-example:examples/pbr-extension-texture-variants": [[163,  192,  178]],
      "documented-example:examples/rapier-character-lab": [[198,  113,  45]],
      "documented-example:examples/recast-crowd-lab": [[203,  118,  45]],
      "documented-example:examples/rendering-large-scene": [[80,  183,  170]],
      "documented-example:examples/shader-failure-lab": [[208,  173,  65]],
      "documented-example:examples/spatial-audio-lab": [[218,  170,  85]],
      "documented-example:examples/spatial-text-lab": [[203,  178,  120]],
      "documented-example:examples/tsl-lab": [[50,  153,  65]],
      "documented-example:examples/xr-lab": [[228,  35,  35]],
      "documented-example:examples/renderer-stress-lab": [[216,  155,  137]],
      "documented-example:apps/showcase-heatsink": [[248,  150,  40]],
      "documented-example:apps/showcase-aura-diamond-3d": [[184,  106,  66],  [70,  118,  50]],
      "documented-example:examples/external-product-configurator": [[190,  45,  35]],
      "documented-example:examples/postprocess-lab": [[175,  135,  125]],
      "documented-example:apps/showcase-digital-twin-ops": [[236,  233,  214]],
      "documented-example:apps/showcase-cinematic-architecture": [[45,  140,  30]],
      "documented-example:apps/showcase-dot-dash-3d": [[95,  243,  255]],
      "documented-example:apps/showcase-bunker-zero": [[45,  230,  235],  [48,  62,  70]],
      "documented-example:apps/showcase-aura-links-3d": [[118,  150,  152],  [225,  165,  132]],
      "documented-example:apps/showcase-top-tennis": [[43,  103,  142],  [240,  238,  228]],
      "documented-example:apps/showcase-iron-crown": [[235,  95,  45]],
      "documented-example:apps/showcase-roadster-rush": [[20,  55,  120]],
      "documented-example:apps/showcase-teleoperator": [[185,  188,  192]],
      "documented-example:apps/showcase-product-configurator": [[240,  147,  99]],
      "documented-example:apps/showcase-smart-city-control": [[101,  216,  232]],
      "documented-example:examples/heatsink-port": [[215,  120,  70]],
      "documented-example:apps/showcase-heatsink-port": [[215,  120,  70]],
      "documented-example:examples/drift-and-deliver-port": [[100,  190,  160]],
      "documented-example:apps/showcase-drift-and-deliver-port": [[100,  190,  160]],
      "documented-example:examples/last-train-port": [[150,  30,  25]],
      "documented-example:apps/showcase-last-train-port": [[150,  30,  25]],
      "documented-example:examples/kid-goku-beyond-the-clouds-port": [[40,  170,  140],  [190,  150,  40]],
      "documented-example:apps/showcase-cloud-runner-port": [[40,  170,  140],  [190,  150,  40]],
      "documented-example:examples/ninja-runner-port": [[215,  90,  25],  [30,  45,  70]],
      "documented-example:apps/showcase-ninja-runner-port": [[215,  90,  25],  [30,  45,  70]],
      "documented-example:examples/roadster-hours-port": [[20,  95,  95],  [210,  120,  70]],
      "documented-example:apps/showcase-roadster-hours-port": [[20,  95,  95],  [210,  120,  70]],
      "documented-example:examples/silt-and-signal-port": [[228,  225,  215]],
      "documented-example:apps/showcase-silt-and-signal-port": [[228,  225,  215]],
      "documented-example:apps/showcase-serpentine-sky-run-port": [[150,  40,  50]],
      "documented-example:examples/splat-rush-port": [[220,  40,  35]],
      "documented-example:apps/showcase-splat-rush-port": [[220,  40,  35]],
      "documented-example:examples/strange-orbit-port": [[205,  140,  100]],
      "documented-example:apps/showcase-strange-orbit-port": [[205,  140,  100]],
      "documented-example:examples/where-the-wind-wanders-port": [[80,  95,  55]],
      "documented-example:apps/showcase-where-the-wind-wanders-port": [[80,  95,  55]],
      "documented-example:examples/10-particles": [[240,  175,  70]],
      "documented-example:examples/animated-character": [[245,  200,  75]],
      "documented-example:examples/animation-state-machine": [[255,  141,  99]],
      "documented-example:examples/raycast-ccd-lab": [[51,  230,  255],  [255,  179,  46]],
      "documented-example:examples/parity-animation": [[190,  135,  95]],
      "documented-example:examples/parity-runtime-lab": [[42,  108,  255]],
      "documented-example:examples/custom-draw-probe": [[250,  10,  10]],
      "documented-example:examples/external-asset-gallery": [[168,  111,  45]],
      "documented-example:examples/external-interactive-showcase": [[216,  106,  53]],
      "documented-example:examples/external-editor-authored-app": [[255,  136,  68]],
      "documented-example:examples/foundation-editor-authored-app": [[255,  136,  68]],
      "documented-example:examples/external-interior-scene": [[63,  124,  239]],
      "documented-example:examples/external-material-studio": [[39,  144,  243]],
      "documented-example:examples/external-extension-lab": [[27,  245,  255]],
      "documented-example:examples/external-character-viewer": [[201,  147,  55]],
      "documented-example:examples/asset-viewer": [[173,  137,  20]],
      "documented-example:examples/post-order-lab": [[245,  60,  245]],
      "documented-example:examples/custom-shader-webgpu-lab": [[220,  80,  60]],
      "documented-example:examples/product-configurator": [[190,  45,  35]],
      "documented-example:examples/character-animation-viewer": [[200,  140,  55]],
      "documented-example:examples/saiyan-snake-way-port": [[150,  40,  50]],
      "documented-example:examples/aura-slam": [[43,  103,  142],  [240,  238,  228]]
    };
    // Patch width per band where the default half-region patch falls outside a
    // case's authored fraction bounds, and a warm wrong color for cyan/teal subjects.
    const sampleScale: Record<string, number> = { "template:racing-starter": 0.4, "documented-example:apps/showcase-slingshot-siege": 0.62, "documented-example:examples/custom-attributes-lab": 0.6, "documented-example:examples/custom-material-lab": 0.6, "documented-example:examples/tsl-lab": 0.61 , "documented-example:apps/showcase-top-tennis": 0.9, "documented-example:examples/animation-state-machine": 0.8, "documented-example:examples/parity-runtime-lab": 0.8, "documented-example:examples/custom-draw-probe": 0.8, "documented-example:examples/post-order-lab": 0.7, "documented-example:examples/custom-shader-webgpu-lab": 0.7, "documented-example:examples/character-animation-viewer": 0.7, "documented-example:examples/aura-slam": 0.9};
    const warmWrong = new Set(["documented-example:examples/context-recovery-lab", "documented-example:examples/rendering-large-scene", "documented-example:apps/showcase-dot-dash-3d", "documented-example:apps/showcase-bunker-zero", "documented-example:apps/showcase-top-tennis", "documented-example:examples/kid-goku-beyond-the-clouds-port", "documented-example:apps/showcase-cloud-runner-port", "documented-example:examples/parity-runtime-lab", "documented-example:examples/external-interior-scene", "documented-example:examples/external-material-studio", "documented-example:examples/aura-slam"]);
    const data = fixture();
    expect(new Set(data.cases.map(({ id }) => id))).toEqual(new Set(Object.keys(samples)));
    for (const entry of data.cases) {
      const region = entry.regions[0]!;
      const colors = samples[entry.id]!;
      const right = image();
      const width = Math.floor(region.width * (sampleScale[entry.id] ?? 0.5) / colors.length);
      const height = Math.floor(region.height * 0.5);
      colors.forEach((color, index) => paint(right, region.x + 10 + index * width, region.y + 10, width, height, color));
      expect(compareNumericCatalogRegions(right, WIDTH, HEIGHT, entry.regions)[0]?.pass, entry.id).toBe(true);

      if (colors.length > 1) {
        colors.forEach((_color, missing) => {
          const incomplete = image();
          colors.forEach((color, index) => {
            if (index !== missing) paint(incomplete, region.x + 10 + index * width, region.y + 10, width, height, color);
          });
          const result = compareNumericCatalogRegions(incomplete, WIDTH, HEIGHT, entry.regions)[0]!;
          expect(result.colors[missing]!.fraction).toBe(0);
          expect(result.pass).toBe(false);
        });
      }

      const wrong = image();
      const wrongColor = entry.id.endsWith("custom-shader") || warmWrong.has(entry.id) ? [216, 138, 74] : [31, 143, 184];
      paint(wrong, region.x + 10, region.y + 10, width, height, wrongColor);
      const wrongResult = compareNumericCatalogRegions(wrong, WIDTH, HEIGHT, entry.regions)[0]!;
      expect(wrongResult.contrast).toBeGreaterThanOrEqual(region.minContrast);
      expect(wrongResult.colors[0]?.fraction).toBe(0);
      expect(wrongResult.pass).toBe(false);
      expect(compareNumericCatalogRegions(image(), WIDTH, HEIGHT, entry.regions)[0]?.pass).toBe(false);

      const misplaced = image();
      paint(misplaced, 0, 0, width, height, colors[0]!);
      expect(compareNumericCatalogRegions(misplaced, WIDTH, HEIGHT, entry.regions)[0]?.pass).toBe(false);

      const flood = image();
      paint(flood, region.x, region.y, region.width, region.height, colors[0]!);
      const flooded = compareNumericCatalogRegions(flood, WIDTH, HEIGHT, entry.regions)[0]!;
      expect(flooded.colors[0]?.fraction).toBe(1);
      expect(flooded.colors[0]?.pass).toBe(false);
    }
  }, 20_000);
});
