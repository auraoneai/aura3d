import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { CLICK_START_SOURCE, GAME_STATE_SOURCE, HOOK_SOURCE, LIST_CONTROLS_SOURCE, SAMPLE_SOURCE, SCAN_SOURCE } from "../../../tools/crayon-probe/inpage";
import { chooseStartControl, downsample, settleStatus, startScore, type Control, type Sample } from "../../../tools/crayon-probe/startControl";
import { buildVerdicts, liveTraversalRan, type ProbeEvidence, type SceneCensus } from "../../../tools/crayon-probe/verdicts";

// R-01: the probe's in-page hook, scene census and verdict rules, exercised against
// a fake three.js object graph. The in-page sources are plain JS strings, so the
// code under test is byte-for-byte what the browser runs.

interface Sandbox extends Record<string, unknown> {
  window: Sandbox;
  EventTarget: typeof EventTarget;
  CustomEvent: typeof CustomEvent;
  performance: { getEntriesByType: (t: string) => { name: string }[] };
  document: Record<string, unknown>;
}

function makeWindow(resources: readonly string[] = []): Sandbox {
  const sandbox = {
    EventTarget,
    CustomEvent,
    performance: { getEntriesByType: () => resources.map((name) => ({ name })) },
    document: {
      title: "fake game",
      querySelector: () => null,
      querySelectorAll: () => []
    }
  } as unknown as Sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(HOOK_SOURCE, sandbox);
  return sandbox;
}

const observe = (win: Sandbox, detail: unknown): void => {
  (win.__THREE_DEVTOOLS__ as EventTarget).dispatchEvent(new CustomEvent("observe", { detail }));
};
const scan = (win: Sandbox): any => vm.runInContext(SCAN_SOURCE, win);

class Scene { isScene = true; isObject3D = true; children: unknown[] = []; overrideMaterial: unknown = null; }
class Group { isObject3D = true; children: unknown[] = []; }
class Mesh { isMesh = true; isObject3D = true; children: unknown[] = []; constructor(public material: unknown) {} }
class InstancedMesh extends Mesh { isInstancedMesh = true; }
class BatchedMesh extends Mesh { isBatchedMesh = true; }
class MeshStandardMaterial { isMaterial = true; }
class ShaderMaterial { isMaterial = true; isShaderMaterial = true; }
class RawShaderMaterial extends ShaderMaterial { isRawShaderMaterial = true; }
class MeshStandardNodeMaterial { isMaterial = true; isNodeMaterial = true; colorNode: unknown = null; fragmentNode: unknown = null; positionNode: unknown = null; }
class WebGLRenderer {
  isWebGLRenderer = true;
  calls: unknown[] = [];
  targets: unknown[] = [];
  render(scene: unknown): void { this.calls.push(scene); }
  setRenderTarget(target: unknown): void { this.targets.push(target); }
}
class WebGPURenderer { isWebGPURenderer = true; render(): void { /* noop */ } async renderAsync(): Promise<void> { /* noop */ } }

function populatedScene(): Scene {
  const scene = new Scene();
  const group = new Group();
  const authored = new MeshStandardNodeMaterial();
  authored.colorNode = { type: "node" };
  const bare = new MeshStandardNodeMaterial();
  group.children.push(
    new Mesh(new MeshStandardMaterial()),
    new Mesh(new ShaderMaterial()),
    new Mesh(new RawShaderMaterial()),
    new InstancedMesh(new MeshStandardMaterial()),
    new BatchedMesh(new MeshStandardMaterial()),
    new Mesh([authored, bare])
  );
  group.children.push(group); // cycle must not hang the traversal
  scene.children.push(group);
  return scene;
}

