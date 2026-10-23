/**
 * In-page sources for the Crayon probe. Plain JS strings (NOT stringified TS
 * functions) so tsx/esbuild `keepNames` helpers cannot leak into the page, and
 * so the unit tests can run the exact same source in a `vm` context.
 *
 * HOOK_SOURCE — installed before any game script runs (Playwright
 *   `context.addInitScript`, which is `Page.addScriptToEvaluateOnNewDocument`
 *   auto-attached into every frame, including the sandboxed `about:srcdoc`
 *   game iframe). It defines `window.__THREE_DEVTOOLS__`, the event bus three.js
 *   itself dispatches `observe` on from the `Scene`, `WebGLRenderer` and
 *   `WebGPURenderer` constructors (verified in three 0.185.1 `three.core.js`,
 *   `three.core.min.js`, `three.module.min.js`, `three.webgpu.js`). That hands
 *   us the LIVE Scene and renderer objects regardless of importmap vs inlined
 *   bundle, module copies, or minification. No `import("three")`, no
 *   `Runtime.queryObjects` prototype matching (which silently returns 0 when the
 *   prototype comes from a different module record than the game's).
 *
 * SCAN_SOURCE — an expression evaluated in the same frame after boot. Returns
 *   a JSON-safe census of the captured scenes, a bounded own-data-property walk
 *   for EffectComposer / PostProcessing, renderer render stats, and
 *   resource-timing module signals.
 */

export const HOOK_SOURCE = String.raw`(function () {
  if (typeof window === "undefined" || window.__a3dHook) return;
  var hook = {
    installedAt: Date.now(),
    scenes: [],
    renderedScenes: [],
    renderers: [],
    registers: [],
    observed: 0,
    canvasContexts: { webgl: 0, webgl2: 0, webgpu: 0, "2d": 0, other: 0 },
    errors: []
  };
  var seenScenes = new WeakSet();
  var seenRenderers = new WeakSet();
  var renderedSeen = new WeakSet();

  function addScene(s) {
    if (!s || seenScenes.has(s)) return;
    seenScenes.add(s);
    hook.scenes.push(s);
  }
  function markRendered(s) {
    addScene(s);
    if (renderedSeen.has(s)) return;
    renderedSeen.add(s);
    hook.renderedScenes.push(s);
  }
  function addRenderer(r) {
    if (!r || seenRenderers.has(r)) return;
    seenRenderers.add(r);
    var info = {
      ref: r,
      kind: r.isWebGPURenderer ? "WebGPURenderer" : r.isWebGLRenderer ? "WebGLRenderer" : (r.constructor && r.constructor.name) || "Renderer",
      renderCalls: 0,
      targetSets: 0,
      nonNullTargetSets: 0
    };
    hook.renderers.push(info);
    function wrapRender(name) {
      try {
        var orig = r[name];
        if (typeof orig !== "function") return;
        r[name] = function (scene) {
          info.renderCalls++;
          if (scene && scene.isScene) markRendered(scene);
          return orig.apply(this, arguments);
        };
      } catch (e) { hook.errors.push("wrap:" + name + ":" + String(e).slice(0, 80)); }
    }
    wrapRender("render");
    wrapRender("renderAsync");
    try {
      var origSet = r.setRenderTarget;
      if (typeof origSet === "function") {
        r.setRenderTarget = function (target) {
          info.targetSets++;
          if (target) info.nonNullTargetSets++;
          return origSet.apply(this, arguments);
        };
      }
    } catch (e) { hook.errors.push("wrap:setRenderTarget:" + String(e).slice(0, 80)); }
  }

  var bus = window.__THREE_DEVTOOLS__;
  if (!bus || typeof bus.addEventListener !== "function") {
    bus = new EventTarget();
    try {
      Object.defineProperty(window, "__THREE_DEVTOOLS__", { value: bus, configurable: true, writable: true });
    } catch (e) {
      window.__THREE_DEVTOOLS__ = bus;
    }
  }
  bus.addEventListener("observe", function (e) {
    try {
      var d = e && e.detail;
      if (!d || typeof d !== "object") return;
      hook.observed++;
      if (d.isScene) addScene(d);
      else if (d.isWebGLRenderer || d.isWebGPURenderer || d.isRenderer) addRenderer(d);
    } catch (err) { hook.errors.push("observe:" + String(err).slice(0, 80)); }
  });
  bus.addEventListener("register", function (e) {
    try {
      var d = e && e.detail;
      hook.registers.push(d && (d.revision || d.REVISION) ? String(d.revision || d.REVISION) : null);
    } catch (err) { /* ignore */ }
  });

  try {
    if (typeof HTMLCanvasElement !== "undefined" && HTMLCanvasElement.prototype.getContext) {
      var origGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type) {
        var ctx = origGetContext.apply(this, arguments);
        if (ctx) {
          var k = type === "webgl" || type === "experimental-webgl" ? "webgl" : type;
          if (hook.canvasContexts[k] === undefined) k = "other";
          hook.canvasContexts[k]++;
        }
        return ctx;
      };
    }
  } catch (e) { hook.errors.push("getContext:" + String(e).slice(0, 80)); }

  window.__a3dHook = hook;
})();`;

