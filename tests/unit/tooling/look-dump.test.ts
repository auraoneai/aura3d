import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { HOOK_SOURCE } from "../../../tools/crayon-probe/inpage";
import {
  LOOK_DUMP_SOURCE,
  LOOK_EFFECT_SOURCE,
  LOOK_HOOK_SOURCE,
  LOOK_SCHEMA,
  classifyAsset,
  dedupeMaterials,
  effectScore,
  hashString,
  mergeInventory,
  normalizeUrl,
  roundDeep,
  samplePath,
  splitMarkerBlocks,
  stableStringify,
  unionMaterialRows,
  validateLookSpec
} from "../../../tools/crayon-capture/look-dump-lib";

describe("hashString / stable JSON", () => {
  it("is deterministic, 16 hex chars, and input sensitive", () => {
    expect(hashString("")).toBe("811c9dc59e3779b9");
    expect(hashString("abc")).toMatch(/^[0-9a-f]{16}$/);
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
    expect(hashString("ab")).not.toBe(hashString("ba"));
  });

  it("rounds floats and sorts keys so equal specs are byte-equal", () => {
    expect(roundDeep({ b: 1.123456789, a: [0.00004, Infinity, NaN] }, 4)).toEqual({ a: [0, null, null], b: 1.1235 });
    const a = stableStringify({ z: 1, a: { y: 0.1 + 0.2, x: 1 } });
    const b = stableStringify({ a: { x: 1, y: 0.3 }, z: 1 });
    expect(a).toBe(b);
    expect(a.indexOf('"a"')).toBeLessThan(a.indexOf('"z"'));
  });
});

describe("dedupeMaterials / unionMaterialRows", () => {
  const std = (name: string, users: number, color = "#ff0000") => ({ ctor: "MeshStandardMaterial", color, roughness: 0.5, metalness: 0, name, users });
  it("collapses clones that differ only by name/users, most used first", () => {
    const { rows, omitted } = dedupeMaterials([std("a", 3), std("b", 4), std("c", 1, "#00ff00"), std("d", 2)]);
    expect(omitted).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "m0", instances: 3, users: 9 });
    expect(rows[0]?.names).toEqual(["a", "b", "d"]);
    expect(rows[1]).toMatchObject({ id: "m1", instances: 1, users: 1 });
    expect(rows[0]?.signature).toMatch(/^[0-9a-f]{16}$/);
  });
  it("caps rows and reports the overflow", () => {
    const raw = Array.from({ length: 10 }, (_, i) => ({ ctor: "M", roughness: i / 10, users: 1 }));
    const { rows, omitted } = dedupeMaterials(raw, 4);
    expect(rows).toHaveLength(4);
    expect(omitted).toBe(6);
  });
  it("unions phase row sets by signature with max users", () => {
    const a = dedupeMaterials([std("a", 2)]).rows;
    const b = dedupeMaterials([std("a", 5), std("z", 1, "#0000ff")]).rows;
    const u = unionMaterialRows([a, b]);
    expect(u).toHaveLength(2);
    expect(u[0]?.users).toBe(5);
    expect(u.map((r) => r.id)).toEqual(["m0", "m1"]);
  });
});

describe("samplePath / effectScore", () => {
  const pts = Array.from({ length: 11 }, (_, i) => ({ t: i * 1000, pos: [i * 2, 0, 0], fwd: [0, 0, -1], fov: 60 }));
  it("measures length and speed and picks evenly spaced samples", () => {
    const s = samplePath(pts, 5);
    expect(s.count).toBe(11);
    expect(s.length).toBeCloseTo(20, 6);
    expect(s.durationMs).toBe(10000);
    expect(s.meanSpeed).toBeCloseTo(2, 6);
    expect(s.maxSpeed).toBeCloseTo(2, 6);
    expect(s.samples.map((p) => p.t)).toEqual([0, 3000, 5000, 8000, 10000]);
  });
  it("handles empty and single-point paths", () => {
    expect(samplePath([]).count).toBe(0);
    expect(samplePath([pts[0]!]).samples).toHaveLength(1);
  });
  it("scores effect-heavy scenes higher", () => {
    const calm = effectScore({ points: 0, sprites: 0, transparent: 2, instanced: 10, visible: 500 });
    const busy = effectScore({ points: 2000, sprites: 30, transparent: 40, instanced: 300, visible: 600 });
    expect(busy).toBeGreaterThan(calm);
    expect(effectScore({ points: 1, sprites: 1, transparent: 1, instanced: 2, visible: 100 })).toBeCloseTo(1 + 4 + 2 + 1 + 1, 6);
  });
});

