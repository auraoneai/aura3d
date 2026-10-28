import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { customAttributeBlocker, emitMigratedSource } from "../../../packages/aura3d-cli/src/migrate-three/emit";
import { assertCustomAttributeName } from "../../../packages/engine/src/agent-api/RootGeometry";
import { buildMigrateReport } from "../../../packages/aura3d-cli/src/migrate-three/report";

// PRD-15 T6.1: one fixture per mapping-table row plus an unmapped fixture.
// threejs-parity L10: honest emission — covered constructs emit real calls
// (or `a3d:` guidance for config-shaped targets); lane-dependent constructs
// report `pending` + a `parityPending` TODO naming the landing lane.

describe("aura3d migrate three", () => {
  const cases: Readonly<Record<string, { readonly source: string; readonly expectContains: string[]; readonly mapping: string }>> = {
    Scene: { source: `import * as THREE from "three";\nconst s = new THREE.Scene();`, expectContains: ["scene()", "@aura3d/engine"], mapping: "approximate" },
    PerspectiveCamera: { source: `import * as THREE from "three";\nconst c = new THREE.PerspectiveCamera(50, 1.6, 0.1, 100);`, expectContains: ["camera.perspective({ fov: 50, near: 0.1, far: 100 })", "aspect 1.6"], mapping: "approximate" },
    Mesh: { source: `const m = new THREE.Mesh(geo, mat);`, expectContains: ["primitives()", "map args (geo, mat)"], mapping: "approximate" },
    BoxGeometry: { source: `new THREE.BoxGeometry(1, 2, 1)`, expectContains: ["primitives.box({ size: [1, 2, 1] })"], mapping: "approximate" },
    SphereGeometry: { source: `new THREE.SphereGeometry(0.5)`, expectContains: ["primitives.sphere({ size: 1 })"], mapping: "approximate" },
    CylinderGeometry: { source: `new THREE.CylinderGeometry(0.2, 0.2, 1)`, expectContains: ["primitives.cylinder({ size: [0.4, 1, 0.4], params: { radiusTop: 0.5 } })"], mapping: "approximate" },
    PlaneGeometry: { source: `new THREE.PlaneGeometry(10, 10)`, expectContains: ["primitives.plane({ size: [10, 1, 10] })", "-90° about X"], mapping: "approximate" },
    TorusGeometry: { source: `new THREE.TorusGeometry(1, 0.3)`, expectContains: ["primitives.torus({ size: 1 / 0.43, params: { tube: 0.3 / (1 / 0.43) } })"], mapping: "approximate" },
    MeshStandardMaterial: { source: `new THREE.MeshStandardMaterial({ color: 0xff0000 })`, expectContains: [`material.pbr({ color: "#ff0000" })`], mapping: "approximate" },
    MeshPhysicalMaterial: { source: `new THREE.MeshPhysicalMaterial({ clearcoat: 1, transmission: 0.9, sheen: 0.5 })`, expectContains: ["material.physical"], mapping: "approximate" },
    MeshBasicMaterial: { source: `new THREE.MeshBasicMaterial({ color: 0xffaa00 })`, expectContains: [`material.pbr({ unlit: true, color: "#ffaa00" })`], mapping: "approximate" },
    DirectionalLight: { source: `new THREE.DirectionalLight(0xffffff, 2)`, expectContains: [`lights.directional({ color: "#ffffff", intensity: 2 })`], mapping: "approximate" },
    PointLight: { source: `new THREE.PointLight(0xffaa00, 1, 10)`, expectContains: [`lights.point({ color: "#ffaa00", intensity: 1, distance: 10 })`], mapping: "approximate" },
    SpotLight: { source: `new THREE.SpotLight(0xffffff, 4)`, expectContains: [`lights.spot({ color: "#ffffff", intensity: 4 })`], mapping: "approximate" },
    AmbientLight: { source: `new THREE.AmbientLight(0x404040)`, expectContains: [`lights.ambient({ color: "#404040" })`], mapping: "approximate" },
    HemisphereLight: { source: `new THREE.HemisphereLight(0x87ceeb, 0x362d1f)`, expectContains: ["lights.ambient(", "hemisphere"], mapping: "approximate" },
    "GLTFLoader.load": { source: `const loader = new THREE.GLTFLoader();\nloader.load("hero.glb");`, expectContains: ["a3d: GLTFLoader.load → model"], mapping: "approximate" },
    "RGBELoader.load": { source: `const loader = new THREE.RGBELoader();\nloader.load("env.hdr");`, expectContains: ["a3d: RGBELoader.load → environments.hdri"], mapping: "approximate" },
    OrbitControls: { source: `new THREE.OrbitControls(camera, renderer.domElement)`, expectContains: ["camera.orbit({})"], mapping: "approximate" },
    InstancedMesh: { source: `new THREE.InstancedMesh(geo, mat, 100)`, expectContains: ["instances.box({ transforms: [] })", "100 instances"], mapping: "approximate" },
    "Euler XYZ order": { source: `const e = new THREE.Euler(0.1, 0.2, 0.3, "XYZ");`, expectContains: [`new Euler(0.1, 0.2, 0.3, "XYZ")`, `from "@aura3d/math/three"`, "[e.x, e.y, e.z]"], mapping: "exact" },
    WebGLRenderer: { source: `const r = new THREE.WebGLRenderer({ antialias: true });`, expectContains: ["createAuraApp({ resize: true })"], mapping: "approximate" },
    Fog: { source: `scene.fog = new THREE.Fog(0x87ceeb, 20, 120);`, expectContains: [`effects.fog({ color: "#87ceeb" })`, "near 20/far 120"], mapping: "approximate" },
    Color: { source: `const c = new THREE.Color(0x334455);`, expectContains: ["new Color(0x334455)", `from "@aura3d/math/three"`, "getHexString()"], mapping: "exact" },

    // ── L10: newly honest rows (real GPU-backed public targets) ──────────
    PMREMGenerator: { source: `const p = new THREE.PMREMGenerator(renderer);`, expectContains: ["a3d: PMREMGenerator → environments.capture", "SH-07"], mapping: "approximate" },
    RoomEnvironment: { source: `const e = new RoomEnvironment();`, expectContains: ["environments.neutral()"], mapping: "approximate" },
    UnrealBloomPass: { source: `new UnrealBloomPass(new THREE.Vector2(800, 600), 0.9, 0.35, 0.8)`, expectContains: ["effects.bloom({ intensity: 0.9, radius: 0.35, threshold: 0.8 })", "resolution"], mapping: "approximate" },
    SMAAPass: { source: `new SMAAPass(800, 600)`, expectContains: ["effects.antiAlias({})", "smaa is not implemented"], mapping: "approximate" },
    BokehPass: { source: `new BokehPass(scene, camera, { focus: 5, aperture: 0.001, maxblur: 0.01 })`, expectContains: ["effects.depthOfField({ focus: 5, aperture: 0.001, maxBlur: 0.01 })"], mapping: "approximate" },
    OutputPass: { source: `new OutputPass()`, expectContains: ["a3d: OutputPass → output"], mapping: "approximate" },
    ShaderPass: { source: `new ShaderPass(MyShader)`, expectContains: ["a3d: ShaderPass → app.addPostPass"], mapping: "approximate" },
    CSM: { source: `const csm = new CSM({ cascades: 4, camera });`, expectContains: ["a3d: CSM → lights.directional", "cascades"], mapping: "approximate" },
    AudioLoader: { source: `const a = new THREE.AudioLoader();`, expectContains: ["a3d: AudioLoader → AudioLoader", "@aura3d/engine/assets", "AudioDecodeContext"], mapping: "approximate" },
    "AudioLoader.load": { source: `const a = new THREE.AudioLoader();\na.load("bg.mp3");`, expectContains: ["a3d: AudioLoader.load → assets"], mapping: "approximate" },
    PointerLockControls: { source: `new PointerLockControls(camera, el)`, expectContains: ["new PointerLockControls(camera)", "cameraLike?, options", "@aura3d/engine/controls"], mapping: "approximate" },
    TransformControls: { source: `new TransformControls(camera, el)`, expectContains: ["new TransformControls({})", "TransformControlsOptions", "@aura3d/engine/controls"], mapping: "approximate" },
    PositionalAudio: { source: `new THREE.PositionalAudio(listener)`, expectContains: ["a3d: PositionalAudio → PositionalEmitter", "PositionalEmitterOptions", "@aura3d/engine/audio"], mapping: "approximate" },
    SkinnedMesh: { source: `new THREE.SkinnedMesh(geo, mat)`, expectContains: ["a3d: SkinnedMesh → model"], mapping: "approximate" },
    Clock: { source: `const c = new THREE.Clock();`, expectContains: ["a3d: Clock → Clock", "SR-06"], mapping: "exact" },
    Vector2: { source: `new THREE.Vector2(1, 2)`, expectContains: ["new Vector2(1, 2)", `from "@aura3d/math/three"`], mapping: "exact" },
    Matrix4: { source: `new THREE.Matrix4()`, expectContains: ["new Matrix4()", `from "@aura3d/math/three"`], mapping: "exact" },
    WebGPURenderer: { source: `new THREE.WebGPURenderer()`, expectContains: ["createAuraApp({ resize: true })"], mapping: "approximate" },

    // ── L10: graduated pending rows — targets now public, a3d guidance ──
    ShaderMaterial: { source: `new THREE.ShaderMaterial({ uniforms: {} })`, expectContains: ["a3d: ShaderMaterial → material.custom", "SH-02"], mapping: "approximate" },
    RawShaderMaterial: { source: `new THREE.RawShaderMaterial()`, expectContains: ["a3d: RawShaderMaterial → material.custom"], mapping: "approximate" },
    CatmullRomCurve3: { source: `new THREE.CatmullRomCurve3(pts)`, expectContains: ["a3d: CatmullRomCurve3 → CatmullRomCurve3", "@aura3d/engine/math"], mapping: "exact" },
    BatchedMesh: { source: `new THREE.BatchedMesh(10, 1000, 5000, mat)`, expectContains: ["a3d: BatchedMesh → batched.mesh", "SG-02"], mapping: "approximate" },
    Line: { source: `new THREE.Line(geo, mat)`, expectContains: ["a3d: Line → lines.line", "SG-06"], mapping: "approximate" },
    Points: { source: `new THREE.Points(geo, mat)`, expectContains: ["a3d: Points → points", "SG-07"], mapping: "approximate" },
    Sprite: { source: `new THREE.Sprite(mat)`, expectContains: ["a3d: Sprite → sprites", "SG-08"], mapping: "approximate" },
    ConeGeometry: { source: `new THREE.ConeGeometry(1, 2)`, expectContains: ["a3d: ConeGeometry → primitives.cone", "SG-03"], mapping: "exact" },
    TubeGeometry: { source: `new THREE.TubeGeometry(curve, 20, 0.5)`, expectContains: ["a3d: TubeGeometry → primitives.tube", "SG-03"], mapping: "exact" },
    Raycaster: { source: `new THREE.Raycaster()`, expectContains: ["a3d: Raycaster → raycast", "SR-03"], mapping: "approximate" },
    CubeCamera: { source: `new THREE.CubeCamera(0.1, 100, rt)`, expectContains: ["a3d: CubeCamera → cameras.cube", "SC-01"], mapping: "approximate" },
    WebGLRenderTarget: { source: `new THREE.WebGLRenderTarget(512, 512)`, expectContains: ["a3d: WebGLRenderTarget → RenderTarget", "SH-06"], mapping: "approximate" },
    AxesHelper: { source: `new THREE.AxesHelper(5)`, expectContains: ["a3d: AxesHelper → helpers.axes", "SC-03"], mapping: "approximate" },
    TextureLoader: { source: `const t = new THREE.TextureLoader();`, expectContains: ["a3d: TextureLoader → texture.load", "ST-07"], mapping: "approximate" },
    "TextureLoader.load": { source: `const t = new THREE.TextureLoader();\nt.load("wood.png");`, expectContains: ["a3d: TextureLoader.load → assets"], mapping: "approximate" },
    Reflector: { source: `new THREE.Reflector(geo)`, expectContains: ["a3d: Reflector → surfaces.mirror", "AD-15"], mapping: "approximate" },
    Lensflare: { source: `const flare = new THREE.Lensflare();`, expectContains: ["a3d: Lensflare → lights.lensFlare", "AD-15"], mapping: "approximate" },
    LensflareElement: { source: `new LensflareElement(tex, 60, 0.6, color)`, expectContains: ["a3d: LensflareElement → lights.lensFlare", "elements"], mapping: "approximate" },
    "Scene.overrideMaterial": { source: `const scene = new THREE.Scene();\nscene.overrideMaterial = depthMaterial;`, expectContains: ["a3d: Scene.overrideMaterial → scene().overrideMaterial", "SG-10"], mapping: "approximate" },

    // ── pending rows that remain — targets reserved, not yet public ─────
    NodeMaterial: { source: `new THREE.NodeMaterial()`, expectContains: ["a3d: NodeMaterial → material.node", "SH-01", "normalNode"], mapping: "approximate" },
    MeshBasicNodeMaterial: { source: `new THREE.MeshBasicNodeMaterial()`, expectContains: ["a3d: MeshBasicNodeMaterial → material.node", "unlit"], mapping: "approximate" },
    MeshStandardNodeMaterial: { source: `new THREE.MeshStandardNodeMaterial()`, expectContains: ["a3d: MeshStandardNodeMaterial → material.node", "scene-light"], mapping: "approximate" },
    Layers: { source: `const l = new THREE.Layers();`, expectContains: ["a3d: Layers → layers", "camera-side layer mask is not yet public"], mapping: "approximate" },
    PlaneHelper: { source: `new THREE.PlaneHelper(plane)`, expectContains: ["a3d: PlaneHelper —", "draw it by hand"], mapping: "none" },

    // ── L10: deliberate exclusions (AD-04 loaders, AD-05 exporters) ──────
    FBXLoader: { source: `new THREE.FBXLoader()`, expectContains: ["a3d: FBXLoader — excluded (AD-04)"], mapping: "none" },
    "FBXLoader.load": { source: `const f = new FBXLoader();\nf.load("walk.fbx");`, expectContains: ["a3d: FBXLoader.load — excluded (AD-04)"], mapping: "none" },
    GLTFExporter: { source: `new THREE.GLTFExporter()`, expectContains: ["a3d: GLTFExporter — excluded (AD-05)"], mapping: "none" },
    "excluded import specifier": {
      source: `import { FBXLoader } from "three/addons/loaders/FBXLoader.js";`,
      expectContains: ["a3d:drop", "excluded (AD-04)"],
      mapping: "none"
    },
    "unmapped construct": { source: `new THREE.CSS3DRenderer()`, expectContains: ["no mapping for CSS3DRenderer"], mapping: "none" },
  };

  for (const [name, { source, expectContains, mapping }] of Object.entries(cases)) {
    it(`maps ${name}`, () => {
      const { code, rows } = emitMigratedSource(source);
      for (const needle of expectContains) expect(code, name).toContain(needle);
      const row = rows.find((r) => r.mapping === mapping);
      expect(row, name).toBeDefined();
      expect(row?.note).toBeTruthy();
    });
  }

  it("rewrites controls addon specifiers to @aura3d/engine/controls", () => {
    const { code } = emitMigratedSource(`import { OrbitControls } from "three/addons/controls/OrbitControls.js";\nimport { TransformControls } from "three/examples/jsm/controls/TransformControls.js";`);
    expect(code).toContain(`from "@aura3d/engine/controls"`);
    expect(code).not.toContain(`from "three/addons/controls/OrbitControls.js"`);
    expect(code).not.toContain(`from "three/examples/jsm/controls/TransformControls.js"`);
  });

  it("drops post addon imports with honest a3d:drop comments", () => {
    const { code } = emitMigratedSource(`import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";\nimport { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";`);
    expect(code).toContain("a3d:drop");
    expect(code).toContain("effects.bloom()");
    // the original import lines are commented out — no live three specifier survives
    expect(code).not.toMatch(/^import \{ EffectComposer \} from/m);
    expect(code).not.toMatch(/^import \{ UnrealBloomPass \} from/m);
  });

  it("report carries {construct,line,mapping,note} rows and counts", () => {
    const { rows } = emitMigratedSource(`import * as THREE from "three";\nnew THREE.Scene();\nnew THREE.CSS3DRenderer()\nnew THREE.PlaneHelper(plane)`);
    const report = buildMigrateReport(rows);
    expect(report.counts.none).toBe(2);
    expect(report.counts.pending).toBe(0);
    expect(report.rows.some((r) => r.construct === "CSS3DRenderer" && r.line === 3)).toBe(true);
    expect(report.rows.some((r) => r.construct === "PlaneHelper" && r.mapping === "none")).toBe(true);
  });

  // ── Golden: a Crayon-style module shaped like Strange Orbit ────────────
  // scene + perspective camera + orbit controls + instanced mesh + post.
  // Every construct used is covered by a real GPU-backed row, so the emitted
  // game logic carries zero `TODO(a3d-migrate)` markers.
  it("golden: Strange Orbit-style module migrates with zero TODOs", () => {
    const source = `import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CSM } from "three/addons/csm/CSM.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
renderer.setAnimationLoop(tick);
const world = new THREE.Scene();
world.background = new THREE.Color(0x87ceeb);
world.fog = new THREE.Fog(0x87ceeb, 20, 120);
const cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);
const controls = new OrbitControls(cam, renderer.domElement);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
const hemi = new THREE.HemisphereLight(0x87ceeb, 0x362d1f, 0.6);
const csm = new CSM({ camera: cam, cascades: 4, maxFar: 120 });
const planetGeo = new THREE.SphereGeometry(4, 48, 48);
const planetMat = new THREE.MeshStandardMaterial({ color: 0x2a6f4e, roughness: 0.8 });
const planet = new THREE.Mesh(planetGeo, planetMat);
const rockGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a4b2d, metalness: 0.1 });
const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 64);
const shipMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(world, cam));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.4, 0.85));
composer.addPass(new OutputPass());
renderer.render(world, cam);
`;

    const { code, rows } = emitMigratedSource(source);

    // game logic: zero TODO(a3d-migrate) for covered constructs
    expect(code).not.toContain("TODO(a3d-migrate)");

    // rewritten imports
    expect(code).toContain(`from "@aura3d/engine"`);
    expect(code).toContain(`from "@aura3d/engine/controls"`);
    expect(code).toContain(`from "@aura3d/math/three"`);

    // app + scene + camera + controls
    expect(code).toContain("createAuraApp({ resize: true })");
    expect(code).toContain("renderer.onFrame(tick)");
    expect(code).toContain("const world = scene()");
    expect(code).toContain("camera.perspective({ fov: 60, near: 0.1, far: 500 })");
    expect(code).toContain("camera.orbit({})");

    // lights + fog
    expect(code).toContain(`lights.directional({ color: "#ffffff", intensity: 2.2 })`);
    expect(code).toContain("lights.ambient(");
    expect(code).toContain(`effects.fog({ color: "#87ceeb" })`);

    // geometry / material / instancing
    expect(code).toContain("primitives.sphere({ size: 8, params: { widthSegments: 48, heightSegments: 48 } })");
    expect(code).toContain(`material.pbr({ color: "#2a6f4e", roughness: 0.8 })`);
    expect(code).toContain(`material.pbr({ color: "#8a4b2d", metallic: 0.1 })`);
    expect(code).toContain("instances.box({ transforms: [] })");
    expect(code).toContain("64 instances");
    expect(code).toContain(`material.pbr({ unlit: true, color: "#ffaa00" })`);

    // post — bloom emits a real call; composer/render/output pass drop to
    // honest a3d guidance (config targets, not fake calls)
    expect(code).toContain("effects.bloom({ intensity: 0.8, radius: 0.4, threshold: 0.85 })");
    expect(code).toContain("a3d: EffectComposer → effects");
    expect(code).toContain("a3d: RenderPass → scene");
    expect(code).toContain("a3d: OutputPass → output");
    expect(code).toContain("a3d: CSM → lights.directional");
    expect(code).toContain("a3d:drop import { UnrealBloomPass }");
    expect(code).toContain("a3d:drop import { CSM }");

    // every reported construct row is covered — no `none`, no `pending`
    for (const row of rows) {
      expect(row.mapping, row.construct).not.toBe("none");
      expect(row.mapping, row.construct).not.toBe("pending");
    }
  });
});

