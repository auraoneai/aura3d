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
  /** Import specifier when the construct is an import ("three", "three/addons/…"). */
  readonly specifier?: string;
}

// Args allow ONE level of nested parens so `new THREE.InstancedMesh(new
// THREE.BoxGeometry(...), mat, n)` and `new UnrealBloomPass(new THREE.Vector2
// (...), s, r, t)` capture the full argument list instead of truncating at the
// first `)` and leaving dangling args behind.
const ARGS_ONE_NEST = "([^()]*(?:\\([^()]*\\)[^()]*)*)";
const NEW_THREE = new RegExp(`\\bnew\\s+THREE\\.([A-Za-z0-9_]+)\\s*\\(${ARGS_ONE_NEST}\\)`, "g");
const NEW_BARE = new RegExp(`\\bnew\\s+([A-Za-z0-9_]+)\\s*\\(${ARGS_ONE_NEST}\\)`, "g");
const EULER_ORDER = new RegExp(`\\bnew\\s+(?:THREE\\.)?Euler\\s*\\(${ARGS_ONE_NEST}\\)`, "g");
const LOADER_LOAD = /\b([A-Za-z0-9_]+)\.load\s*\(/g;
const LOADER_DECL = /\b(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*new\s+(?:THREE\.)?([A-Za-z0-9_]+)/g;
const THREE_IMPORT = /\bfrom\s+["'](three(?:\/[^"']*)?)["']/g;

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
  for (const m of source.matchAll(NEW_THREE)) seenLoaderTypes.add(m[1] ?? "");
  // variable → loader type so `loader.load(...)` resolves to `GLTFLoader.load`
  const varTypes = new Map<string, string>();
  for (const m of source.matchAll(LOADER_DECL)) varTypes.set(m[1] ?? "", m[2] ?? "");

  lines.forEach((text, index) => {
    const line = index + 1;

    for (const m of text.matchAll(THREE_IMPORT)) {
      constructs.push({ construct: "import", line, args: "", specifier: m[1] });
    }
    for (const m of text.matchAll(NEW_THREE)) {
      constructs.push({ construct: m[1] ?? "", line, args: (m[2] ?? "").trim() });
    }
    for (const m of text.matchAll(EULER_ORDER)) {
      // dedup with NEW_THREE: Euler already captured above if THREE.-prefixed
      if (!text.slice(0, m.index).endsWith("THREE.")) {
        constructs.push({ construct: "Euler", line, args: (m[1] ?? "").trim() });
      }
    }
    for (const m of text.matchAll(LOADER_LOAD)) {
      const name = m[1] ?? "";
      const resolved = varTypes.get(name) ?? (LOADER_NAMES.has(name) ? name : undefined);
      // only real loader types qualify — `mat.load()` must not become
      // `ShaderMaterial.load` just because `mat` was a `new`.
      if (resolved && LOADER_NAMES.has(resolved)) constructs.push({ construct: `${resolved}.load`, line, args: "" });
    }
    // bare `new X(...)` for names a bare-THREE import could declare
    for (const m of text.matchAll(NEW_BARE)) {
      const name = m[1] ?? "";
      if (seenLoaderTypes.has(name)) continue;
      constructs.push({ construct: name, line, args: (m[2] ?? "").trim(), specifier: "bare" });
    }
  });

  return constructs;
}