describe("asset inventory", () => {
  it("normalises URLs: drops query values and keeps key names", () => {
    expect(normalizeUrl("https://cdn.example.com/models/car.glb?token=SECRET&v=2#x")).toEqual({
      url: "https://cdn.example.com/models/car.glb", host: "cdn.example.com", path: "/models/car.glb", ext: "glb", queryKeys: ["token", "v"]
    });
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl("data:image/png;base64,AAAA")?.host).toBe("data:");
  });
  it("classifies by extension then content type", () => {
    expect(classifyAsset("glb", null)).toBe("model");
    expect(classifyAsset("", "image/webp")).toBe("image");
    expect(classifyAsset("", "application/javascript; charset=utf-8")).toBe("script");
    expect(classifyAsset("xyz", null)).toBe("other");
  });
  it("merges resource timing with responses, never carries query values", () => {
    const { entries, totals } = mergeInventory(
      [
        { name: "https://cdn.example.com/a.glb?sig=abc", initiatorType: "fetch", transferSize: 900, decodedBodySize: 1200 },
        { name: "https://cdn.example.com/b.png", initiatorType: "img", transferSize: 50 }
      ],
      [{ url: "https://cdn.example.com/a.glb?sig=abc", status: 200, contentType: "model/gltf-binary", bytes: 1234, sha256: "ff", resourceType: "fetch" }]
    );
    expect(entries.map((e) => e.url)).toEqual(["https://cdn.example.com/a.glb", "https://cdn.example.com/b.png"]);
    const a = entries[0]!;
    expect(a).toMatchObject({ kind: "model", status: 200, bytes: 1234, transferSize: 900, sha256: "ff", contentType: "model/gltf-binary", queryKeys: ["sig"] });
    expect(a.initiators).toEqual(["fetch", "pw:fetch"]);
    expect(JSON.stringify(entries)).not.toContain("abc");
    expect(totals.model).toEqual({ count: 1, bytes: 1234 });
    expect(totals.image?.count).toBe(1);
  });
});

describe("splitMarkerBlocks", () => {
  it("extracts every marked block, parses JSON, and reports a broken one", () => {
    const log = [
      "2026-10-23 step output",
      "@@A3D_LOOK_BEGIN:splat-rush",
      '{ "game": "splat-rush", "n": 1 }',
      "@@A3D_LOOK_END:splat-rush",
      "[look-dump] progress line",
      "@@A3D_LOOK_BEGIN:bad",
      "{ not json",
      "@@A3D_LOOK_END:bad"
    ].join("\n");
    const blocks = splitMarkerBlocks(log);
    expect(blocks.map((b) => b.id)).toEqual(["splat-rush", "bad"]);
    expect(blocks[0]?.json).toEqual({ game: "splat-rush", n: 1 });
    expect(blocks[1]?.json).toBeNull();
    expect(blocks[1]?.error).toBeTruthy();
  });
});

describe("validateLookSpec", () => {
  const phase = { renderers: [], lights: [], counts: { objects: 1 } };
  const ok = { schema: LOOK_SCHEMA, game: "g", url: "u", phases: { title: phase, mid: phase }, materials: { rows: [] }, inventory: { entries: [] }, errors: [] };
  it("accepts a well-formed spec", () => expect(validateLookSpec(ok)).toEqual([]));
  it("reports each structural problem", () => {
    const errs = validateLookSpec({ schema: "x", phases: { bogus: { renderers: 1 } }, errors: "no" });
    expect(errs).toEqual(expect.arrayContaining(["schema must be a3d-look-spec/1", "game missing", "phase mid missing", "unknown phase bogus", "phase bogus: renderers must be an array", "materials.rows missing", "inventory.entries missing", "errors must be an array"]));
    expect(validateLookSpec(null)).toEqual(["spec is not an object"]);
  });
});