describe("crayon-probe hook (HOOK_SOURCE)", () => {
  it("captures the live Scene and renderers three.js announces on __THREE_DEVTOOLS__", () => {
    const win = makeWindow();
    const scene = populatedScene();
    observe(win, scene);
    observe(win, scene); // dedupe
    observe(win, new WebGLRenderer());
    observe(win, new WebGPURenderer());
    observe(win, { notAThreeThing: true });
    const hook = win.__a3dHook as { scenes: unknown[]; renderers: { kind: string }[]; observed: number };
    expect(hook.scenes).toHaveLength(1);
    expect(hook.renderers.map((r) => r.kind)).toEqual(["WebGLRenderer", "WebGPURenderer"]);
    expect(hook.observed).toBe(5);
  });

  it("is idempotent and reuses a pre-existing devtools bus", () => {
    const sandbox = {
      EventTarget, CustomEvent,
      performance: { getEntriesByType: () => [] },
      document: {}
    } as unknown as Sandbox;
    sandbox.window = sandbox;
    const bus = new EventTarget();
    sandbox.__THREE_DEVTOOLS__ = bus;
    vm.createContext(sandbox);
    vm.runInContext(HOOK_SOURCE, sandbox);
    const hook = sandbox.__a3dHook;
    vm.runInContext(HOOK_SOURCE, sandbox);
    expect(sandbox.__a3dHook).toBe(hook);
    expect(sandbox.__THREE_DEVTOOLS__).toBe(bus);
    bus.dispatchEvent(new CustomEvent("observe", { detail: new Scene() }));
    expect((hook as { scenes: unknown[] }).scenes).toHaveLength(1);
  });

  it("marks scenes passed to renderer.render and counts non-null render targets", () => {
    const win = makeWindow();
    const renderer = new WebGLRenderer();
    observe(win, renderer);
    const scene = new Scene(); // never announced: only seen through render()
    renderer.render(scene);
    renderer.setRenderTarget(null);
    renderer.setRenderTarget({ isWebGLRenderTarget: true });
    const out = scan(win);
    expect(out.scenes).toBe(1);
    expect(out.renderedScenes).toBe(1);
    expect(out.renderers).toEqual([{ kind: "WebGLRenderer", renderCalls: 1, targetSets: 2, nonNullTargetSets: 1 }]);
    expect(renderer.calls).toEqual([scene]); // original behaviour preserved
    expect(renderer.targets).toHaveLength(2);
  });

  it("records the three revision from the register event", () => {
    const win = makeWindow();
    (win.__THREE_DEVTOOLS__ as EventTarget).dispatchEvent(new CustomEvent("register", { detail: { revision: "184" } }));
    expect(scan(win).revisions).toEqual(["184"]);
  });
});