describe("migrate three: scanner on pretty-printed source", () => {
  it("finds constructs whose arguments span lines and nest deeply", () => {
    const source = `import * as THREE from "three";
const mat = new THREE.MeshStandardMaterial({
  color: 0xff0000,
  map: loadMap(),
});
const tube = new THREE.Mesh(
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)]), 64, 0.2),
  mat
);
`;
    const { rows } = emitMigratedSource(source);
    const lines = (name: string) => rows.filter((r) => r.construct === name).map((r) => r.line);
    expect(lines("MeshStandardMaterial")).toEqual([2]);
    expect(lines("Mesh")).toEqual([6]);
    expect(lines("TubeGeometry")).toEqual([7]);
    expect(lines("CatmullRomCurve3")).toEqual([7]);
    expect(lines("Vector3")).toEqual([7, 7]);
  });

  it("ignores parens inside strings and comments when balancing arguments", () => {
    const source = `const m = new THREE.MeshBasicMaterial({
  name: "a ) tricky ( name",
  // a stray ) in a comment
  color: 0xffaa00,
});
const s = new THREE.Scene();
`;
    const { rows } = emitMigratedSource(source);
    expect(rows.map((r) => [r.construct, r.line])).toEqual([["MeshBasicMaterial", 1], ["Scene", 6]]);
  });

  it("rewrites a call whose argument text has irregular whitespace", () => {
    const { code } = emitMigratedSource(`const s = new THREE.Scene( );`);
    expect(code).toContain("scene()");
    expect(code).not.toContain("new THREE.Scene");
  });

  it("does not treat a browser `new Audio(src)` as three's Audio", () => {
    const { rows } = emitMigratedSource(`const el = new Audio("a.mp3");`);
    expect(rows).toEqual([]);
    const named = emitMigratedSource(`import { Audio } from "three";\nconst a = new Audio(listener);`);
    expect(named.rows.some((r) => r.construct === "Audio")).toBe(true);
  });
});