export const SCAN_SOURCE = String.raw`(function () {
  var hook = window.__a3dHook;
  if (!hook) return { hookInstalled: false };

  function ctorName(o) {
    try { return (o && o.constructor && o.constructor.name) || "?"; } catch (e) { return "?"; }
  }
  function bump(map, key) { map[key] = (map[key] || 0) + 1; }
  function isNodeMaterial(m) {
    return !!m && (m.isNodeMaterial === true || /NodeMaterial$/.test(ctorName(m)));
  }

  function census(scenes) {
    var c = {
      scenes: scenes.length,
      objects: 0, meshes: 0, instancedMeshes: 0, batchedMeshes: 0, skinnedMeshes: 0,
      points: 0, lines: 0, sprites: 0,
      shaderMaterials: 0, rawShaderMaterials: 0,
      nodeMaterialClasses: 0, nodeMaterialsAuthored: 0,
      materials: 0,
      materialCtorCounts: {}, objectCtorCounts: {}, nodeMaterialSlots: {}
    };
    var seen = new Set();
    var stack = [];
    for (var i = 0; i < scenes.length; i++) stack.push(scenes[i]);
    function visitMaterial(m) {
      if (!m || typeof m !== "object" || seen.has(m)) return;
      seen.add(m);
      c.materials++;
      bump(c.materialCtorCounts, ctorName(m));
      if (m.isShaderMaterial) c.shaderMaterials++;
      if (m.isRawShaderMaterial) c.rawShaderMaterials++;
      if (isNodeMaterial(m)) {
        c.nodeMaterialClasses++;
        var slots = ["fragmentNode", "colorNode", "positionNode", "vertexNode", "emissiveNode", "normalNode", "opacityNode"];
        var authored = false;
        for (var s = 0; s < slots.length; s++) {
          var v;
          try { v = m[slots[s]]; } catch (e) { v = null; }
          if (v != null) {
            bump(c.nodeMaterialSlots, slots[s]);
            if (slots[s] === "fragmentNode" || slots[s] === "colorNode" || slots[s] === "positionNode") authored = true;
          }
        }
        if (authored) c.nodeMaterialsAuthored++;
      }
    }
    while (stack.length) {
      var o = stack.pop();
      if (!o || typeof o !== "object" || seen.has(o)) continue;
      seen.add(o);
      c.objects++;
      bump(c.objectCtorCounts, ctorName(o));
      if (o.isMesh) c.meshes++;
      if (o.isInstancedMesh) c.instancedMeshes++;
      if (o.isBatchedMesh) c.batchedMeshes++;
      if (o.isSkinnedMesh) c.skinnedMeshes++;
      if (o.isPoints) c.points++;
      if (o.isLine) c.lines++;
      if (o.isSprite) c.sprites++;
      var mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (var j = 0; j < mats.length; j++) visitMaterial(mats[j]);
      if (o.overrideMaterial) visitMaterial(o.overrideMaterial);
      var kids = o.children;
      if (kids && kids.length) for (var k = 0; k < kids.length; k++) stack.push(kids[k]);
    }
    return c;
  }

  var SKIP_KEYS = { window: 1, self: 1, top: 1, parent: 1, frames: 1, document: 1, globalThis: 1, opener: 1, location: 1, navigator: 1, performance: 1, __a3dHook: 1, __THREE_DEVTOOLS__: 1 };
  function isHeavyOrDom(o) {
    try {
      if (o === window) return true;
      if (o.window === o) return true;
      if (typeof o.nodeType === "number") return true;
      if (o.isObject3D || o.isTexture || o.isBufferGeometry || o.isMaterial || o.isWebGLRenderTarget) return true;
      if (ArrayBuffer.isView(o) || o instanceof ArrayBuffer) return true;
      return false;
    } catch (e) {
      return true; /* cross-origin Window or throwing proxy: never descend */
    }
  }
  function describePasses(o) {
    var out = [];
    try {
      var arr = Array.isArray(o.passes) ? o.passes : [];
      for (var i = 0; i < arr.length && out.length < 24; i++) out.push(ctorName(arr[i]));
    } catch (e) { /* ignore */ }
    return out;
  }
  function walkPipelines(roots, maxNodes, maxDepth) {
    var res = { composers: 0, postProcessing: 0, composerPasses: [], nodesVisited: 0, truncated: false, roots: 0, errors: 0 };
    var seen = new Set();
    var queue = [];
    for (var i = 0; i < roots.length; i++) {
      if (roots[i] && typeof roots[i] === "object") { queue.push({ o: roots[i], d: 0 }); res.roots++; }
    }
    var head = 0;
    while (head < queue.length) {
      var item = queue[head++];
      var o = item.o;
      if (seen.has(o)) continue;
      seen.add(o);
      if (res.nodesVisited >= maxNodes) { res.truncated = true; break; }
      res.nodesVisited++;
      try {
        var name = ctorName(o);
        if (o.isEffectComposer === true || name === "EffectComposer" || (Array.isArray(o.passes) && o.renderer && (o.renderTarget1 || o.renderTarget2))) {
          res.composers++;
          res.composerPasses.push(describePasses(o));
        } else if (o.isPostProcessing === true || name === "PostProcessing" || name === "RenderPipeline") {
          res.postProcessing++;
        }
      } catch (e) { res.errors++; continue; }
      if (item.d >= maxDepth) continue;
      var keys;
      try { keys = Object.getOwnPropertyNames(o); } catch (e) { continue; }
      for (var k = 0; k < keys.length && k < 200; k++) {
        if (SKIP_KEYS[keys[k]] === 1) continue;
        var desc;
        try { desc = Object.getOwnPropertyDescriptor(o, keys[k]); } catch (e) { continue; }
        if (!desc || !("value" in desc)) continue;
        var v = desc.value;
        if (!v || typeof v !== "object" || seen.has(v) || isHeavyOrDom(v)) continue;
        queue.push({ o: v, d: item.d + 1 });
      }
    }
    return res;
  }

  var scanErrors = [];
  var scenes = hook.scenes.slice();
  var traversal = null;
  var rendered = null;
  try { traversal = census(scenes); } catch (e) { scanErrors.push("census:" + String(e).slice(0, 120)); }
  try { rendered = census(hook.renderedScenes.slice()); } catch (e) { scanErrors.push("rendered:" + String(e).slice(0, 120)); }

  var roots = [];
  var wnames = [];
  try { wnames = Object.getOwnPropertyNames(window); } catch (e) { wnames = []; }
  for (var w = 0; w < wnames.length; w++) {
    var wn = wnames[w];
    if (SKIP_KEYS[wn] === 1) continue;
    var wd;
    try { wd = Object.getOwnPropertyDescriptor(window, wn); } catch (e) { continue; }
    if (!wd || !("value" in wd)) continue;
    var wv = wd.value;
    if (!wv || typeof wv !== "object" || isHeavyOrDom(wv)) continue;
    roots.push(wv);
  }
  for (var r = 0; r < hook.renderers.length; r++) roots.push(hook.renderers[r].ref);
  var pipelines = null;
  try { pipelines = walkPipelines(roots, 30000, 4); } catch (e) {
    scanErrors.push("pipelines:" + String(e).slice(0, 120));
    pipelines = { composers: 0, postProcessing: 0, composerPasses: [], nodesVisited: 0, truncated: true, roots: 0, errors: 1, failed: true };
  }

  var resources = [];
  try {
    var entries = performance.getEntriesByType("resource");
    for (var e = 0; e < entries.length; e++) resources.push(entries[e].name);
  } catch (err) { resources = []; }
  function anyMatch(re) {
    var hits = [];
    for (var i = 0; i < resources.length; i++) if (re.test(resources[i])) hits.push(resources[i].slice(0, 160));
    return hits.slice(0, 8);
  }
  var resourceSignals = {
    threeCoreLoaded: anyMatch(/three(\.core|\.module)?(\.min)?\.js|\/three@/i).length > 0,
    webgpuBuild: anyMatch(/three\.webgpu|three\.tsl|three\/webgpu|three\/tsl/i),
    effectComposerModule: anyMatch(/postprocessing\/EffectComposer/i),
    composerModule: anyMatch(/postprocessing\/(EffectComposer|RenderPass|ShaderPass|UnrealBloomPass|OutputPass)/i),
    passModules: anyMatch(/postprocessing\/[A-Za-z0-9]+Pass\.js/i),
    resourceCount: resources.length
  };

  var im = null;
  try {
    var node = document.querySelector('script[type="importmap"]');
    im = node ? (node.textContent || "") : null;
  } catch (err) { im = null; }

  var renderers = [];
  for (var q = 0; q < hook.renderers.length; q++) {
    var ri = hook.renderers[q];
    renderers.push({ kind: ri.kind, renderCalls: ri.renderCalls, targetSets: ri.targetSets, nonNullTargetSets: ri.nonNullTargetSets });
  }

  var canvases = [];
  try {
    var cs = document.querySelectorAll("canvas");
    for (var ci = 0; ci < cs.length; ci++) canvases.push({ w: cs[ci].width, h: cs[ci].height, engine: cs[ci].getAttribute("data-engine") });
  } catch (err) { canvases = []; }

  return {
    hookInstalled: true,
    title: (function () { try { return document.title; } catch (e) { return null; } })(),
    revisions: hook.registers.filter(function (x) { return !!x; }),
    threeGlobal: typeof window.__THREE__ !== "undefined" ? String(window.__THREE__) : null,
    observed: hook.observed,
    scenes: scenes.length,
    renderedScenes: hook.renderedScenes.length,
    renderers: renderers,
    canvasContexts: hook.canvasContexts,
    canvases: canvases,
    traversal: traversal,
    renderedTraversal: rendered,
    pipelines: pipelines,
    resourceSignals: resourceSignals,
    importmap: im ? im.slice(0, 2000) : null,
    importmapHasWebgpu: !!im && /three\/webgpu|three\.webgpu|three\/tsl/i.test(im),
    hookErrors: hook.errors.slice(0, 10),
    scanErrors: scanErrors
  };
})()`;