describe("crayon-probe scan (SCAN_SOURCE)", () => {
  it("returns hookInstalled:false when the hook never ran", () => {
    const bare = { window: null as unknown } as Record<string, unknown>;
    bare.window = bare;
    vm.createContext(bare);
    expect(vm.runInContext(SCAN_SOURCE, bare)).toEqual({ hookInstalled: false });
  });

  it("counts shader, node, instanced and batched objects across a cyclic graph with array materials", () => {
    const win = makeWindow();
    observe(win, populatedScene());
    const t = scan(win).traversal;
    expect(t.scenes).toBe(1);
    expect(t.objects).toBe(8); // scene + group + 6 meshes
    expect(t.meshes).toBe(6);
    expect(t.instancedMeshes).toBe(1);
    expect(t.batchedMeshes).toBe(1);
    expect(t.shaderMaterials).toBe(2); // ShaderMaterial + RawShaderMaterial
    expect(t.rawShaderMaterials).toBe(1);
    expect(t.nodeMaterialClasses).toBe(2);
    expect(t.nodeMaterialsAuthored).toBe(1); // the one with colorNode set; default-null node materials do not count
    expect(t.nodeMaterialSlots).toEqual({ colorNode: 1 });
    expect(t.materialCtorCounts.ShaderMaterial).toBe(1);
  });

  it("includes scene.overrideMaterial in the material census", () => {
    const win = makeWindow();
    const scene = populatedScene();
    scene.overrideMaterial = new ShaderMaterial();
    observe(win, scene);
    expect(scan(win).traversal.shaderMaterials).toBe(3);
  });

  it("finds an EffectComposer reachable from window without invoking accessors", () => {
    const win = makeWindow();
    let getterCalled = false;
    const renderer = new WebGLRenderer();
    const composer: Record<string, unknown> = {
      renderer,
      renderTarget1: {},
      passes: [new (class RenderPass {})(), new (class UnrealBloomPass {})()]
    };
    composer.self = composer;
    Object.defineProperty(composer, "trap", { get() { getterCalled = true; return {}; }, enumerable: true });
    win.game = { systems: { post: composer } };
    const out = scan(win);
    expect(out.pipelines.composers).toBe(1);
    expect(out.pipelines.composerPasses[0]).toEqual(["RenderPass", "UnrealBloomPass"]);
    expect(getterCalled).toBe(false);
  });

  it("survives a cross-origin Window / throwing proxy reachable from window (ninja-runner SecurityError regression)", () => {
    const win = makeWindow();
    observe(win, populatedScene());
    win.child = new Proxy({}, { get() { throw new Error("SecurityError: Blocked a frame with origin \"null\""); }, ownKeys() { throw new Error("SecurityError"); } });
    win.holder = { crossOrigin: win.child, composer: new (class EffectComposer { isEffectComposer = true; })() };
    const out = scan(win);
    expect(out.traversal.objects).toBe(8);
    expect(out.pipelines.composers).toBe(1);
    expect(out.scanErrors).toEqual([]);
  });

  it("finds an r186 PostProcessing instance by constructor name", () => {
    const win = makeWindow();
    win.pp = new (class PostProcessing { outputNode = null; })();
    expect(scan(win).pipelines.postProcessing).toBe(1);
  });

  it("does not descend into scenes, textures or DOM-like nodes", () => {
    const win = makeWindow();
    win.world = { scene: populatedScene(), el: { nodeType: 1, hidden: new (class EffectComposer { isEffectComposer = true; })() } };
    expect(scan(win).pipelines.composers).toBe(0);
  });

  it("derives module signals from resource timing without any import() side effects", () => {
    const win = makeWindow([
      "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.min.js",
      "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/postprocessing/EffectComposer.js",
      "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/postprocessing/UnrealBloomPass.js"
    ]);
    const rs = scan(win).resourceSignals;
    expect(rs.threeCoreLoaded).toBe(true);
    expect(rs.webgpuBuild).toEqual([]);
    expect(rs.effectComposerModule).toHaveLength(1);
    expect(rs.composerModule).toHaveLength(2);
    expect(rs.passModules).toHaveLength(1);
  });

  it("flags a three/webgpu build when the resource list contains one", () => {
    const win = makeWindow(["https://cdn.example/three@0.186.0/build/three.webgpu.min.js"]);
    expect(scan(win).resourceSignals.webgpuBuild).toHaveLength(1);
  });
});

describe("crayon-probe click-start (CLICK_START_SOURCE)", () => {
  const run = (nodes: { innerText: string; w?: number; click: () => void }[]): unknown => {
    const sandbox = {
      document: {
        querySelectorAll: () => nodes.map((n) => ({
          innerText: n.innerText,
          textContent: n.innerText,
          getBoundingClientRect: () => ({ width: n.w ?? 100, height: 40 }),
          click: n.click
        }))
      }
    } as Record<string, unknown>;
    vm.createContext(sandbox);
    return vm.runInContext(CLICK_START_SOURCE, sandbox);
  };

  it("clicks a visible 'Tap to start' control and returns its label", () => {
    let clicked = 0;
    expect(run([{ innerText: "Settings", click: () => { clicked += 10; } }, { innerText: "Tap to start", click: () => { clicked++; } }])).toBe("Tap to start");
    expect(clicked).toBe(1);
  });

  it("ignores invisible matches and long paragraphs that merely contain the phrase", () => {
    let clicked = 0;
    const click = () => { clicked++; };
    expect(run([{ innerText: "Tap to start", w: 0, click }, { innerText: "Please tap to start the game when you are ready", click }])).toBeNull();
    expect(clicked).toBe(0);
  });
});

const census = (over: Partial<SceneCensus> = {}): SceneCensus => ({
  scenes: 1, objects: 50, batchedMeshes: 0, instancedMeshes: 0, shaderMaterials: 0, rawShaderMaterials: 0, nodeMaterialClasses: 0, nodeMaterialsAuthored: 0, ...over
});
const evidence = (over: Partial<ProbeEvidence> = {}): ProbeEvidence => ({ hookInstalled: true, traversal: census(), heap: {}, heapBytes: 1000, ...over });
const importmapGame = { threeCoreLoaded: true, webgpuBuild: [] as string[], composerModule: [] as string[], passModules: [] as string[] };