// ---- the in-page sources, run against a fake three-like scene graph in a vm context ----------------

const colorOf = (hex: string) => ({ isColor: true, getHexString: () => hex });
const mat4 = (tx: number, ty: number, tz: number, s = 1) => ({ elements: [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, tx, ty, tz, 1] });

function makeWorld() {
  const sandbox: Record<string, unknown> = {
    EventTarget, CustomEvent, KeyboardEvent: class { type: string; constructor(type: string) { this.type = type; } }, URL, setTimeout, console,
    PerformanceObserver: class { observe() { /* no-op */ } },
    location: { href: "https://game.example.com/play" },
    document: { getElementsByTagName: () => [], createElement: () => ({ getContext: () => null }), body: { dispatchEvent: () => true } }
  };
  let nowMs = 1000;
  sandbox.performance = { now: () => nowMs };
  const raf: ((ts: number) => void)[] = [];
  const win: Record<string, unknown> = { requestAnimationFrame: (cb: (ts: number) => void) => (raf.push(cb), raf.length), cancelAnimationFrame: () => undefined };
  sandbox.window = win;
  vm.createContext(sandbox);
  win.performance = sandbox.performance;
  vm.runInContext(HOOK_SOURCE, sandbox);
  vm.runInContext(LOOK_HOOK_SOURCE, sandbox);
  return { sandbox, win, raf, setNow: (n: number) => { nowMs = n; } };
}

function fakeScene() {
  const box = { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } };
  const geo = (type: string, verts: number) => ({ type, boundingBox: box, computeBoundingBox: () => undefined, attributes: { position: { count: verts } }, index: { count: verts * 3 } });
  const standard = (hex: string, extra: Record<string, unknown> = {}) => ({ type: "MeshStandardMaterial", constructor: { name: "MeshStandardMaterial" }, color: colorOf(hex), roughness: 0.4, metalness: 0.1, opacity: 1, transparent: false, side: 0, ...extra });
  const mk = (name: string, material: unknown, geometry: unknown, extra: Record<string, unknown> = {}) => ({ name, isMesh: true, visible: true, children: [], matrixWorld: mat4(0, 0, 0), constructor: { name: "Mesh" }, geometry, material, ...extra });
  const shader = { isShaderMaterial: true, type: "ShaderMaterial", constructor: { name: "ShaderMaterial" }, name: "skyMat", side: 1, transparent: false, uniforms: { top: { value: colorOf("112233") }, strength: { value: 0.75 } }, vertexShader: "void main(){}", fragmentShader: "void main(){gl_FragColor=vec4(1.);}" };
  const sky = mk("skyDome", shader, geo("SphereGeometry", 100), { matrixWorld: mat4(0, 0, 0, 500) });
  const red = standard("ff0000");
  const m1 = mk("a", red, geo("BoxGeometry", 24));
  const m2 = mk("b", red, geo("BoxGeometry", 24), { matrixWorld: mat4(5, 0, 0, 2) });
  const m3 = mk("c", standard("00ff00", { transparent: true, opacity: 0.5 }), geo("PlaneGeometry", 4));
  const points = { name: "sparks", isPoints: true, visible: true, children: [], constructor: { name: "Points" }, geometry: { attributes: { position: { count: 300 }, life: {} } }, material: { constructor: { name: "PointsMaterial" }, transparent: true, size: 0.2, color: colorOf("ffaa00"), opacity: 0.8, sizeAttenuation: true, blending: 2 } };
  const light = { isLight: true, visible: true, children: [], constructor: { name: "DirectionalLight" }, type: "DirectionalLight", color: colorOf("fff4e0"), intensity: 2.5, castShadow: true, matrixWorld: mat4(10, 20, 5), target: { matrixWorld: mat4(0, 0, 0) }, shadow: { mapSize: { x: 2048, y: 2048 }, bias: -0.0005, normalBias: 0.02, radius: 2, camera: { isOrthographicCamera: true, left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 } } };
  const scene = {
    isScene: true, visible: true, children: [sky, m1, m2, m3, points, light], constructor: { name: "Scene" },
    updateMatrixWorld: () => undefined, background: colorOf("0a0a14"), fog: { isFog: true, color: colorOf("202040"), near: 10, far: 90 }, environment: null
  };
  return scene;
}