/** Cheap object count across captured scenes; used to detect when a game has finished populating. */
export const OBJECT_COUNT_SOURCE = String.raw`(function () {
  var h = window.__a3dHook;
  if (!h) return null;
  var seen = new Set();
  var stack = h.scenes.slice();
  var n = 0;
  while (stack.length && n < 400000) {
    var o = stack.pop();
    if (!o || typeof o !== "object" || seen.has(o)) continue;
    seen.add(o);
    n++;
    var k = o.children;
    if (k && k.length) for (var i = 0; i < k.length; i++) stack.push(k[i]);
  }
  return n;
})()`;

/** Frame-side best-effort "Tap to start" click; returns the matched label or null. */
export const CLICK_START_SOURCE = String.raw`(function () {
  try {
    var re = /^\s*(tap to start|click to start|press to start|start( game)?|play( now)?|tap to play|begin)\s*[.!]?\s*$/i;
    var nodes = document.querySelectorAll("button, [role=button], a, div, span, p");
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var t = (n.innerText || n.textContent || "").trim();
      if (t.length > 24 || !re.test(t)) continue;
      var r = n.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      n.click();
      return t;
    }
  } catch (e) { /* ignore */ }
  return null;
})()`;

/**
 * R-25: visible interactive controls in the frame (incl. open shadow roots), each tagged
 * `data-a3d-ctl=<index>` so the probe can click it with a real pointer event via a locator.
 * Returns plain objects matching `Control` in startControl.ts.
 */