describe("crayon-probe verdicts", () => {
  it("never answers 'no' when no scene was captured (the old contextFound:false failure mode)", () => {
    const v = buildVerdicts(evidence({ hookInstalled: false, traversal: undefined }));
    expect([v.p2.answer, v.p4.answer]).toEqual(["inconclusive", "inconclusive"]);
    expect(v.p1.answer).toBe("inconclusive");
    expect(v.p3.answer).toBe("inconclusive");
  });

  it("treats a scene with only its root object as not populated", () => {
    const ev = evidence({ traversal: census({ scenes: 1, objects: 1 }) });
    expect(liveTraversalRan(ev)).toBe(false);
    expect(buildVerdicts(ev).p2.answer).toBe("inconclusive");
  });

  it("answers 'no' with live basis only after a populated traversal found nothing", () => {
    const v = buildVerdicts(evidence());
    expect(v.p2).toMatchObject({ answer: "no", basis: "live" });
    expect(v.p4).toMatchObject({ answer: "no", basis: "live" });
  });

  it("ignores heap class names for core three classes", () => {
    const v = buildVerdicts(evidence({ traversal: undefined, hookInstalled: false, heap: { BatchedMesh: 3, ShaderMaterial: 2, RawShaderMaterial: 1 } }));
    expect(v.p2.answer).toBe("inconclusive");
    expect(v.p4.answer).toBe("inconclusive");
    expect(v.p4.value).toMatchObject({ heapShaderNames: 2 });
  });

  it("answers 'yes' from live counts", () => {
    const v = buildVerdicts(evidence({ traversal: census({ batchedMeshes: 2, shaderMaterials: 1, rawShaderMaterials: 1, nodeMaterialsAuthored: 3, nodeMaterialClasses: 4 }) }));
    expect(v.p1).toMatchObject({ answer: "yes", basis: "live" });
    expect(v.p2).toMatchObject({ answer: "yes", basis: "live" });
    expect(v.p4).toMatchObject({ answer: "yes", basis: "live" });
  });

  it("P-1: NodeMaterial classes without authored nodes are not 'yes'", () => {
    const v = buildVerdicts(evidence({ traversal: census({ nodeMaterialClasses: 5, nodeMaterialsAuthored: 0 }), resourceSignals: { ...importmapGame, webgpuBuild: ["three.webgpu.js"] } }));
    expect(v.p1).toMatchObject({ answer: "no", basis: "live" });
  });

  it("P-1: importmap game that never requests three/webgpu is a module-level 'no' even before a scene exists", () => {
    const v = buildVerdicts(evidence({ hookInstalled: false, traversal: undefined, resourceSignals: importmapGame }));
    expect(v.p1).toMatchObject({ answer: "no", basis: "module" });
  });

  it("P-1: three/webgpu present and no populated scene stays inconclusive", () => {
    const v = buildVerdicts(evidence({ hookInstalled: false, traversal: undefined, resourceSignals: { ...importmapGame, webgpuBuild: ["three.webgpu.js"] } }));
    expect(v.p1.answer).toBe("inconclusive");
  });

  it("P-3: live composer or PostProcessing is 'yes'", () => {
    expect(buildVerdicts(evidence({ pipelines: { composers: 1, postProcessing: 0, nodesVisited: 10, truncated: false } })).p3).toMatchObject({ answer: "yes", basis: "live" });
    expect(buildVerdicts(evidence({ pipelines: { composers: 0, postProcessing: 1, nodesVisited: 10, truncated: false } })).p3.answer).toBe("yes");
  });

  it("P-3: 'no' needs a populated scene, importmap three, and no addon/webgpu module", () => {
    const ev = evidence({ resourceSignals: importmapGame, pipelines: { composers: 0, postProcessing: 0, nodesVisited: 5, truncated: false } });
    expect(buildVerdicts(ev).p3).toMatchObject({ answer: "no", basis: "module" });
    expect(buildVerdicts({ ...ev, hookInstalled: false, traversal: undefined }).p3.answer).toBe("inconclusive");
    // a pass module without EffectComposer.js itself proves nothing about a pipeline
    expect(buildVerdicts({ ...ev, resourceSignals: { ...importmapGame, composerModule: ["RenderPass.js"], passModules: ["RenderPass.js"] } }).p3.answer).toBe("inconclusive");
  });

  it("P-3: EffectComposer.js fetched by the game is a module-basis 'yes' even when the instance is closure-held (drift-and-deliver)", () => {
    const v = buildVerdicts(evidence({
      resourceSignals: { ...importmapGame, effectComposerModule: ["postprocessing/EffectComposer.js"], composerModule: ["postprocessing/EffectComposer.js", "postprocessing/RenderPass.js"], passModules: ["postprocessing/RenderPass.js"] },
      pipelines: { composers: 0, postProcessing: 0, nodesVisited: 1506, truncated: false }
    }));
    expect(v.p3).toMatchObject({ answer: "yes", basis: "module" });
  });

  it("P-1/P-3: a lone heap 'NodeMaterial' string in a plain three build must not count as three/webgpu", () => {
    const ev = evidence({ heap: { NodeMaterial: 1 }, resourceSignals: importmapGame, pipelines: { composers: 0, postProcessing: 0, nodesVisited: 5, truncated: false } });
    expect(buildVerdicts(ev).p1).toMatchObject({ answer: "no", basis: "module" });
    expect(buildVerdicts(ev).p3).toMatchObject({ answer: "no", basis: "module" });
  });

  it("P-3: an observed WebGPURenderer (inlined r186 webgpu build, e.g. HEATSINK) blocks a module-level 'no'", () => {
    const v = buildVerdicts(evidence({
      renderers: [{ kind: "WebGPURenderer" }],
      resourceSignals: importmapGame,
      pipelines: { composers: 0, postProcessing: 0, nodesVisited: 5, truncated: false }
    }));
    expect(v.p3.answer).toBe("inconclusive");
    expect(v.p1.value).toMatchObject({ webgpuRendererObserved: true });
  });

  it("P-3: a truncated or failed pipeline walk cannot prove absence", () => {
    const base = evidence({ resourceSignals: importmapGame });
    expect(buildVerdicts({ ...base, pipelines: { composers: 0, postProcessing: 0, nodesVisited: 30000, truncated: true } }).p3.answer).toBe("inconclusive");
    expect(buildVerdicts({ ...base, pipelines: { composers: 0, postProcessing: 0, nodesVisited: 0, truncated: true, failed: true } }).p3.answer).toBe("inconclusive");
    expect(buildVerdicts({ ...base, pipelines: undefined }).p3.answer).toBe("inconclusive");
  });

  it("P-3: inlined bundle with no live instance is inconclusive, not 'no'", () => {
    const v = buildVerdicts(evidence({ resourceSignals: { ...importmapGame, threeCoreLoaded: false }, pipelines: { composers: 0, postProcessing: 0, nodesVisited: 5, truncated: false } }));
    expect(v.p3.answer).toBe("inconclusive");
  });
});


