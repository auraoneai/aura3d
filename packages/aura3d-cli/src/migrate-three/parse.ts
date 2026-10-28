/**
 * PRD-15 T6.1 — source scanner for `aura3d migrate three`.
 *
 * Line-oriented extraction of Three.js constructs: `new THREE.X(...)`,
 * `new X(...)` for imported names, `IDENT.load(url)` for loaders, and
 * `from "three"`-family import specifiers. Produces the construct list the
 * emitter and report walk.
 */

export interface ThreeConstruct {
  /** Three.js symbol or operation name, e.g. "Scene", "GLTFLoader.load". */
  readonly construct: string;
  /** 1-based source line where the construct occurs. */
  readonly line: number;
  /** Constructor-call argument source, trimmed ("" for non-ctor matches). */
  readonly args: string;
  /** Untrimmed argument source exactly as written (constructor matches only), for exact-text rewrites. */
  readonly rawArgs?: string;
  /** Import specifier when the construct is an import ("three", "three/addons/…"). */
  readonly specifier?: string;
}

const NEW_OPEN = /\bnew\s+(THREE\.)?([A-Za-z0-9_]+)\s*\(/g;

interface NewCall {
  readonly name: string;
  readonly three: boolean;
  readonly line: number;
  readonly rawArgs: string;
}

/**
 * Index of the `)` that closes the `(` at `open`, or -1 when unbalanced.
 * Parens inside strings, template literals and comments are ignored. The
 * argument list may span lines and nest to any depth, so a pretty-printed
 * `new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p), 8), m)`
 * is captured whole instead of being skipped. Regex literals are not
 * recognised (a paren inside one would unbalance the scan).
 */
export function matchingParen(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    } else if (ch === '"' || ch === "'") {
      for (i++; i < source.length && source[i] !== ch; i++) if (source[i] === "\\") i++;
    } else if (ch === "`") {
      for (i++; i < source.length && source[i] !== "`"; i++) if (source[i] === "\\") i++;
    } else if (ch === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
    } else if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end < 0) return -1;
      i = end + 1;
    }
  }
  return -1;
}

/** Every `new X(...)` / `new THREE.X(...)` call in the source, nested calls included. */
function scanNewCalls(source: string): NewCall[] {
  const calls: NewCall[] = [];
  const lineStarts: number[] = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (index: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((lineStarts[mid] ?? 0) <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  for (const m of source.matchAll(NEW_OPEN)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const close = matchingParen(source, open);
    if (close < 0) continue;
    calls.push({ name: m[2] ?? "", three: m[1] !== undefined, line: lineOf(m.index ?? 0), rawArgs: source.slice(open + 1, close) });
  }
  return calls;
}
const LOADER_LOAD = /\b([A-Za-z0-9_]+)\.load\s*\(/g;
const LOADER_DECL = /\b(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*new\s+(?:THREE\.)?([A-Za-z0-9_]+)/g;
const THREE_IMPORT = /\bfrom\s+["'](three(?:\/[^"']*)?)["']/g;
// SC-04: `VRButton.createButton(renderer)` / `ARButton.createButton(renderer)` and the `renderer.xr.*` WebXRManager surface.
const XR_BUTTON = /\b(VRButton|ARButton)\.createButton\s*\(/g;
const WEBXR_MANAGER = /\b[A-Za-z_$][\w$]*\.xr\.(?:enabled|setSession|setReferenceSpaceType|setFramebufferScaleFactor|getController|getControllerGrip|getHand|isPresenting)\b/;

// SG-10 (P2): `scene.overrideMaterial = material` — a property write, so it is detected here, not by `new X(`.
const OVERRIDE_MATERIAL_WRITE = /\b([A-Za-z_$][\w$]*)\.overrideMaterial\s*=(?!=)/g;

const LOADER_NAMES = new Set([
  "GLTFLoader",
  "RGBELoader",
  "TextureLoader",
  "CubeTextureLoader",
  "EXRLoader",
  "AudioLoader",
  "FileLoader",
  "ImageBitmapLoader",
  "DataTextureLoader",
  "FontLoader",
  "FBXLoader",
  "MMDLoader",
  "PLYLoader",
  "STLLoader",
  "USDZLoader",
  "ThreeMFLoader",
  "VOXLoader",
  "ColladaLoader",
  "TDSLoader",
  "AMFLoader",
  "IFCLoader"
]);

export function parseThreeSource(source: string): ThreeConstruct[] {
  const constructs: ThreeConstruct[] = [];
  const lines = source.split("\n");
  const seenLoaderTypes = new Set<string>();
  const callsByLine = new Map<number, NewCall[]>();
  for (const call of scanNewCalls(source)) {
    if (call.three) seenLoaderTypes.add(call.name);
    const bucket = callsByLine.get(call.line);
    if (bucket) bucket.push(call);
    else callsByLine.set(call.line, [call]);
  }
  // variable → loader type so `loader.load(...)` resolves to `GLTFLoader.load`
  const varTypes = new Map<string, string>();
  for (const m of source.matchAll(LOADER_DECL)) varTypes.set(m[1] ?? "", m[2] ?? "");

  lines.forEach((text, index) => {
    const line = index + 1;

    for (const m of text.matchAll(THREE_IMPORT)) {
      constructs.push({ construct: "import", line, args: "", specifier: m[1] });
    }
    const lineCalls = callsByLine.get(line) ?? [];
    for (const call of lineCalls) {
      if (call.three) constructs.push({ construct: call.name, line, args: call.rawArgs.trim(), rawArgs: call.rawArgs });
    }
    for (const call of lineCalls) {
      // dedup with the THREE.-prefixed pass above: Euler already captured there
      if (call.name === "Euler" && !call.three) constructs.push({ construct: "Euler", line, args: call.rawArgs.trim(), rawArgs: call.rawArgs });
    }
    for (const m of text.matchAll(LOADER_LOAD)) {
      const name = m[1] ?? "";
      const resolved = varTypes.get(name) ?? (LOADER_NAMES.has(name) ? name : undefined);
      // only real loader types qualify — `mat.load()` must not become
      // `ShaderMaterial.load` just because `mat` was a `new`.
      if (resolved && LOADER_NAMES.has(resolved)) constructs.push({ construct: `${resolved}.load`, line, args: "" });
    }
    for (const m of text.matchAll(OVERRIDE_MATERIAL_WRITE)) {
      const name = m[1] ?? "";
      // Only a Scene qualifies: `mat.overrideMaterial = …` on an arbitrary object is not three's scene API.
      if (varTypes.get(name) === "Scene" || name === "scene") constructs.push({ construct: "Scene.overrideMaterial", line, args: "" });
    }
    for (const m of text.matchAll(XR_BUTTON)) constructs.push({ construct: `${m[1]}.createButton`, line, args: "" });
    if (WEBXR_MANAGER.test(text)) constructs.push({ construct: "WebXRManager", line, args: "" });
    // bare `new X(...)` for names a bare-THREE import could declare
    for (const call of lineCalls) {
      if (call.three || seenLoaderTypes.has(call.name)) continue;
      constructs.push({ construct: call.name, line, args: call.rawArgs.trim(), rawArgs: call.rawArgs, specifier: "bare" });
    }
  });

  return constructs;
}
