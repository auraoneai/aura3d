#!/usr/bin/env node
// Generates docs/agents/api-signatures.md (answer-first signature tables for the roots agents look up most)
// and docs/agents/recipes-src/signature-examples.check.ts (the same example lines, type-checked by tsc)
// from the real `@aura3d/engine` root entry using the TypeScript checker, so the tables cannot drift.
// Usage: node tools/docs/gen-api-signatures.mjs [--write]   (no flag: fail when the files are stale)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENTRY = path.join(ROOT, "packages/engine/src/public/index.ts");
const OUT = path.join(ROOT, "docs/agents/api-signatures.md");
const CHECK_OUT = path.join(ROOT, "docs/agents/recipes-src/signature-examples.check.ts");

// root -> [one working example line, what it is]. Written to the check file verbatim, so each one compiles.
const ROOTS = [
  { name: "createAuraApp", returnLabel: "app", returnPick: ["onFrame", "ready", "nodes", "setScene", "pause", "resume", "screenshot", "atmosphere", "effects", "camera", "input", "diagnostics", "dispose"], example: 'const app = createAuraApp("#app", { scene: scene({ background: "#101418" }) });', note: "Mounts the scene, owns renderer, resize, loop and disposal. `await app.ready()` before the first frame is judged." },
  { name: "scene", returnLabel: "scene()", returnPick: ["add", "addMany", "camera", "background", "timeline", "physics", "diagnostics"], example: 'const stage = scene({ background: "#101418" }).add(primitives.box({ name: "crate" })).camera(camera.perspective({ position: [3, 2, 5], target: [0, 0.5, 0], fov: 45 }));', note: "Builder: `.add(node)` one node or builder at a time, `.camera(spec)`, `.background(color)`." },
  { name: "camera", pick: ["frame", "frameScene", "framePose", "worldBounds", "orbit", "perspective", "frameAsset"], example: 'void camera.frame(primitives.box({ name: "subject" }), { fill: 0.6 });', note: "`camera.frame(subject | subjects | bounds, { fill, angle, azimuth, elevation, padding, fov, aspect })` returns an orbit camera spec placed so the subject fills `fill` (default 0.6) of the limiting frame axis; `camera.frameScene(scene)` frames a whole scene (ground planes ignored); `camera.framePose(...)` returns the pose for `app.camera.setPose` on resize; `camera.worldBounds(subject)` returns the `{ min, max }` box it frames. Solved for `aspect` (default 16/9)." },
  { name: "looks", example: 'void looks.preset("product-studio");', note: "Genre look presets: environment, key light, fog and grade in one unit. Spread `looks.appOptions(id)` into `createAuraApp` options. HDRI-backed presets load `/hdri/<file>.hdr` from `public/hdri/`; a missing file degrades to a procedural probe, logs one `LOOK_HDRI_MISSING` console error and lists it in `app.diagnostics().warnings`. `looks.heroStage({ target, radius, background })` is studio IBL + key/fill/rim + a floor that fades into `background`; `looks.heroRig` is the lights alone; `looks.fogForExtent({ extent })` sizes fog by distance. A scene with NO look, light, environment or effect gets the hero stage automatically at mount (any authored look/light/environment/effect, or a scene kit, turns it off; `?a3d-cold-start-look=0` forces it off)." },
  { name: "material", example: 'void material.pbr({ color: "#c8ccd4", metallic: 0.9, roughness: 0.38 });', note: "Colours are CSS strings (`#rgb`, `#rrggbbaa`, `rgb()`, `hsl()`, `oklch()`, names); an invalid value throws `COLOR_INVALID` naming the option. Metals need an environment." },
  { name: "lights", example: 'void lights.directional({ position: [4, 6, 3], target: [0, 0, 0], intensity: 3, shadow: true });', note: "Intensities are not three.js-calibrated; judge a capture." },
  { name: "environments", example: 'void environments.neutral({ intensity: 0.8, background: false });', note: "Image-based light. Without one, authored lights render flat and metals render dark." },
  { name: "sky", example: 'void sky.preetham({ sun: { elevationDeg: 35, azimuthDeg: 120 } });', note: "Procedural sky; `app.atmosphere?.setSky({ sun })` moves the sun live." },
  { name: "primitives", example: 'void primitives.cylinder({ name: "plinth", size: [2, 0.9, 2], material: material.pbr({ color: "#f7f8fa" }) });', note: "Unit shapes scaled by `size` (sphere = diameter, plane = `[w, 1, d]`)." },
  { name: "effects", example: 'void effects.bloom({ intensity: 0.7, threshold: 0.75, radius: 0.55 });', note: "Post effects, fog and particle emitters as scene nodes." },
  { name: "instances", example: 'void instances.cone({ name: "pines", transforms: [{ position: [0, 1, 0], scale: [2, 3, 2] }], colors: ["#2f6b34"], material: material.pbr({ color: "#ffffff" }) });', note: "One draw call per node. Instance colour multiplies the material colour." },
  { name: "points", example: 'void points({ positions: new Float32Array([0, 0, 0, 1, 1, 1]), colors: new Uint8Array(8).fill(255), size: 2 });', note: "Static cloud. `Float32Array` positions + packed `Uint8Array`/`Uint32Array`/`Float32Array` colors stay typed (no per-point objects, no color parsing). Live clouds: `points.stream` + `pointStreamOf(handle)` (docs/agents/streaming-buffers.md)." },
  { name: "pointStreamOf", example: 'void pointStreamOf;', note: "Narrows `app.nodes.require(id)` of a `points.stream({ capacity, colors?, runtime: { id } })` node to `{ write, lease, setDrawCount, drawCount, capacity, stats }`; typed in-place updates, one dirty-range upload." },
  { name: "geometry", example: 'void geometry.define({ positions: new Float32Array(9), indices: [0, 1, 2], bounds: { min: [0, 0, 0], max: [1, 1, 1] } });', note: "`define` builds the spec; mount it with `geometry.custom(spec, { material })`." },
  { name: "interactions", example: 'void interactions.orbit({ target: "crate" });', note: "`target` is a node name." },
  { name: "physics", pick: ["world", "worldFromScene", "body", "collider", "box", "sphere", "capsule", "plane", "step", "constraint", "raycast"], example: 'void physics.box;', note: "Rapier-backed worlds, bodies and colliders; see `docs/api/` physics pages before use. Needs `npm install @dimforge/rapier3d-compat@0.20.0` (optional peer; once installed, every app that imports the engine loads its 1.08 MB gzip chunk at startup unless it is built with `aura3d()` from `@aura3d/assets/vite`, which leaves Rapier out of apps that never mention physics, or `aura3d({ physics: \"lazy\" })`, which downloads it on first use (then `await app.physics.ready?.()` before imperative calls); see `docs/concepts/physics.md`): without it you get the typed `PHYSICS_BACKEND_MISSING` error (`error.code`, `error.installCommand`) in `diagnostics().errors`, on the canvas, from `app.physics`, from `preloadPhysics()`, and from `aura3d doctor`. Working example: recipe 16 (`recipes-src/physics-basics`)." },
  { name: "AnimationController", pick: ["play", "pause", "resume", "restart", "stop", "crossFade", "setLayerWeight", "update", "scrub", "listClips", "registerClip", "on", "once", "state", "dispose"], example: 'void AnimationController;', note: "Clip playback and crossfades for rigged GLBs. Procedural joints are runtime handles instead (recipe 8)." },
  { name: "createSpatialPicker", example: 'const picker = createSpatialPicker({ nodes: [] });', note: "CPU picking for `points` (nearest to the ray within a pixel or world tolerance) and instanced nodes (per-instance box or sphere). `picker.pick({ camera, ndc }, { viewport, pixelRadius })`; `picker.invalidate(name)` after writing a position or matrix buffer in place. `bindSpatialPicking` adds hover and click." },
  { name: "createFixedStepLoop", example: 'void createFixedStepLoop({ stepSeconds: 1 / 60, step: () => undefined, render: () => undefined });', note: "Deterministic simulation loop for games." }
];