export const LIST_CONTROLS_SOURCE = String.raw`(function () {
  var out = [];
  var vw = window.innerWidth || 0, vh = window.innerHeight || 0;
  function visit(root) {
    var nodes;
    try { nodes = root.querySelectorAll("*"); } catch (e) { return; }
    for (var i = 0; i < nodes.length && out.length < 120; i++) {
      var n = nodes[i];
      if (n.shadowRoot) visit(n.shadowRoot);
      var tag = (n.tagName || "").toLowerCase();
      if (tag === "script" || tag === "style" || tag === "canvas" || tag === "html" || tag === "body") continue;
      var cs;
      try { cs = window.getComputedStyle(n); } catch (e) { continue; }
      if (!cs || cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
      var role = n.getAttribute ? (n.getAttribute("role") || "") : "";
      var buttonish = tag === "button" || tag === "a" || tag === "summary" || (tag === "input" && /button|submit/i.test(n.type || "")) || role === "button" || (n.hasAttribute && n.hasAttribute("onclick")) || cs.cursor === "pointer";
      if (!buttonish) continue;
      var r = n.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
      var text = ((n.innerText || n.textContent || n.value || "") + "").replace(/\s+/g, " ").trim();
      var idx = out.length;
      try { n.setAttribute("data-a3d-ctl", String(idx)); } catch (e) { /* ignore */ }
      out.push({
        index: idx, tag: tag, text: text.slice(0, 80), id: (n.id || "").slice(0, 60), cls: ((n.getAttribute && n.getAttribute("class")) || "").slice(0, 80),
        role: role, cursor: cs.cursor, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
        w: Math.round(r.width), h: Math.round(r.height), disabled: !!n.disabled || (n.getAttribute && n.getAttribute("aria-disabled") === "true")
      });
    }
  }
  try { visit(document); } catch (e) { /* ignore */ }
  return out;
})()`;