// ── R-25: start-control choice, settle criteria, in-page listing ────────────

const ctl = (index: number, text: string, extra: Partial<Control> = {}): Control => ({
  index, tag: "button", text, id: "", cls: "", role: "", cursor: "pointer", x: 100, y: 100, w: 160, h: 44, disabled: false, ...extra
});

describe("chooseStartControl (R-25)", () => {
  it("picks Roadster Hours' 'Drive <route>' over the other menu entries", () => {
    const menu = [
      ctl(0, "Routes & tuning — 3 routes · 9.3 km of road and air"),
      ctl(1, "Records"),
      ctl(2, "Upgrades"),
      ctl(3, "Vehicle studio"),
      ctl(4, "Sound"),
      ctl(5, "Drive Sunbreak Coast", { w: 240, h: 56 })
    ];
    expect(chooseStartControl(menu)?.text).toBe("Drive Sunbreak Coast");
  });

  it("prefers an exact 'Tap to start' (100) over a verb button (80) over a contains match (50)", () => {
    expect(startScore(ctl(0, "Tap to start", { tag: "div", cursor: "default" }))).toBe(100);
    expect(startScore(ctl(0, "Play Chapter One"))).toBe(80);
    expect(startScore(ctl(0, "Ready to ride"))).toBe(50);
    expect(chooseStartControl([ctl(0, "Ready to ride"), ctl(1, "Play Chapter One"), ctl(2, "Tap to start", { tag: "div" })])?.index).toBe(2);
  });

  it("never picks menu-only or disabled controls, or non-interactive text", () => {
    expect(startScore(ctl(0, "Play sound"))).toBe(0);
    expect(startScore(ctl(0, "Start over settings"))).toBe(0);
    expect(startScore(ctl(0, "Drive Sunbreak Coast", { disabled: true }))).toBe(0);
    expect(startScore(ctl(0, "Drive Sunbreak Coast", { tag: "div", cursor: "default", role: "" }))).toBe(0);
    expect(startScore(ctl(0, "Drive ".padEnd(80, "x")))).toBe(0);
    expect(chooseStartControl([ctl(0, "Records"), ctl(1, "Sound")])).toBeNull();
  });

  it("skips already-tried controls and breaks ties by size", () => {
    const a = ctl(0, "Drive Alpha", { w: 100, h: 40 });
    const b = ctl(1, "Drive Beta", { w: 300, h: 60 });
    expect(chooseStartControl([a, b])?.index).toBe(1);
    expect(chooseStartControl([a, b], new Set([1]))?.index).toBe(0);
    expect(chooseStartControl([a, b], new Set([0, 1]))).toBeNull();
  });
});