// Defaults read from packages/engine/src/agent-api/nodes/lights.ts (the types do not carry them).
const DEFAULTS = [
  ["lights.ambient", "intensity 0.28, color #ffffff"],
  ["lights.hemisphere", "skyColor #bcd7ff, intensity 1, position [0, 1, 0]"],
  ["lights.directional", "position [3, 4, 3], intensity 1.5, color #ffffff"],
  ["lights.point", "position [2, 2.5, 1.5], intensity 8, color #ffffff"],
  ["lights.spot", "position [0, 4, 0], angle pi/6, penumbra 0.4, distance 12, intensity 30"]
];

function loadProgram() {
  const cfg = ts.readConfigFile(path.join(ROOT, "tsconfig.base.json"), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);
  return ts.createProgram([ENTRY], { ...parsed.options, noEmit: true, skipLibCheck: true, types: [] });
}

const FLAGS = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope | ts.TypeFormatFlags.WriteArrowStyleSignature;
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");

function typeText(checker, type, node) {
  return checker.typeToString(type, node, FLAGS).replace(/\s+/g, " ");
}

function optionsOf(checker, paramType, node) {
  const t = checker.getNonNullableType(paramType);
  if (!(t.flags & ts.TypeFlags.Object) && !t.isIntersection()) return "";
  if (checker.isArrayType(t) || checker.isTupleType(t)) return "";
  const props = checker.getPropertiesOfType(t).filter((p) => !/^_/.test(p.name));
  if (props.length === 0 || props.length > 60) return "";
  const fns = props.filter((p) => checker.getTypeOfSymbolAtLocation(p, node).getCallSignatures().length > 0).length;
  if (fns * 2 > props.length) return ""; // a controller or handle object, not an options bag
  const parts = props.map((p) => {
    const pt = checker.getTypeOfSymbolAtLocation(p, node);
    const optional = p.flags & ts.SymbolFlags.Optional ? "?" : "";
    return `${p.name}${optional}: ${clip(typeText(checker, pt, node), 26)}`;
  });
  return clip(parts.join("; "), 520);
}