/** Renderer progress for the settle check: total object count plus summed render calls. */
export const SAMPLE_SOURCE = String.raw`(function () {
  var h = window.__a3dHook;
  if (!h) return null;
  var calls = 0;
  for (var i = 0; i < h.renderers.length; i++) calls += h.renderers[i].renderCalls;
  var seen = new Set();
  var stack = h.scenes.slice();
  var n = 0;
  while (stack.length && n < 400000) {
    var o = stack.pop();
    if (!o || typeof o !== "object" || seen.has(o)) continue;
    seen.add(o);
    n++;
    var k = o.children;
    if (k && k.length) for (var j = 0; j < k.length; j++) stack.push(k[j]);
  }
  return { objects: n, renderCalls: calls, scenes: h.scenes.length, renderers: h.renderers.length };
})()`;

/** The PlayLabs harness' own state hook (`__getGameState`) and the `window.__*` hooks it exposes, if any. */
export const GAME_STATE_SOURCE = String.raw`(function () {
  var out = {};
  try {
    out.hooks = Object.keys(window).filter(function (k) { return /^__/.test(k); }).slice(0, 30);
    if (typeof window.__getGameState === "function") out.state = JSON.stringify(window.__getGameState()).slice(0, 600);
  } catch (e) { out.error = String(e).slice(0, 100); }
  return out;
})()`;