describe("LOOK_HOOK_SOURCE virtual clock", () => {
  it("is real-time until enterManual, then steps virtual frames and virtual time", async () => {
    const w = makeWorld();
    const look = (w.win as { __a3dLook: Record<string, unknown> }).__a3dLook as {
      enterManual: (dt: number) => number; stepAsync: (n: number) => Promise<{ done: number }>; mode: string; virtualMs: () => number | null; vt: number;
    };
    expect(look.mode).toBe("auto");
    expect(look.virtualMs()).toBeNull();
    // manual mode queues rAF callbacks instead of scheduling real frames
    const seen: number[] = [];
    look.enterManual(50);
    const winRaf = (w.win as { requestAnimationFrame: (cb: (ts: number) => void) => number }).requestAnimationFrame;
    const loop = (ts: number) => { seen.push(ts); winRaf(loop); };
    winRaf(loop);
    const r = await look.stepAsync(4);
    expect(r.done).toBe(4);
    expect(seen).toHaveLength(4);
    expect(seen[1]! - seen[0]!).toBeCloseTo(50, 6);
    expect(look.virtualMs()).toBe(200);
    const perf = (w.sandbox.performance as { now: () => number });
    expect(perf.now()).toBe(look.vt);
  });
  it("seeds Math.random deterministically", () => {
    const a = makeWorld();
    const b = makeWorld();
    const ra = vm.runInContext("[Math.random(), Math.random(), Math.random()]", a.sandbox) as number[];
    const rb = vm.runInContext("[Math.random(), Math.random(), Math.random()]", b.sandbox) as number[];
    expect(ra).toEqual(rb);
    expect(ra[0]).not.toBe(ra[1]);
  });
  it("in-page fnv equals hashString", () => {
    const w = makeWorld();
    for (const s of ["", "abc", "void main(){}", "µ unicode ✓"]) {
      expect(vm.runInContext(`window.__a3dLook.util.fnv(${JSON.stringify(s)})`, w.sandbox)).toBe(hashString(s));
    }
  });
});