describe("settleStatus (R-25)", () => {
  const opts = { settleMs: 4000, strictPct: 0.03, plateauMs: 15000, plateauPct: 0.08 };
  const series = (counts: readonly number[], stepMs: number, calls = 1): Sample[] =>
    counts.map((objects, i) => ({ t: i * stepMs, objects, renderCalls: calls + i * 5 }));

  it("is not settled with no scene, a one-object root, or too short a window", () => {
    expect(settleStatus([], opts).settled).toBe(false);
    expect(settleStatus([{ t: 0, objects: 1, renderCalls: 1 }], opts).settled).toBe(false);
    expect(settleStatus(series([500, 500, 500], 500), opts).settled).toBe(false);
  });

  it("settles strictly when the count holds within 3% for settleMs", () => {
    const r = settleStatus(series(Array(12).fill(494).map((n, i) => n + (i % 2)), 500), opts);
    expect(r).toMatchObject({ settled: true, criterion: "strict" });
  });

  it("does not settle while the count is still growing", () => {
    expect(settleStatus(series([100, 400, 900, 1500, 2300, 3200, 4200, 5300, 6500, 7800], 500), opts).settled).toBe(false);
  });

  it("settles by plateau for a streaming world that churns beyond 3% but stays within 8% of its max", () => {
    const counts = Array.from({ length: 40 }, (_, i) => 10000 + (i % 2 ? 0 : -600));
    const r = settleStatus(series(counts, 500), opts);
    expect(r).toMatchObject({ settled: true, criterion: "plateau" });
  });

  it("does not call a stalled page settled: plateau requires the renderer to keep drawing", () => {
    const counts = Array.from({ length: 40 }, (_, i) => 10000 + (i % 2 ? 0 : -600));
    const stalled = counts.map((objects, i) => ({ t: i * 500, objects, renderCalls: 7 }));
    expect(settleStatus(stalled, opts).settled).toBe(false);
  });

  it("does not plateau-settle a wide swing", () => {
    const counts = Array.from({ length: 40 }, (_, i) => (i % 2 ? 10000 : 6000));
    expect(settleStatus(series(counts, 500), opts).settled).toBe(false);
  });
});

describe("downsample (R-25)", () => {
  it("keeps first and last and caps the length", () => {
    const xs = Array.from({ length: 1000 }, (_, i) => i);
    const out = downsample(xs, 50);
    expect(out).toHaveLength(50);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(999);
    expect(downsample([1, 2, 3], 50)).toEqual([1, 2, 3]);
  });
});