function describe(checker, sym, node, label) {
  const type = checker.getTypeOfSymbolAtLocation(sym, node);
  const sigs = type.getCallSignatures();
  if (sigs.length === 0) return null;
  const sig = sigs[0];
  const params = sig.getParameters().map((p) => {
    const pt = checker.getTypeOfSymbolAtLocation(p, node);
    const optional = p.flags & ts.SymbolFlags.Optional || (p.valueDeclaration && ts.isParameter(p.valueDeclaration) && p.valueDeclaration.initializer) ? "?" : "";
    const text = typeText(checker, pt, node);
    return { name: p.name, optional, text: text.startsWith("{") || text.length > 70 ? "{…}" : text, options: optionsOf(checker, pt, node) };
  });
  const ret = clip(typeText(checker, sig.getReturnType(), node), 70);
  const call = `${label}(${params.map((p) => `${p.name}${p.optional}: ${p.text}`).join(", ")})`;
  const withOptions = params.find((p) => p.options);
  return { call: clip(call, 150), ret, options: withOptions ? `${withOptions.name}: ${withOptions.options}` : "", overloads: sigs.length };
}

export function collect() {
  const program = loadProgram();
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(ENTRY);
  const mod = checker.getSymbolAtLocation(sf);
  const exportsByName = new Map(checker.getExportsOfModule(mod).map((s) => [s.name, s]));
  const sections = [];
  for (const root of ROOTS) {
    const sym0 = exportsByName.get(root.name);
    if (!sym0) throw new Error(`root export ${root.name} is missing`);
    const sym = sym0.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym0) : sym0;
    const decl = sym.declarations?.[0] ?? sf;
    const type = checker.getTypeOfSymbolAtLocation(sym, decl);
    const rows = [];
    if (sym.flags & ts.SymbolFlags.Class) {
      const inst = checker.getDeclaredTypeOfSymbol(sym);
      for (const m of checker.getPropertiesOfType(inst)) {
        if (/^_|^#/.test(m.name)) continue;
        const d = describe(checker, m, decl, `${root.name}#${m.name}`);
        if (d) rows.push({ member: m.name, ...d });
      }
    } else if (type.getCallSignatures().length > 0 && type.getProperties().length === 0) {
      const d = describe(checker, sym, decl, root.name);
      if (d) rows.push({ member: root.name, ...d });
    } else {
      const members = type.getProperties().filter((m) => !root.pick || root.pick.includes(m.name));
      for (const m of members) {
        const d = describe(checker, m, decl, `${root.name}.${m.name}`);
        if (d) rows.push({ member: m.name, ...d });
        else rows.push({ member: m.name, call: `${root.name}.${m.name}`, ret: "value", options: "", overloads: 0 });
      }
      const direct = type.getCallSignatures().length > 0 ? describe(checker, sym, decl, root.name) : null;
      if (direct) rows.unshift({ member: root.name, ...direct });
    }
    if (sym.flags & ts.SymbolFlags.Class) {
      const keep = root.pick ? rows.filter((r) => root.pick.includes(r.member)) : rows;
      rows.length = 0;
      rows.push(...keep);
    }
    if (root.returnPick) {
      const callSig = type.getCallSignatures()[0];
      const retType = callSig.getReturnType();
      for (const name of root.returnPick) {
        const m = checker.getPropertyOfType(retType, name);
        if (!m) throw new Error(`${root.name} return type has no member ${name}`);
        const d = describe(checker, m, decl, `${root.returnLabel}.${name}`);
        rows.push(d ? { member: name, ...d } : { member: name, call: `${root.returnLabel}.${name}`, ret: clip(typeText(checker, checker.getTypeOfSymbolAtLocation(m, decl), decl), 70), options: "", overloads: 0 });
      }
    }
    sections.push({ ...root, rows });
  }
  return sections;
}