describe("LOOK_DUMP_SOURCE", () => {
  it("dumps renderer, camera, lights, fog/background, geometry, materials, particles and sky from a fake scene", () => {
    const w = makeWorld();
    const scene = fakeScene();
    const camera = { isCamera: true, isPerspectiveCamera: true, constructor: { name: "PerspectiveCamera" }, fov: 55, aspect: 1.78, near: 0.1, far: 500, zoom: 1, matrixWorld: mat4(0, 3, 10), updateMatrixWorld: () => undefined };
    const rendered: unknown[] = [];
    const renderer = {
      isWebGLRenderer: true, toneMapping: 4, toneMappingExposure: 1.2, outputColorSpace: "srgb", autoClear: true,
      getPixelRatio: () => 2, getSize: (t: { set: (a: number, b: number) => void }) => t.set(960, 540), shadowMap: { enabled: true, type: 2, autoUpdate: true },
      info: { render: { calls: 12, triangles: 3400, points: 300, lines: 0 }, memory: { geometries: 5, textures: 2 } },
      render: (obj: unknown, _camera?: unknown) => { rendered.push(obj); }
    };
    const bus = (w.win as { __THREE_DEVTOOLS__: EventTarget }).__THREE_DEVTOOLS__;
    bus.dispatchEvent(new CustomEvent("observe", { detail: renderer }));
    bus.dispatchEvent(new CustomEvent("observe", { detail: scene }));
    renderer.render(scene, camera);
    renderer.render(scene, camera);

    const dump = vm.runInContext(LOOK_DUMP_SOURCE, w.sandbox) as Record<string, any>;
    expect(dump.error).toBeUndefined();
    expect(dump.errors).toEqual([]);
    expect(dump.renderers[0]).toMatchObject({ kind: "WebGLRenderer", toneMappingName: "aces", exposure: 1.2, pixelRatio: 2, size: [960, 540], outputColorSpace: "srgb" });
    expect(dump.renderers[0].shadowMap).toEqual({ enabled: true, type: "pcfsoft", autoUpdate: true });
    expect(dump.renderers[0].info.render.calls).toBe(12);
    expect(dump.camera).toMatchObject({ ctor: "PerspectiveCamera", fov: 55, near: 0.1, far: 500, position: [0, 3, 10], ortho: false });
    expect(dump.camera.forward).toEqual([0, 0, -1]);
    expect(dump.counts).toMatchObject({ objects: 7, meshes: 4, points: 1, lights: 1 });
    expect(dump.lights).toHaveLength(1);
    expect(dump.lights[0]).toMatchObject({ type: "DirectionalLight", color: "#fff4e0", intensity: 2.5, castShadow: true, position: [10, 20, 5] });
    expect(dump.lights[0].shadow).toMatchObject({ mapSize: [2048, 2048], camera: { left: -30, far: 80 } });
    expect(dump.fog).toEqual({ type: "linear", color: "#202040", near: 10, far: 90 });
    expect(dump.background).toEqual({ color: "#0a0a14" });
    expect(dump.sky).toHaveLength(1);
    expect(dump.sky[0]).toMatchObject({ name: "skyDome", side: 1, uniforms: { top: { color: "#112233" }, strength: 0.75 } });
    expect(dump.particles.points[0]).toMatchObject({ name: "sparks", count: 300, size: 0.2, blending: 2, attributes: ["life", "position"] });
    // material table: red standard material shared by two meshes (users=2), plus transparent green and the sky shader
    const red = dump.materials.find((m: any) => m.color === "#ff0000");
    expect(red).toMatchObject({ ctor: "MeshStandardMaterial", roughness: 0.4, users: 2 });
    const sky = dump.materials.find((m: any) => m.shader);
    expect(sky.fragmentHash).toBe(hashString("void main(){gl_FragColor=vec4(1.);}"));
    expect(sky).not.toHaveProperty("fragmentShader");
    // geometry: largest world volume first (the scaled sky dome), instanced flag false
    const main = dump.scenes[dump.mainScene];
    expect(main.topGeometry[0].name).toBe("skyDome");
    expect(main.topGeometry[0].size).toEqual([1000, 1000, 1000]);
    expect(main.geometryTypes).toMatchObject({ BoxGeometry: 2, PlaneGeometry: 1, SphereGeometry: 1 });
    // path + frame-call log recorded by the render wrapper
    expect(dump.cameraCount).toBe(1);
    expect(dump.effectComponents).toMatchObject({ points: 300, transparent: 2 });
    expect(Array.isArray(dump.frameCalls)).toBe(true);
  });

  it("skips rasterisation in manual mode when skipRender is set, but still records the call", async () => {
    const w = makeWorld();
    let real = 0;
    const renderer = { isWebGLRenderer: true, render: () => { real++; } };
    (w.win as { __THREE_DEVTOOLS__: EventTarget }).__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe", { detail: renderer }));
    const look = (w.win as { __a3dLook: { enterManual: (n: number) => number; skipRender: boolean; renderCalls: number } }).__a3dLook;
    renderer.render();
    expect(real).toBe(1);
    look.enterManual(50);
    look.skipRender = true;
    renderer.render();
    expect(real).toBe(1);
    expect(look.renderCalls).toBe(2);
    look.skipRender = false;
    renderer.render();
    expect(real).toBe(2);
  });

  it("cheap effect score expression counts points, sprites, transparent and instanced objects", () => {
    const w = makeWorld();
    const scene = fakeScene();
    (w.win as { __THREE_DEVTOOLS__: EventTarget }).__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe", { detail: scene }));
    const c = vm.runInContext(LOOK_EFFECT_SOURCE, w.sandbox) as Record<string, number>;
    expect(c).toMatchObject({ points: 300, transparent: 2, objects: 7 });
  });
});
