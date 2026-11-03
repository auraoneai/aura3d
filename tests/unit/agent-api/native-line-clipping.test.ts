import { describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../../../packages/rendering/src/lanes/prd01";
import { DirectionalLight, identityMat4 } from "@aura3d/scene";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { lineNodeHandler, pointsNodeHandler, spriteNodeHandler } from "../../../packages/engine/src/agent-api/compiler/lines";
import { createProductionRuntimeRendererInput } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { flattenSceneNodesV2 } from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { attachRootRenderSource } from "../../../packages/engine/src/agent-api/RootRuntimeSupport";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { clipping } from "../../../packages/engine/src/agent-api/nodes/clipping";
import { lines } from "../../../packages/engine/src/agent-api/nodes/lines";
import { points } from "../../../packages/engine/src/agent-api/nodes/points";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { sprites } from "../../../packages/engine/src/agent-api/nodes/sprites";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import type { SceneCompileContext } from "../../../packages/engine/src/contracts/compiler";
import type { AuraSceneNode } from "../../../packages/engine/src/agent-api/nodes/types";
import { ForwardPass, registerForwardDrawHook } from "../../../packages/rendering/src/ForwardPass";
import { DepthPass } from "../../../packages/rendering/src/DepthPass";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { clippingRetainsPoint, createClippingBinding } from "../../../packages/rendering/src/ClippingPlanes";
import type { Material } from "../../../packages/rendering/src/Material";
import { MockRenderDevice, type RenderBuffer, type RenderShaderProgram, type ShaderSources } from "../../../packages/rendering/src/RenderDevice";
import { Texture } from "../../../packages/rendering/src/Texture";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";

const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_PARITY_LINES: true });
const context = {
  flags: resolveQrFlags({ options: { A3D_PARITY_LINES: true } }),
  canvas: { width: 800, height: 400, clientWidth: 400 },
  strict: false, quality: { tier: "high" }, renderer: null, assets: null,
  degrade: () => undefined
} as unknown as SceneCompileContext;

class CaptureDevice extends MockRenderDevice {
  readonly sources: ShaderSources[] = [];
  frameUniformBuffer?: RenderBuffer;
  override createShaderProgram(source: ShaderSources): RenderShaderProgram {
    this.sources.push(source);
    return super.createShaderProgram(source);
  }
  override bindUniformBuffer(buffer: RenderBuffer, binding: number): void {
    if (binding === 0) this.frameUniformBuffer = buffer;
    super.bindUniformBuffer(buffer, binding);
  }
}

function sink() {
  const items: RenderItem[] = [];
  return { items, addItems(next: readonly RenderItem[]) { items.push(...next); }, feature() {}, set() {}, addLights() {} };
}

function multiplyMatrices(left: ArrayLike<number>, right: ArrayLike<number>): Float32Array {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) for (let row = 0; row < 4; row += 1) {
    result[column * 4 + row] = Array.from({ length: 4 }, (_, k) => left[k * 4 + row]! * right[column * 4 + k]!)
      .reduce((sum, value) => sum + value, 0);
  }
  return result;
}

function compile(node: AuraSceneNode) {
  const handler = node.kind === "line" ? lineNodeHandler : node.kind === "points" ? pointsNodeHandler : spriteNodeHandler;
  const out = sink();
  handler.compile(node as never, context, out as never);
  handler.update!(node as never, undefined, context, out as never, 0);
  return { item: out.items[0]!, dispose: () => handler.dispose!(node as never) };
}

// Root render sources attach only to a DOM canvas (isHtmlCanvas); a bare
// { width, height } object is treated as a worker canvas and has none.
function htmlCanvas(width: number, height: number): HTMLCanvasElement {
  return { width, height, getBoundingClientRect: () => ({ width, height, left: 0, top: 0 }) } as unknown as HTMLCanvasElement;
}