export function render(sections) {
  const out = [];
  out.push("# API signatures (answer-first)");
  out.push("");
  out.push("Generated by `node tools/docs/gen-api-signatures.mjs --write` from the real `@aura3d/engine` root types (`packages/engine/src/public/index.ts`). Do not edit by hand: without `--write` the same command fails when this file is stale. Read this instead of opening `node_modules/@aura3d/engine` type files; every example line is type-checked in [`recipes-src/signature-examples.check.ts`](recipes-src/signature-examples.check.ts). The complete export list is [`docs/api/root-exports.md`](../api/root-exports.md); this page covers the roots agents look up most.");
  out.push("");
  out.push("Columns: Call (parameters, `?` = optional), Returns, Options (the keys of the first options object, `?` = optional). Colours are CSS strings, vectors are `[x, y, z]` tuples, angles are radians unless the name says `Deg`.");
  out.push("");
  out.push("Defaults the types do not carry (read from `agent-api/nodes/lights.ts`):");
  out.push("");
  out.push("| Call | Defaults |");
  out.push("|---|---|");
  for (const [k, v] of DEFAULTS) out.push(`| \`${k}\` | ${v} |`);
  out.push("");
  for (const s of sections) {
    out.push(`## \`${s.name}\``);
    out.push("");
    out.push(s.note);
    out.push("");
    out.push("```ts");
    out.push(s.example);
    out.push("```");
    out.push("");
    out.push("| Call | Returns | Options |");
    out.push("|---|---|---|");
    const seenOptions = new Map();
    for (const r of s.rows) {
      if (r.options && seenOptions.has(r.options)) r.options = `same as \`${seenOptions.get(r.options)}\``;
      else if (r.options) seenOptions.set(r.options, r.call.split("(")[0]);
    }
    for (const r of s.rows) out.push(`| \`${cell(r.call)}\`${r.overloads > 1 ? ` (+${r.overloads - 1} overloads)` : ""} | \`${cell(r.ret)}\` | ${r.options ? cell(r.options) : ""} |`);
    out.push("");
  }
  return `${out.join("\n")}\n`;
}

export function renderCheckFile() {
  // Import every ROOTS name so a newly added root's example compiles without a hand-edited import list.
  const base = ["AnimationController", "camera", "createAuraApp", "createFixedStepLoop", "effects", "environments", "geometry", "instances", "interactions", "lights", "looks", "material", "physics", "primitives", "scene", "sky"];
  const names = [...new Set([...base, ...ROOTS.map((r) => r.name)])].sort((a, b) => a.localeCompare(b, "en"));
  const lines = [
    "// GENERATED by tools/docs/gen-api-signatures.mjs from its ROOTS table: the example line of each root in docs/agents/api-signatures.md.",
    "// Compiled by `pnpm exec tsc -p docs/agents/recipes-src/tsconfig.json`; nothing here runs.",
    `import { ${names.join(", ")} } from "@aura3d/engine";`,
    ""
  ];
  ROOTS.forEach((r, i) => {
    lines.push(`// ${r.name}`);
    lines.push(`{ ${r.example.replace(/^const (\w+) =/, (_m, n) => `const ${n}${i} =`)} }`);
  });
  lines.push(`void [${names.join(", ")}];`);
  return `${lines.join("\n")}\n`;
}

const write = process.argv.includes("--write");
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sections = collect();
  const md = render(sections);
  const check = renderCheckFile();
  if (write) {
    writeFileSync(OUT, md);
    writeFileSync(CHECK_OUT, check);
    console.log(`wrote ${path.relative(ROOT, OUT)} (${md.length} bytes) and ${path.relative(ROOT, CHECK_OUT)}`);
  } else {
    const stale = [];
    if (!existsSync(OUT) || readFileSync(OUT, "utf8") !== md) stale.push(path.relative(ROOT, OUT));
    if (!existsSync(CHECK_OUT) || readFileSync(CHECK_OUT, "utf8") !== check) stale.push(path.relative(ROOT, CHECK_OUT));
    if (stale.length > 0) {
      console.error(`FAIL stale: ${stale.join(", ")}\nFix: node tools/docs/gen-api-signatures.mjs --write`);
      process.exit(1);
    }
    console.log("ok: api-signatures.md is current");
  }
}