describe("LIST_CONTROLS_SOURCE / SAMPLE_SOURCE (R-25)", () => {
  const el = (tag: string, text: string, style: Record<string, string> = {}, rect = { left: 10, top: 10, width: 120, height: 40 }) => {
    const attrs: Record<string, string> = {};
    return {
      tagName: tag.toUpperCase(), innerText: text, textContent: text, id: "", type: "", disabled: false, shadowRoot: null,
      __style: { visibility: "visible", display: "block", opacity: "1", cursor: "default", ...style },
      getAttribute: (k: string) => attrs[k] ?? null,
      setAttribute: (k: string, v: string) => { attrs[k] = v; },
      hasAttribute: (k: string) => k in attrs,
      getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }),
      attrs
    };
  };
  const listIn = (nodes: ReturnType<typeof el>[]): Control[] => {
    const win = makeWindow();
    (win.document as Record<string, unknown>).querySelectorAll = () => nodes;
    win.innerWidth = 800;
    win.innerHeight = 450;
    win.getComputedStyle = (n: { __style: unknown }) => n.__style;
    return vm.runInContext(LIST_CONTROLS_SOURCE, win);
  };

  it("lists only visible, in-viewport, interactive elements and tags them with their index", () => {
    const drive = el("button", "Drive Sunbreak Coast");
    const hidden = el("button", "Hidden", { display: "none" });
    const offscreen = el("button", "Off", {}, { left: 5000, top: 10, width: 50, height: 20 });
    const plainDiv = el("div", "Just text");
    const pointerDiv = el("div", "Tap to start", { cursor: "pointer" });
    const script = el("script", "x = 1");
    const list = listIn([drive, hidden, offscreen, plainDiv, pointerDiv, script]);
    expect(list.map((c) => c.text)).toEqual(["Drive Sunbreak Coast", "Tap to start"]);
    expect(list[0]).toMatchObject({ index: 0, tag: "button", w: 120, h: 40 });
    expect(drive.attrs["data-a3d-ctl"]).toBe("0");
    expect(pointerDiv.attrs["data-a3d-ctl"]).toBe("1");
    // An exact "Tap to start" outranks a verb button; with only the menu entry present, Drive wins.
    expect(chooseStartControl(list)?.text).toBe("Tap to start");
    expect(chooseStartControl([list[0]])?.text).toBe("Drive Sunbreak Coast");
  });

  it("SAMPLE_SOURCE counts scene objects and sums render calls from the hook", () => {
    const win = makeWindow();
    const renderer = new WebGLRenderer();
    observe(win, renderer);
    const leaf = () => ({ children: [] as unknown[] });
    const scene = new Scene();
    scene.children = [{ children: [leaf(), leaf()] }, leaf()];
    for (let i = 0; i < 7; i++) renderer.render(scene);
    const sample = vm.runInContext(SAMPLE_SOURCE, win);
    expect(sample).toMatchObject({ objects: 5, renderCalls: 7, scenes: 1, renderers: 1 });
    expect(vm.runInContext(SAMPLE_SOURCE, makeWindow())).toMatchObject({ objects: 0, renderCalls: 0, scenes: 0 });
  });

  it("GAME_STATE_SOURCE reads the harness __getGameState and lists window.__* hooks; tolerates a throwing hook", () => {
    const win = makeWindow();
    win.__getGameState = () => ({ phase: "racing", lap: 1 });
    win.__other = 1;
    const out = vm.runInContext(GAME_STATE_SOURCE, win);
    expect(out.hooks).toEqual(expect.arrayContaining(["__getGameState", "__other"]));
    expect(JSON.parse(out.state)).toEqual({ phase: "racing", lap: 1 });
    const bad = makeWindow();
    bad.__getGameState = () => { throw new Error("boom"); };
    expect(vm.runInContext(GAME_STATE_SOURCE, bad).error).toContain("boom");
    expect(vm.runInContext(GAME_STATE_SOURCE, makeWindow()).state).toBeUndefined();
  });
});