describe("line, point and sprite clipping propagation", () => {
  it("retains live material groups across scene snapshots and disposes only compiler resources", () => {
    const group = clipping.material({ planes: [[0, 1, 0, -2]], space: "local", combine: "union", clipShadows: true });
    const spec = { color: "#ff0000", opacity: 0.5, clipping: group };
    const nodes = [
      lines.line({ points: [[0, 0, 0], [1, 0, 0]], material: spec, position: [2, 3, 4] }),
      lines.fat({ points: [[0, 0, 0], [1, 0, 0]], material: spec, width: 4, worldUnits: true }),
      lines.line({ points: [[0, 0, 0], [1, 0, 0]], material: spec, dashed: true, dashSize: 2, gapSize: 1 }),
      points({ positions: [[0, 0, 0]], material: spec, size: 5, sizeAttenuation: false }),
      sprites.sprite({ material: spec, center: [0.25, 0.75], spriteRotation: 0.4, scale: [2, 3, 1] })
    ];
    const snapshot = scene({ children: nodes }).toJSON();
    const compiled = snapshot.nodes.map(compile);
    try {
      for (const { item } of compiled) {
        const material = item.material as Material;
        expect(item.materialClipping).toBe(group);
        expect(material.getParameter("u_baseColor")).toEqual([1, 0, 0, 0.5]);
        expect(material.renderState.blend).toBe(true);
        expect(material.renderState.depthWrite).toBe(false);
      }
      expect(compiled.map(({ item }) => item.geometry.topology)).toEqual(["lines", "triangles", "triangles", "points", "triangles"]);
      expect(Array.from(compiled[0]!.item.modelMatrix!)[12]).toBe(2);
      expect(compiled[1]!.item.material?.getParameter("u_lineWidth")).toBe(4);
      expect(compiled[1]!.item.material?.getParameter("u_lineWorldUnits")).toBe(1);
      expect(compiled[2]!.item.material?.getParameter("u_lineDashSize")).toBe(2);
      expect(compiled[3]!.item.material?.getParameter("u_pointSize")).toBe(10);
      expect(compiled[4]!.item.material?.getParameter("u_spriteCenter")).toEqual([0.25, 0.75]);
      expect(compiled[4]!.item.material?.getParameter("u_spriteRotation")).toBe(0.4);

      group.update({ planes: [[0, 1, 0, -3]], enabled: false });
      for (const { item } of compiled) {
        expect(item.materialClipping?.planes).toEqual([[0, 1, 0, -3]]);
        expect(item.materialClipping?.enabled).toBe(false);
      }
      const first = snapshot.nodes[0]!;
      if (first.kind !== "line") throw new Error("expected a line node");
      expect(first.material?.clipping?.planes).toEqual([[0, 1, 0, -2]]);
    } finally {
      for (const result of compiled) result.dispose();
    }
    for (const { item } of compiled) expect((item.material as Material).disposed).toBe(true);
    expect(group.disposed).toBe(false);
    group.dispose();
  });

  it("keeps the live group when a dynamic line replaces its material after an alpha edit", () => {
    const local = clipping.material({ planes: [[1, 0, 0, 0]], space: "local" });
    const snapshot = scene().add(lines.line({ points: [[0, 0, 0], [1, 0, 0]],
      material: { clipping: local }, runtime: { id: "dynamic-line" } })).toJSON();
    const node = snapshot.nodes[0]!;
    if (node.kind !== "line") throw new Error("expected a line node");
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const handle = registry.require("dynamic-line");
    const first = sink();
    lineNodeHandler.compile(node, context, first as never);
    try {
      lineNodeHandler.update!(node, handle, context, first as never, 0);
      const original = first.items[0]!.material as Material;
      handle.updateAttribute!("color", { offset: 1, array: [1, 1, 1, 0.5] });
      const next = sink();
      lineNodeHandler.update!(node, handle, context, next as never, 0);
      const replacement = next.items[0]!.material as Material;
      expect(replacement).not.toBe(original);
      expect(original.disposed).toBe(true);
      expect(replacement.renderState.blend).toBe(true);
      expect(next.items[0]!.materialClipping).toBe(local);
      local.update({ planes: [[1, 0, 0, -2]] });
      expect(next.items[0]!.materialClipping?.planes).toEqual([[1, 0, 0, -2]]);
    } finally { lineNodeHandler.dispose!(node); registry.dispose(); }
    expect(local.disposed).toBe(false);
  });

  it("uses each runtime material after hierarchical flattening, including removal of a group", () => {
    const oldGroup = clipping.material({ planes: [[1, 0, 0, 0]] });
    const replacement = clipping.material({ planes: [[0, 1, 0, -3]], space: "local" });
    const snapshot = scene().add({ kind: "group", position: [4, 0, 0], children: [
      lines.line({ points: [[0, 0, 0], [1, 0, 0]], material: { clipping: oldGroup }, runtime: { id: "line" } }).toJSON(),
      points({ positions: [[0, 0, 0]], material: { clipping: oldGroup }, runtime: { id: "points" } }).toJSON(),
      sprites.sprite({ material: { clipping: oldGroup }, runtime: { id: "sprite" } }).toJSON()
    ] }).toJSON();
    const registry = createAuraRuntimeNodeRegistry(snapshot);
    const flattened = flattenSceneNodesV2(snapshot.nodes);
    try {
      for (const node of flattened) {
        if (node.kind !== "line" && node.kind !== "points" && node.kind !== "sprite") throw new Error("expected a line-like node");
        const handler = node.kind === "line" ? lineNodeHandler : node.kind === "points" ? pointsNodeHandler : spriteNodeHandler;
        const handle = registry.require(node.runtime!.id!);
        const first = sink();
        handler.compile(node as never, context, first as never);
        try {
          handler.update!(node as never, handle, context, first as never, 0);
          expect(first.items[0]!.materialClipping).toBe(oldGroup);
          handle.setMaterial({ clipping: replacement });
          const changed = sink();
          handler.update!(node as never, handle, context, changed as never, 0);
          expect(changed.items[0]!.materialClipping).toBe(replacement);
          handle.setMaterial({ color: "#ffffff" });
          const removed = sink();
          handler.update!(node as never, handle, context, removed as never, 0);
          expect(removed.items[0]).not.toHaveProperty("materialClipping");
        } finally { handler.dispose!(node as never); }
      }
    } finally { registry.dispose(); }
  });

  it("binds scene-global and object-local planes on generated thin-line and point draws", () => {
    for (const makeNode of [
      (material: { clipping: ReturnType<typeof clipping.material> }) => lines.line({ points: [[0, 0, 0], [2, 0, 0]], material, position: [4, 0, 0] }),
      (material: { clipping: ReturnType<typeof clipping.material> }) => points({ positions: [[0, 0, 0]], material, size: 6, sizeAttenuation: false, position: [4, 0, 0] })
    ]) {
      const global = clipping.global({ planes: [[2, 0, 0, -4]] });
      const local = clipping.material({ planes: [[0, 2, 0, -6], [0, 0, 1, 1]], space: "local", combine: "union" });
      const snapshot = scene({ clipping: global }).add(makeNode({ clipping: local })).toJSON();
      const compiled = compile(snapshot.nodes[0]!);
      const canvas = htmlCanvas(800, 400);
      const detach = attachRootRenderSource(canvas, { source: { collectRenderItems: () => [compiled.item] } });
      const device = new CaptureDevice();
      setRendererQrFlags(flags, device);
      try {
        const input = createProductionRuntimeRendererInput(snapshot, canvas, [], [], 0, undefined, new Set(), { color: [0, 0, 0], intensity: 0 }, []);
        expect(input.source.globalClipping).toBe(global);
        expect(input.source.staticBatching).toBe(false);
        const items = [...input.source.collectRenderItems!()];
        expect(items[0]!.materialClipping).toBe(local);
        device.beginFrame(8, 8);
        new ForwardPass({ items, globalClipping: input.source.globalClipping }).execute({ device, width: 8, height: 8 });
        expect(device.drawCommands).toHaveLength(1);
        const uniforms = device.drawCommands[0]!.uniforms!;
        expect(uniforms.get("u_a3dClipGroupCount")).toBe(2);
        expect(Array.from(uniforms.get("u_a3dClipGroups") as Float32Array)).toEqual([0, 1, 0, 0, 1, 2, 1, 1]);
        expect(Array.from((uniforms.get("u_a3dClipPlanes") as Float32Array).slice(0, 12))).toEqual([1, 0, 0, -2, 0, 1, 0, -3, 0, 0, 1, 1]);
        expect((uniforms.get("u_modelMatrix") as Float32Array)[12]).toBe(4);
        if (compiled.item.geometry.topology === "points") expect(uniforms.get("u_pointSize")).toBe(12);
        expect(device.sources[0]!.vertex).toContain("v_worldPosition = a3dWorld.xyz");
        expect(device.sources[0]!.vertex).toContain("v_a3dClipLocal = a3dLocal.xyz");
        expect(device.sources[0]!.fragment).toContain("a3dClipRetains(v_a3dClipWorld, v_a3dClipLocal)");

        local.update({ planes: [[0, 1, 0, -7]] });
        new ForwardPass({ items, globalClipping: input.source.globalClipping }).execute({ device, width: 8, height: 8 });
        expect((device.drawCommands[1]!.uniforms!.get("u_a3dClipPlanes") as Float32Array)[7]).toBe(-7);
      } finally { detach(); compiled.dispose(); device.dispose(); }
    }
  });

  it("preserves detached JSON snapshots for line, point and sprite materials", () => {
    const local = clipping.material({ planes: [[0, 0, 2, -4]], space: "local" });
    const snapshot = scene({ children: [
      lines.line({ points: [[0, 0, 0], [1, 0, 0]], material: { clipping: local } }),
      points({ positions: [[0, 0, 0]], material: { clipping: local } }),
      sprites.sprite({ material: { clipping: local } })
    ] }).toJSON();
    const restored = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;
    local.update({ planes: [[0, 0, 1, -9]] });
    for (const node of restored.nodes) {
      const compiled = compile(node);
      try {
        expect(compiled.item.materialClipping).not.toBe(local);
        expect(compiled.item.materialClipping).toMatchObject({ space: "local", planes: [[0, 0, 1, -2]] });
      } finally { compiled.dispose(); }
    }
  });

  it("keeps point attenuation, texture and alpha testing on the generated clipping variant", () => {
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 128]), colorSpace: "srgb" });
    const local = clipping.material({ planes: [[1, 0, 0, -1]], space: "world" });
    const node = points({ positions: [[1, 0, 0]], size: 6, sizeAttenuation: true, alphaTest: 0.25,
      map: { kind: "aura-texture-ref", texture } as never, material: { clipping: local } }).toJSON();
    const compiled = compile(node);
    const device = new CaptureDevice();
    setRendererQrFlags(flags, device);
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [compiled.item] }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(1);
      const uniforms = device.drawCommands[0]!.uniforms!;
      expect(uniforms.get("u_pointSize")).toBe(6);
      expect(uniforms.get("u_alphaCutoff")).toBe(0.25);
      expect(uniforms.get("u_pointMap")).toBeDefined();
      const source = device.sources[0]!;
      expect(source.vertex).toContain("#define A3D_PARITY_POINT_ATTENUATION 1");
      expect(source.fragment).toContain("#define A3D_PARITY_POINT_MAP 1");
      expect(source.fragment).toContain("texture(u_pointMap, gl_PointCoord)");
      expect(source.fragment).toContain("a3dClipRetains(v_a3dClipWorld, v_a3dClipLocal)");
    } finally { compiled.dispose(); texture.dispose(); device.dispose(); }
  });

  it("generates and links billboard clipping coordinates without changing the sprite's fog position", () => {
    const source = generateProgramImpl(normalizeProgramFeatures({
      lighting: "unlit", features: { "prd15.paritySprite": true, "a3d.clipping": true }
    }), { flags });
    expect(source.defines.A3D_PARITY_SPRITE).toBe(1);
    expect(source.defines.A3D_CLIPPING).toBe(true);
    expect(source.vertex).toContain("gl_Position = u_projection * a3dSpriteView;");
    expect(source.vertex).toContain("v_worldPosition = a3dSpriteCenterWorld;");
    expect(source.vertex).toContain("vec4 a3dSpriteClipWorld = u_a3dSpriteViewToWorld * a3dSpriteView;");
    expect(source.vertex).toContain("v_a3dClipWorld = a3dSpriteClipWorld.xyz / a3dSpriteClipWorld.w;");
    expect(source.vertex).toContain("u_a3dSpriteWorldToObject * vec4(v_a3dClipWorld, 1.0)");
    expect(source.vertex.indexOf("v_a3dClipWorld = a3dSpriteClipWorld.xyz"))
      .toBeGreaterThan(source.vertex.indexOf("a3dSpriteView.xy += a3dSpriteRotated"));
    expect(source.fragment).toContain("a3dClipRetains(v_a3dClipWorld, v_a3dClipLocal)");
    const unclipped = generateProgramImpl(normalizeProgramFeatures({ lighting: "unlit", features: { "prd15.paritySprite": true } }), { flags });
    expect(unclipped.defines.A3D_CLIPPING).toBeUndefined();
    expect(unclipped.vertex).toContain("gl_Position = u_projection * a3dSpriteView;\n  v_worldPosition = a3dSpriteCenterWorld;\n#ifdef A3D_CLIPPING");

    if (spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0) {
      const dir = mkdtempSync(join(tmpdir(), "aura3d-sprite-clip-"));
      try {
        const vertex = join(dir, "sprite.vert"), fragment = join(dir, "sprite.frag");
        writeFileSync(vertex, source.vertex);
        writeFileSync(fragment, source.fragment);
        const linked = execFileSync("glslangValidator", ["-l", "-q", vertex, fragment], { encoding: "utf8" });
        expect(linked).toContain("u_a3dClipPlanes");
        expect(linked).toContain("u_a3dClipGroups");
        expect(linked).toContain("u_a3dSpriteViewToWorld");
        expect(linked).toContain("u_a3dSpriteWorldToObject");
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  });

  it("distinguishes world and object-local planes on a rotated, anchored billboard", () => {
    // Scene view rotates world coordinates -90° about Z; model rotates +90°,
    // scales X/Y by 2/3, and translates to (4, 0, -5). With anchor (0, .5)
    // and sprite rotation +90°, the two opposite corners evaluate as below.
    // These hand-derived points test the plane semantics independently of a
    // GPU or source-text match.
    const node = sprites.sprite({ position: [4, 0, -5], rotation: [0, 0, Math.PI / 2],
      scale: [2, 3, 1], center: [0, 0.5], spriteRotation: Math.PI / 2 }).toJSON();
    const compiled = compile(node);
    try {
      const matrix = compiled.item.modelMatrix!;
      expect(matrix[0]).toBeCloseTo(0);
      expect(matrix[1]).toBeCloseTo(2);
      expect(matrix[4]).toBeCloseTo(-3);
      expect(matrix[5]).toBeCloseTo(0);
      expect([matrix[12], matrix[13], matrix[14]]).toEqual([4, 0, -5]);
      expect(compiled.item.material?.getParameter("u_spriteCenter")).toEqual([0, 0.5]);
      expect(compiled.item.material?.getParameter("u_spriteRotation")).toBe(Math.PI / 2);
      expect(compiled.item.geometry.vertexBuffer.getAttribute(0, "position")).toEqual([-0.5, -0.5, 0]);
      expect(compiled.item.geometry.vertexBuffer.getAttribute(2, "position")).toEqual([0.5, 0.5, 0]);

      const firstWorld = [4, 1.5, -5] as const, firstLocal = [0.75, 0, 0] as const;
      const oppositeWorld = [2, -1.5, -5] as const, oppositeLocal = [-0.75, 2 / 3, 0] as const;
      const world = createClippingBinding({ global: { planes: [[1, 0, 0, -3]] } });
      const local = createClippingBinding({ material: { planes: [[0, 1, 0, -0.5]], space: "local" } });
      expect(clippingRetainsPoint(world, firstWorld, firstLocal)).toBe(true);
      expect(clippingRetainsPoint(world, oppositeWorld, oppositeLocal)).toBe(false);
      expect(clippingRetainsPoint(local, firstWorld, firstLocal)).toBe(false);
      expect(clippingRetainsPoint(local, oppositeWorld, oppositeLocal)).toBe(true);
    } finally { compiled.dispose(); }
  });

  it("submits rotated sprite clipping on the generated forward path and re-expands it for depth", () => {
    const global = clipping.global({ planes: [[1, 0, 0, -3]] });
    const local = clipping.material({ planes: [[0, 1, 0, -0.5]], space: "local", clipShadows: true });
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 128]), colorSpace: "srgb" });
    const node = sprites.sprite({ position: [4, 0, -5], rotation: [0, 0, Math.PI / 2],
      scale: [2, 3, 1], center: [0, 0.5], spriteRotation: Math.PI / 2, sizeAttenuation: false,
      map: { kind: "aura-texture-ref", texture } as never, material: { color: "#ff0000", opacity: 0.5, clipping: local } }).toJSON();
    const compiled = compile(node);
    const device = new CaptureDevice();
    const view = [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const projection = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, -1, 0, 0, -0.2, 0];
    setRendererQrFlags(flags, device);
    try {
      device.beginFrame(800, 400);
      new ForwardPass({ items: [compiled.item], globalClipping: global,
        cameraViewMatrix: view, cameraViewProjectionMatrix: multiplyMatrices(projection, view),
        auraFrameCamera: { projectionMatrix: projection } }).execute({ device, width: 800, height: 400 });
      expect(device.drawCommands).toHaveLength(1);
      const draw = device.drawCommands[0]!;
      expect(draw.topology).toBe("triangles");
      expect(draw.uniforms!.get("u_spriteCenter")).toEqual([0, 0.5]);
      expect(draw.uniforms!.get("u_spriteRotation")).toBe(Math.PI / 2);
      expect(draw.uniforms!.get("u_spriteSizeAttenuation")).toBe(0);
      expect(draw.uniforms!.get("u_baseColor")).toEqual([1, 0, 0, 0.5]);
      expect(draw.uniforms!.get("u_baseColorMap")).toBeDefined();
      expect(draw.renderState?.blend).toBe(true);
      expect(draw.renderState?.depthWrite).toBe(false);
      expect(draw.uniforms!.get("u_a3dClipGroupCount")).toBe(2);
      expect(Array.from(draw.uniforms!.get("u_a3dClipGroups") as Float32Array)).toEqual([0, 1, 0, 0, 1, 1, 0, 1]);
      const viewToWorld = draw.uniforms!.get("u_a3dSpriteViewToWorld") as Float32Array;
      const worldToObject = draw.uniforms!.get("u_a3dSpriteWorldToObject") as Float32Array;
      const transform = (matrix: Float32Array, [x, y, z]: readonly [number, number, number]) => [
        matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
        matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
        matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!
      ] as const;
      const expected = [
        // sizeAttenuation=false multiplies these billboard offsets by the
        // positive view depth (5) under the supplied perspective projection.
        { view: [7.5, -4, -5] as const, world: [4, 7.5, -5], local: [3.75, 0, 0] },
        { view: [-7.5, 6, -5] as const, world: [-6, -7.5, -5], local: [-3.75, 10 / 3, 0] }
      ];
      for (const corner of expected) {
        const world = transform(viewToWorld, corner.view);
        const object = transform(worldToObject, world);
        world.forEach((value, i) => expect(value).toBeCloseTo(corner.world[i]!));
        object.forEach((value, i) => expect(value).toBeCloseTo(corner.local[i]!));
      }
      expect(device.sources[0]!.generatedProgram?.features.features["prd15.paritySprite"]).toBe(true);
      expect(device.sources[0]!.vertex).toContain("v_a3dClipWorld = a3dSpriteClipWorld.xyz / a3dSpriteClipWorld.w");
      const frameBytes = device.readBuffer(device.frameUniformBuffer!);
      const frame = new Float32Array(frameBytes.buffer, frameBytes.byteOffset, frameBytes.byteLength / 4);
      expect(Array.from(frame.slice(0, 16))).toEqual(view);
      expect(Array.from(frame.slice(16, 32))).toEqual(projection.map(Math.fround));

      for (const clippingPass of ["depth", "shadow"] as const) {
        // Depth must expand the billboard from the raster camera that drew it.
        expect(() => new DepthPass({ casters: [compiled.item], clippingPass }).execute({ device, width: 800, height: 400 }))
          .toThrowError(expect.objectContaining({ code: "DEPTH_CLIPPING_RASTER_CAMERA_REQUIRED" }));
      }
      expect(device.drawCommands).toHaveLength(1);
      const rasterCamera = { viewMatrix: view, projectionMatrix: projection };
      let corners: number[][] = [];
      const forwardDraw = device.draw.bind(device);
      device.draw = (command) => {
        const bytes = device.readBuffer(command.vertexBuffer);
        const floats = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
        corners = Array.from({ length: floats.length / 3 }, (_, i) => Array.from(floats.slice(i * 3, i * 3 + 3)));
        forwardDraw(command);
      };
      new DepthPass({ casters: [{ ...compiled.item, clippingRasterCamera: rasterCamera }], clippingPass: "depth", globalClipping: global,
        viewProjectionMatrix: multiplyMatrices(projection, view) }).execute({ device, width: 800, height: 400 });
      expect(device.drawCommands).toHaveLength(2);
      const depth = device.drawCommands[1]!;
      expect(depth.uniforms!.get("u_a3dClipGroupCount")).toBe(2);
      expect(Array.from(depth.uniforms!.get("u_a3dClipGroups") as Float32Array)).toEqual([0, 1, 0, 0, 1, 1, 0, 1]);
      // The depth corners are the forward billboard's object-space corners.
      const model = depth.uniforms!.get("u_a3dClipModel") as ArrayLike<number>;
      for (const expectedCorner of expected) {
        const match = corners.find((corner) => corner.every((value, i) => Math.abs(value - expectedCorner.local[i]!) < 1e-4));
        expect(match).toBeDefined();
        transform(new Float32Array(model), match as unknown as [number, number, number]).forEach((value, i) => expect(value).toBeCloseTo(expectedCorner.world[i]!, 4));
      }
    } finally { compiled.dispose(); texture.dispose(); device.dispose(); }
  });

  it("fails before drawing when the clipped sprite's coordinate transforms or shader route are unsupported", () => {
    const local = clipping.material({ planes: [[1, 0, 0, 0]], space: "local" });
    const compiled = compile(sprites.sprite({ scale: [2, 3, 1], material: { clipping: local } }).toJSON());
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const singular = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
    const nearSingular = [1e-7, 0, 0, 0, 0, 1e-7, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const nonAffine = [1, 0, 0, 0.1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const cases = [
      { item: { ...compiled.item, modelMatrix: singular }, view: identity, flags, code: "FORWARD_CLIPPING_SPRITE_TRANSFORM" },
      { item: { ...compiled.item, modelMatrix: nearSingular }, view: identity, flags, code: "FORWARD_CLIPPING_SPRITE_TRANSFORM" },
      { item: compiled.item, view: singular, flags, code: "FORWARD_CLIPPING_SPRITE_TRANSFORM" },
      { item: { ...compiled.item, modelMatrix: nonAffine }, view: identity, flags, code: "FORWARD_CLIPPING_SPRITE_TRANSFORM" },
      { item: compiled.item, view: nonAffine, flags, code: "FORWARD_CLIPPING_SPRITE_TRANSFORM" },
      { item: { ...compiled.item, instanceTransforms: new Float32Array(identity) }, view: identity, flags, code: "FORWARD_CLIPPING_SPRITE_UNSUPPORTED" },
      { item: compiled.item, view: identity, flags: createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), code: "FORWARD_CLIPPING_SPRITE_UNSUPPORTED" }
    ];
    try {
      for (const test of cases) {
        const device = new MockRenderDevice();
        setRendererQrFlags(test.flags, device);
        try {
          device.beginFrame(8, 8);
          expect(() => new ForwardPass({ items: [test.item], cameraViewMatrix: test.view }).execute({ device, width: 8, height: 8 }))
            .toThrowError(expect.objectContaining({ code: test.code }));
          expect(device.drawCommands).toHaveLength(0);
        } finally { device.dispose(); }
      }
    } finally { compiled.dispose(); }
  });

  it("supports a singular sprite model for world-only clipping", () => {
    const global = clipping.global({ planes: [[1, 0, 0, -1]] });
    const compiled = compile(sprites.sprite({ scale: [2, 3, 0] }).toJSON());
    const device = new MockRenderDevice();
    setRendererQrFlags(flags, device);
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [compiled.item], globalClipping: global }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(1);
      expect(device.drawCommands[0]!.uniforms!.get("u_a3dClipGroupCount")).toBe(1);
    } finally { compiled.dispose(); device.dispose(); }
  });

  it("rejects a standalone sprite whose view-projection does not match its view and projection", () => {
    const local = clipping.material({ planes: [[1, 0, 0, 0]], space: "local" });
    const compiled = compile(sprites.sprite({ material: { clipping: local } }).toJSON());
    const device = new MockRenderDevice();
    const mismatch = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1];
    setRendererQrFlags(flags, device);
    try {
      device.beginFrame(8, 8);
      expect(() => new ForwardPass({ items: [compiled.item], cameraViewProjectionMatrix: mismatch }).execute({ device, width: 8, height: 8 }))
        .toThrowError(expect.objectContaining({ code: "SPRITE_CAMERA_MATRIX_UNSUPPORTED" }));
      expect(device.drawCommands).toHaveLength(0);
    } finally { compiled.dispose(); device.dispose(); }
  });

  it("maps world positions into a reflected sprite's local clipping space", () => {
    const local = clipping.material({ planes: [[1, 0, 0, 0]], space: "local" });
    const compiled = compile(sprites.sprite({ position: [4, 0, 0], scale: [-2, 3, 1], material: { clipping: local } }).toJSON());
    const device = new MockRenderDevice();
    setRendererQrFlags(flags, device);
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [compiled.item] }).execute({ device, width: 8, height: 8 });
      const inverse = device.drawCommands[0]!.uniforms!.get("u_a3dSpriteWorldToObject") as Float32Array;
      expect(inverse[0]).toBeCloseTo(-0.5);
      expect(inverse[5]).toBeCloseTo(1 / 3);
      expect(inverse[12]).toBeCloseTo(2);
      const binding = createClippingBinding({ material: local });
      // The reflected model reverses the local X half-space in world space.
      expect(clippingRetainsPoint(binding, [3, 0, 0], [inverse[0]! * 3 + inverse[12]!, 0, 0])).toBe(true);
      expect(clippingRetainsPoint(binding, [5, 0, 0], [inverse[0]! * 5 + inverse[12]!, 0, 0])).toBe(false);
    } finally { compiled.dispose(); device.dispose(); }
  });

  it("recomputes sprite inverses after draw hooks and rejects a singular replacement", () => {
    const local = clipping.material({ planes: [[1, 0, 0, -1]], space: "local" });
    const compiled = compile(sprites.sprite({ material: { clipping: local } }).toJSON());
    const device = new MockRenderDevice();
    setRendererQrFlags(flags, device);
    let model = new Float32Array([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 4, -2, -5, 1]);
    const removeHook = registerForwardDrawHook({ id: "native-line-sprite-clipping-hook", bind: (_item, _shader, set) => {
      set("u_modelMatrix", model);
      set("u_a3dSpriteViewToWorld", new Float32Array(16).fill(99));
      set("u_a3dSpriteWorldToObject", new Float32Array(16).fill(99));
      set("u_a3dClipGroupCount", 0);
    } });
    try {
      device.beginFrame(8, 8);
      const pass = new ForwardPass({ items: [compiled.item] });
      pass.execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(1);
      const uniforms = device.drawCommands[0]!.uniforms!;
      expect(uniforms.get("u_a3dClipGroupCount")).toBe(1);
      const inverse = uniforms.get("u_a3dSpriteWorldToObject") as Float32Array;
      expect(inverse[0]).toBeCloseTo(0.5);
      expect(inverse[5]).toBeCloseTo(1 / 3);
      expect(inverse[12]).toBeCloseTo(-2);
      expect(inverse[13]).toBeCloseTo(2 / 3);
      expect(inverse[14]).toBeCloseTo(5);
      expect(Array.from(uniforms.get("u_a3dSpriteViewToWorld") as Float32Array))
        .toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

      model = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
      expect(() => pass.execute({ device, width: 8, height: 8 }))
        .toThrowError(expect.objectContaining({ code: "FORWARD_CLIPPING_SPRITE_TRANSFORM" }));
      expect(device.drawCommands).toHaveLength(1);
    } finally { removeHook(); compiled.dispose(); device.dispose(); }
  });

  it.each([false, true])("renders clipped sprites through the renderer and their clipped shadow depth (async=%s)", async asynchronous => {
    const local = clipping.material({ planes: [[1, 0, 0, 0]], space: "local" });
    const global = clipping.global({ planes: [[0, 1, 0, -0.2]] });
    const compiled = compile(sprites.sprite({ center: [0.1, 0.8], spriteRotation: 0.4, material: { clipping: local } }).toJSON());
    const rendererFlags = createTrustedQrFlags({ ...flags.values, A3D_QR_CORE_OUTPUT: false, A3D_QR_LIGHTING: false });
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, qrFlags: rendererFlags });
    const device = renderer.device as MockRenderDevice;
    const source = { cameraPolicy: "identity" as const, renderItems: [compiled.item], globalClipping: global };
    try {
      if (asynchronous) await renderer.renderAsync({ source });
      else renderer.render({ source });
      expect(device.drawCommands).toHaveLength(1);
      expect(device.drawCommands[0]!.uniforms!.get("u_a3dClipGroupCount")).toBe(2);

      // Shadow clipping re-expands the same camera-facing billboard from the
      // frame's raster camera and clips it in the light's depth pass.
      local.update({ clipShadows: true });
      const sun = new DirectionalLight("sprite-shadow");
      sun.castsShadow = true;
      const shadowSource = { ...source, shadow: { light: sun, size: 8, lightMatrix: identityMat4() } };
      if (asynchronous) await renderer.renderAsync({ source: shadowSource });
      else renderer.render({ source: shadowSource });
      const isDepth = (command: (typeof device.drawCommands)[number]) => /depth/.test(command.shader?.label ?? "");
      const forward = device.drawCommands.filter((command) => !isDepth(command));
      const shadow = device.drawCommands.filter(isDepth);
      expect(forward).toHaveLength(1);
      expect(shadow).toHaveLength(1);
      // Only the shadow-opted local group applies to the light pass.
      expect(shadow[0]!.uniforms!.get("u_a3dClipGroupCount")).toBe(1);
      expect(shadow[0]!.renderState?.depthWrite).toBe(true);
    } finally { renderer.dispose(); compiled.dispose(); }
  });

  it.each([false, true])("uses the public-root camera for clipped sprite geometry (async=%s)", async asynchronous => {
    const local = clipping.material({ planes: [[1, 0, 0, 0]], space: "local" });
    const snapshot = scene({
      camera: camera.perspective({ position: [4, 3, 8], target: [0, 1, 0], fov: 47, near: 0.2, far: 120 }),
      children: [sprites.sprite({ center: [0.2, 0.8], spriteRotation: 0.4, material: { clipping: local } })]
    }).toJSON();
    const compiled = compile(snapshot.nodes[0]!);
    const canvas = htmlCanvas(800, 400);
    const detach = attachRootRenderSource(canvas, { source: { collectRenderItems: () => [compiled.item] } });
    const input = createProductionRuntimeRendererInput(snapshot, canvas, [], [], 0, undefined, new Set(), { color: [0, 0, 0], intensity: 0 }, []);
    const device = new CaptureDevice();
    const rendererFlags = createTrustedQrFlags({ ...flags.values, A3D_QR_CORE_OUTPUT: false, A3D_QR_LIGHTING: false });
    const renderer = new Renderer(device, { backend: "mock", width: 800, height: 400, qrFlags: rendererFlags,
      shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    const source = { ...input.source, postprocess: false, shadow: false, frustumCulling: false };
    try {
      const rootCamera = input.camera!;
      expect(rootCamera.shaderViewMatrix).toBeDefined();
      expect(rootCamera.shaderProjectionMatrix).toBeDefined();
      if (asynchronous) await renderer.renderAsync({ source, camera: rootCamera });
      else renderer.render({ source, camera: rootCamera });
      const draw = device.drawCommands.find(command => command.label?.startsWith("l6.sprite."));
      expect(draw).toBeDefined();
      const frameBytes = device.readBuffer(device.frameUniformBuffer!);
      const frame = new Float32Array(frameBytes.buffer, frameBytes.byteOffset, frameBytes.byteLength / 4);
      expect(Array.from(frame.slice(0, 16))).toEqual(Array.from(rootCamera.shaderViewMatrix!, Math.fround));
      expect(Array.from(frame.slice(16, 32))).toEqual(Array.from(rootCamera.shaderProjectionMatrix!, Math.fround));
      const inverseView = draw!.uniforms!.get("u_a3dSpriteViewToWorld") as Float32Array;
      const view = rootCamera.shaderViewMatrix!;
      for (let row = 0; row < 4; row += 1) for (let column = 0; column < 4; column += 1) {
        const product = Array.from({ length: 4 }, (_, k) => inverseView[k * 4 + row]! * view[column * 4 + k]!)
          .reduce((sum, value) => sum + value, 0);
        expect(product).toBeCloseTo(row === column ? 1 : 0, 5);
      }
      const mismatchedVp = Float32Array.from(rootCamera.viewProjectionMatrix!);
      mismatchedVp[12] = mismatchedVp[12]! + 1;
      const mismatchedCamera = { ...rootCamera, viewProjectionMatrix: mismatchedVp };
      if (asynchronous) {
        await expect(renderer.renderAsync({ source, camera: mismatchedCamera })).rejects.toThrowError(
          expect.objectContaining({ code: "SPRITE_CAMERA_MATRIX_UNSUPPORTED" })
        );
      } else {
        expect(() => renderer.render({ source, camera: mismatchedCamera })).toThrowError(
          expect.objectContaining({ code: "SPRITE_CAMERA_MATRIX_UNSUPPORTED" })
        );
      }
      expect(device.drawCommands).toHaveLength(0);
    } finally { detach(); renderer.dispose(); compiled.dispose(); }
  });

  it.each([false, true])("keeps clipped sprites on the jittered raster projection (async=%s)", async asynchronous => {
    const local = clipping.material({ planes: [[1, 0, 0, 0]], space: "local" });
    const snapshot = scene({
      camera: camera.perspective({ position: [4, 3, 8], target: [0, 1, 0], fov: 47, near: 0.2, far: 120 }),
      children: [sprites.sprite({ center: [0.2, 0.8], spriteRotation: 0.4, material: { clipping: local } })]
    }).toJSON();
    const compiled = compile(snapshot.nodes[0]!);
    const canvas = htmlCanvas(800, 400);
    const detach = attachRootRenderSource(canvas, { source: { collectRenderItems: () => [compiled.item] } });
    const input = createProductionRuntimeRendererInput(snapshot, canvas, [], [], 0, undefined, new Set(), { color: [0, 0, 0], intensity: 0 }, []);
    const device = new CaptureDevice();
    Object.defineProperty(device, "presentLdrPostprocess", { value: () => undefined });
    const history = new TemporalHistory();
    const jitter = [0.025, -0.0125] as const;
    let jitteredVp: Float32Array | undefined;
    vi.spyOn(history, "prepare").mockImplementation((_device, _width, _height, items, viewProjection) => {
      jitteredVp = Float32Array.from(viewProjection!);
      for (let column = 0; column < 4; column += 1) {
        jitteredVp[column * 4] = jitteredVp[column * 4]! + jitter[0] * jitteredVp[column * 4 + 3]!;
        jitteredVp[column * 4 + 1] = jitteredVp[column * 4 + 1]! + jitter[1] * jitteredVp[column * 4 + 3]!;
      }
      return { renderItems: items, historyValid: false,
        velocity: { disposed: false, width: 800, height: 400 },
        history: { disposed: false, width: 800, height: 400 },
        historyOutput: { disposed: false, width: 800, height: 400 },
        v2: { jittered: jitteredVp, previous: null, jitterClip: jitter, motionSource: "test", unsupportedMotion: [], coverage: {} } } as never;
    });
    const rendererFlags = createTrustedQrFlags({ ...flags.values, A3D_QR_POST: true, A3D_QR_CORE_OUTPUT: false, A3D_QR_LIGHTING: false });
    const renderer = new Renderer(device, { backend: "mock", width: 800, height: 400, qrFlags: rendererFlags,
      shaderLibrary: createDefaultShaderLibrary() }, history);
    const post = renderer as unknown as { executePostprocess(...args: unknown[]): void; executePostprocessAsync(...args: unknown[]): Promise<void> };
    vi.spyOn(post, "executePostprocess").mockImplementation(() => undefined);
    vi.spyOn(post, "executePostprocessAsync").mockImplementation(async () => undefined);
    const source = { ...input.source, shadow: false, frustumCulling: false,
      postprocess: { execution: "auto" as const, sampleCount: 1, temporal: { sceneKey: "sprite-jitter" }, taa: { blend: 0.9 } } };
    try {
      const rootCamera = input.camera!;
      if (asynchronous) await renderer.renderAsync({ source, camera: rootCamera });
      else renderer.render({ source, camera: rootCamera });
      const draw = device.drawCommands.find(command => command.label?.startsWith("l6.sprite."));
      expect(draw).toBeDefined();
      expect(jitteredVp).toBeDefined();
      const frameBytes = device.readBuffer(device.frameUniformBuffer!);
      const frame = new Float32Array(frameBytes.buffer, frameBytes.byteOffset, frameBytes.byteLength / 4);
      const view = frame.slice(0, 16), projection = frame.slice(16, 32), submittedVp = frame.slice(32, 48);
      expect(Array.from(view)).toEqual(Array.from(rootCamera.shaderViewMatrix!, Math.fround));
      expect(Array.from(submittedVp)).toEqual(Array.from(jitteredVp!));
      for (let row = 0; row < 4; row += 1) for (let column = 0; column < 4; column += 1) {
        const product = Array.from({ length: 4 }, (_, k) => projection[k * 4 + row]! * view[column * 4 + k]!)
          .reduce((sum, value) => sum + value, 0);
        expect(product).toBeCloseTo(submittedVp[column * 4 + row]!, 5);
      }
      expect(draw!.uniforms!.get("u_a3dClipGroupCount")).toBe(1);
    } finally { detach(); renderer.dispose(); compiled.dispose(); }
  });

  it.each([false, true])("uses the jittered renderer camera for clipped world-width lines (async=%s)", async asynchronous => {
    const local = clipping.material({ planes: [[1, 0, 0, -0.5]], space: "local" });
    const snapshot = scene({
      camera: camera.perspective({ position: [4, 3, 8], target: [0, 1, 0], fov: 47, near: 0.2, far: 120 }),
      children: [lines.fat({ points: [[-1, 0, 0], [1, 1, -1]], width: 0.4, worldUnits: true,
        dashed: true, dashSize: 2, gapSize: 1, dashOffset: 0.3,
        position: [2, -1, -3], rotation: [0.1, 0.2, 0.3], scale: [2, 3, 1], material: { clipping: local } })]
    }).toJSON();
    const compiled = compile(snapshot.nodes[0]!);
    const canvas = htmlCanvas(800, 400);
    const detach = attachRootRenderSource(canvas, { source: { collectRenderItems: () => [compiled.item] } });
    const input = createProductionRuntimeRendererInput(snapshot, canvas, [], [], 0, undefined, new Set(), { color: [0, 0, 0], intensity: 0 }, []);
    const device = new CaptureDevice();
    Object.defineProperty(device, "presentLdrPostprocess", { value: () => undefined });
    const history = new TemporalHistory();
    // Exercise real temporal item preparation with a deterministic nonzero sample.
    vi.spyOn(history, "jitter").mockReturnValue([0.025, -0.0125]);
    const prepare = vi.spyOn(history, "prepare");
    const rendererFlags = createTrustedQrFlags({ ...flags.values, A3D_QR_POST: true, A3D_QR_CORE_OUTPUT: false, A3D_QR_LIGHTING: false });
    const renderer = new Renderer(device, { backend: "mock", width: 800, height: 400, qrFlags: rendererFlags,
      shaderLibrary: createDefaultShaderLibrary() }, history);
    const post = renderer as unknown as { executePostprocess(...args: unknown[]): void; executePostprocessAsync(...args: unknown[]): Promise<void> };
    vi.spyOn(post, "executePostprocess").mockImplementation(() => undefined);
    vi.spyOn(post, "executePostprocessAsync").mockImplementation(async () => undefined);
    const source = { ...input.source, shadow: false, frustumCulling: false,
      postprocess: { execution: "auto" as const, sampleCount: 1, temporal: { sceneKey: "world-line-jitter" }, taa: { blend: 0.9 } } };
    try {
      const rootCamera = input.camera!;
      expect(rootCamera.shaderViewMatrix).toBeDefined();
      expect(rootCamera.shaderProjectionMatrix).toBeDefined();
      if (asynchronous) await renderer.renderAsync({ source, camera: rootCamera });
      else renderer.render({ source, camera: rootCamera });

      const temporal = prepare.mock.results[0]!.value!;
      expect(temporal.v2?.jitterClip).toEqual([0.025, -0.0125]);
      const draw = device.drawCommands.find(command => command.label?.startsWith("l6.line."));
      expect(draw?.shader?.label).toContain(":clipped");
      const uniforms = draw!.uniforms!;
      const model = uniforms.get("u_modelMatrix") as Float32Array;
      const view = uniforms.get("u_viewMatrix") as Float32Array;
      const projection = uniforms.get("u_projectionMatrix") as Float32Array;
      const mvp = uniforms.get("u_modelViewProjection") as Float32Array;
      const inverse = uniforms.get("u_a3dClipInverseLineTransform") as Float32Array;
      expect(Array.from(view)).toEqual(Array.from(rootCamera.shaderViewMatrix!, Math.fround));
      expect(Array.from(projection)).not.toEqual(Array.from(rootCamera.shaderProjectionMatrix!, Math.fround));
      expect(Array.from(mvp)).toEqual(Array.from(temporal.renderItems[0]!.modelViewProjectionMatrix!));
      const separateProduct = multiplyMatrices(projection, multiplyMatrices(view, model));
      const expectedMvp = multiplyMatrices(temporal.v2!.jittered, model);
      const identity = multiplyMatrices(inverse, mvp);
      for (let index = 0; index < 16; index += 1) {
        expect(separateProduct[index]).toBeCloseTo(mvp[index]!, 5);
        expect(expectedMvp[index]).toBeCloseTo(mvp[index]!, 5);
        expect(identity[index]).toBeCloseTo(index % 5 === 0 ? 1 : 0, 4);
      }
      expect(uniforms.get("u_a3dClipGroupCount")).toBe(1);
      expect(uniforms.get("u_lineWorldUnits")).toBe(1);
      expect(uniforms.get("u_lineWidth")).toBe(0.4);
      expect(uniforms.get("u_lineDashSize")).toBe(2);
      expect(uniforms.get("u_lineGapSize")).toBe(1);
      expect(uniforms.get("u_lineDashOffset")).toBe(0.3);

      // A late draw hook can replace the previously validated camera packet.
      // Replacing its jittered projection with the old custom camera must fail.
      const removeHook = registerForwardDrawHook({ id: `world-line-jitter-override-${asynchronous}`,
        bind: (_item, _shader, set) => set("u_projectionMatrix", rootCamera.shaderProjectionMatrix!) });
      try {
        if (asynchronous) {
          await expect(renderer.renderAsync({ source, camera: rootCamera })).rejects.toThrowError(
            expect.objectContaining({ code: "FORWARD_CLIPPING_LINE_CAMERA_MISMATCH" })
          );
        } else {
          expect(() => renderer.render({ source, camera: rootCamera })).toThrowError(
            expect.objectContaining({ code: "FORWARD_CLIPPING_LINE_CAMERA_MISMATCH" })
          );
        }
        expect(device.drawCommands).toHaveLength(0);
      } finally { removeHook(); }
    } finally { detach(); renderer.dispose(); compiled.dispose(); local.dispose(); }
  });

  it("draws clipped wide and dashed lines with their registered shader while rejecting an unverified library", () => {
    const variants = [
      () => lines.fat({ points: [[0, 0, 0], [1, 0, 0]], width: 3, worldUnits: true }),
      () => lines.line({ points: [[0, 0, 0], [1, 0, 0]], dashed: true, gapSize: 1 })
    ];
    for (const makeNode of variants) {
      for (const scope of ["global", "material"] as const) {
        const global = clipping.global({ planes: [[1, 0, 0, -1]], enabled: scope === "global" });
        const local = clipping.material({ planes: [[0, 1, 0, -1]], space: "local", enabled: scope === "material" });
        const snapshot = scene({ clipping: global }).add(makeNode().material({ clipping: local })).toJSON();
        const compiled = compile(snapshot.nodes[0]!);
        const device = new MockRenderDevice();
        setRendererQrFlags(flags, device);
        try {
          device.beginFrame(8, 8);
          expect(() => new ForwardPass({ items: [compiled.item], globalClipping: global }).execute({ device, width: 8, height: 8 }))
            .toThrowError(expect.objectContaining({ code: "FORWARD_CLIPPING_SPECIALIZED_GEOMETRY_UNSUPPORTED" }));
          expect(device.drawCommands).toHaveLength(0);
          new ForwardPass({ items: [compiled.item], globalClipping: global, shaderLibrary: createDefaultShaderLibrary() }).execute({ device, width: 8, height: 8 });
          expect(device.drawCommands).toHaveLength(1);
          expect(device.drawCommands[0]!.uniforms!.get("u_a3dClipGroupCount")).toBe(1);
          expect(device.drawCommands[0]!.uniforms!.get("u_lineWidth")).toBe(compiled.item.material!.getParameter("u_lineWidth"));
          expect(device.drawCommands[0]!.uniforms!.get("u_lineDashSize")).toBe(compiled.item.material!.getParameter("u_lineDashSize"));
          global.setEnabled(false);
          local.setEnabled(false);
          new ForwardPass({ items: [compiled.item], globalClipping: global, shaderLibrary: createDefaultShaderLibrary() }).execute({ device, width: 8, height: 8 });
          expect(device.drawCommands).toHaveLength(2);
        } finally { compiled.dispose(); device.dispose(); }
      }
    }
  });

  it("rejects active clipping when the generated unlit program is disabled", () => {
    const node = lines.line({ points: [[0, 0, 0], [1, 0, 0]], material: { clipping: clipping.material({ planes: [[1, 0, 0, 0]] }) } }).toJSON();
    const compiled = compile(node);
    const device = new MockRenderDevice();
    setRendererQrFlags(createTrustedQrFlags({}), device);
    try {
      device.beginFrame(8, 8);
      expect(() => new ForwardPass({ items: [compiled.item] }).execute({ device, width: 8, height: 8 }))
        .toThrow(/Clipping requires a generated forward shader/);
      expect(device.drawCommands).toHaveLength(0);
    } finally { compiled.dispose(); device.dispose(); }
  });

  it("selects native clipped thin lines while explicitly rejecting unsupported WebGPU point lists", () => {
    const local = clipping.material({ planes: [[1, 0, 0, 0]] });
    const line = compile(lines.line({ points: [[0, 0, 0], [1, 0, 0]], material: { clipping: local } }).toJSON());
    const point = compile(points({ positions: [[0, 0, 0]], size: 3, material: { clipping: local } }).toJSON());
    const device = new CaptureDevice();
    Object.defineProperty(device, "kind", { value: "webgpu" });
    setRendererQrFlags(flags, device);
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [line.item] }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(1);
      expect(device.drawCommands[0]!.topology).toBe("lines");
      expect(device.drawCommands[0]!.uniforms!.get("u_a3dClipGroupCount")).toBe(1);
      expect(device.sources[0]!.generatedProgram?.features.features["a3d.nativePrimitive"]).toBe("lines");
      expect(() => new ForwardPass({ items: [point.item] }).execute({ device, width: 8, height: 8 }))
        .toThrowError(expect.objectContaining({ code: "NATIVE_UNLIT_POINTS_UNSUPPORTED" }));
      expect(device.drawCommands).toHaveLength(1);
    } finally { line.dispose(); point.dispose(); device.dispose(); }
  });
});