describe("migrate three: vertex attributes and canvas textures", () => {
  it("maps standard attributes and CanvasTexture to real engine targets without a TODO", () => {
    const { code, rows } = emitMigratedSource(`import * as THREE from "three";
const g = new THREE.BufferGeometry();
g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
g.setIndex(new THREE.Uint16BufferAttribute(idx, 1));
const t = new THREE.CanvasTexture(canvas);
`);
    expect(code).not.toContain("TODO(a3d-migrate)");
    expect(code).toContain("a3d: Float32BufferAttribute → geometry.dynamic");
    expect(code).toContain("a3d: CanvasTexture → texture.canvas");
    for (const name of ["Float32BufferAttribute", "Uint16BufferAttribute", "CanvasTexture"]) {
      expect(rows.find((r) => r.construct === name)?.mapping, name).toBe("approximate");
    }
  });

  it("maps a custom vertex attribute to geometry.dynamic attributes (R-23), never flags DOM setAttribute", () => {
    const { code, rows } = emitMigratedSource(`import * as THREE from "three";
const g = new THREE.BufferGeometry();
g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
g.setAttribute("pigmentVein", new THREE.Float32BufferAttribute(vein, 1));
canvas.setAttribute("aria-label", "x");
panel.setAttribute("id", "hud");
`);
    expect(code).not.toContain("TODO(a3d-migrate)");
    const custom = rows.filter((r) => r.construct === `setAttribute("pigmentVein")`);
    expect(custom).toHaveLength(1);
    expect(custom[0]).toMatchObject({ mapping: "approximate" });
    expect(code).toMatch(/\/\/ a3d: custom vertex attribute "pigmentVein" → geometry\.dynamic\(\{ attributes: \{ pigmentVein:/);
    expect(rows.some((r) => r.construct.includes("aria-label") || r.construct.includes('"id"'))).toBe(false);
  });

  it("still flags attribute names the engine cannot carry as custom attributes", () => {
    const { code, rows } = emitMigratedSource(`import * as THREE from "three";
g.setAttribute("uv1", new THREE.Float32BufferAttribute(a, 2));
g.setAttribute("skinIndex", new THREE.Float32BufferAttribute(b, 4));
g.setAttribute("a_mine", new THREE.Float32BufferAttribute(c, 1));
g.setAttribute("ok_name", new THREE.Float32BufferAttribute(d, 1));
`);
    const todos = code.split("\n").filter((l) => l.includes("TODO(a3d-migrate)"));
    expect(todos).toHaveLength(3);
    expect(rows.filter((r) => r.mapping === "none").map((r) => r.construct)).toEqual([`setAttribute("uv1")`, `setAttribute("skinIndex")`, `setAttribute("a_mine")`]);
    expect(rows.find((r) => r.construct === `setAttribute("ok_name")`)?.mapping).toBe("approximate");
  });

  it("customAttributeBlocker agrees with the engine assertCustomAttributeName", () => {
    const names = [
      "size", "pigmentVein", "paintOriginal", "ok_name", "A1", "_x",
      "position", "normal", "uv", "uv1", "color", "tangent", "joints", "weights", "index", "instanceMatrix", "colors", "uvs",
      "a_pos", "u_time", "gl_Position", "a__b", "1abc", "bad-name", "with space"
    ];
    for (const name of names) {
      let engineAccepts = true;
      try { assertCustomAttributeName(name); } catch { engineAccepts = false; }
      expect(customAttributeBlocker(name) === undefined, name).toBe(engineAccepts);
    }
  });
});

// R-19: the real Strange Orbit game, captured remotely (tools/crayon-probe/capture-module.ts, ACR run cc1ap).
// Both fixtures are UNTRUSTED third-party text: they are only ever read as strings here, never executed.
describe("golden: real Strange Orbit capture", () => {
  const dir = resolve(__dirname, "../../fixtures/crayon/strange-orbit");
  const read = (name: string) => readFileSync(resolve(dir, name), "utf8");

  it("the captured 19 KB module is the recorded bootstrap shell, byte for byte", () => {
    const shell = read("game-module.mjs");
    expect(Buffer.byteLength(shell)).toBe(19300);
    const recorded = /SHA-256: ([0-9a-f]{64})/.exec(read("PROVENANCE.md"))?.[1];
    expect(createHash("sha256").update(shell).digest("hex")).toBe(recorded);
  });

  it("the shell holds no three.js constructs: the game logic is a separate runtime/game.js import", () => {
    const shell = read("game-module.mjs");
    expect(shell).toMatch(/await import\("https:\/\/[^"]+\/runtime\/game\.js"\)/);
    const { rows, code } = emitMigratedSource(shell);
    expect(rows).toEqual([]);
    expect(code).not.toContain("TODO(a3d-migrate)");
  });

  it("every three construct in the game's own code is reported and the migration carries zero TODOs", () => {
    const census = (JSON.parse(read("census.json")) as { threeConstructs: Record<string, number> }).threeConstructs;
    const { rows, code } = emitMigratedSource(read("game-logic.demangled.js"));

    // The census is an independent count (regex over the bundle's class markers); the codemod must agree
    // on every construct, including the pretty-printed multi-line calls.
    const reported: Record<string, number> = {};
    for (const row of rows) reported[row.construct] = (reported[row.construct] ?? 0) + 1;
    for (const [name, count] of Object.entries(census)) expect(reported[name], name).toBe(count);
    expect(Object.keys(census).length).toBeGreaterThanOrEqual(39);

    // R-23: the five custom vertex attributes map to geometry.dynamic({ attributes }); no TODO remains in game logic.
    expect(code).not.toContain("TODO(a3d-migrate)");
    const custom = rows.filter((r) => /^setAttribute\("/.test(r.construct));
    expect(custom.map((r) => /"([^"]+)"/.exec(r.construct)![1]!).sort()).toEqual(["paintOriginal", "pigmentBase", "pigmentChalk", "pigmentVein", "size"]);
    expect(custom.every((r) => r.mapping === "approximate")).toBe(true);
  });
});
