/**
 * PRD-15 T6.1 — emitter for `aura3d migrate three`.
 *
 * Rewrites `from "three"` imports to the engine imports the emitted calls
 * need, replaces each mapped `new THREE.X(...)` with its factory call, and
 * inserts `// TODO(a3d-migrate)` comments above every unmapped construct so
 * the output fails noisily instead of silently producing wrong code.
 *
 * threejs-parity (lane L10):
 * - `mapping: "pending"` rows name a frozen/reserved target that is not yet
 *   public — the construct is left untouched with a `parityPending` comment.
 * - `emit: "comment"` rows report a mapping but emit a TODO comment instead
 *   of a call (the target is configuration, not a call site).
 * - `emit: "new"` rows emit `new Target(...)` for class targets.
 * - EMIT_ARGS emits real option objects for constructs whose args map
 *   honestly; anything else keeps the `map args (...)` TODO inline.
 * - Addon import specifiers with no named-export target are dropped into
 *   `a3d:` guidance comments (never rewritten into a broken named import).
 */

import { threeMappingFor, type ThreeMapping } from "./mappings.js";
import { matchingParen, parseThreeSource, type ThreeConstruct } from "./parse.js";

export interface MigrateRow {
  readonly construct: string;
  readonly line: number;
  readonly mapping: "exact" | "approximate" | "none" | "pending";
  readonly note: string;
}

export interface MigrateResult {
  readonly code: string;
  readonly rows: readonly MigrateRow[];
  readonly rewrittenConstructs: number;
}

const UNSAFE_BARE_NAME = /^(?:Error|Map|Set|Promise|RegExp|Date|Number|String|Boolean|Array|Object)$/;
const ENGINE_ROOT = "@aura3d/engine";

// ── Addon import specifiers ────────────────────────────────────────────────
// Each entry lists the bare addon path tail; both `three/addons/<tail>` and
// `three/examples/jsm/<tail>` match. `to` rewrites the specifier; `note`
// drops the import into an `a3d:` guidance comment.

type AddonImportAction =
  | { readonly kind: "rewrite"; readonly to: string }
  | { readonly kind: "comment"; readonly note: string }
  | { readonly kind: "excluded"; readonly note: string };

const CONTROLS_SUBPATH = "@aura3d/engine/controls";

const ADDON_IMPORT_ACTIONS: Readonly<Record<string, AddonImportAction>> = {
  // SC-02: controls classes are named exports of @aura3d/engine/controls.
  "controls/OrbitControls.js": { kind: "rewrite", to: CONTROLS_SUBPATH },
  "controls/MapControls.js": { kind: "rewrite", to: CONTROLS_SUBPATH },
  "controls/TrackballControls.js": { kind: "rewrite", to: CONTROLS_SUBPATH },
  "controls/ArcballControls.js": { kind: "rewrite", to: CONTROLS_SUBPATH },
  "controls/FlyControls.js": { kind: "rewrite", to: CONTROLS_SUBPATH },
  "controls/FirstPersonControls.js": { kind: "rewrite", to: CONTROLS_SUBPATH },
  "controls/PointerLockControls.js": { kind: "rewrite", to: CONTROLS_SUBPATH },
  "controls/DragControls.js": { kind: "rewrite", to: CONTROLS_SUBPATH },
  "controls/TransformControls.js": { kind: "rewrite", to: CONTROLS_SUBPATH },
  "loaders/GLTFLoader.js": { kind: "rewrite", to: ENGINE_ROOT },
  "loaders/RGBELoader.js": { kind: "comment", note: "RGBELoader + PMREMGenerator collapses into environments.hdri({ texture: assets.<hdrKey> }); register the .hdr via `aura3d assets add`." },
  "environments/RoomEnvironment.js": { kind: "comment", note: "RoomEnvironment maps to environments.neutral() (generated room probe)." },
  "postprocessing/EffectComposer.js": { kind: "comment", note: "no composer object: the scene renders through the v2 post graph — express passes as effects.* scene nodes or app.addPostPass for custom GLSL." },
  "postprocessing/RenderPass.js": { kind: "comment", note: "the base render pass is implicit — carry scene+camera into createAuraApp; no pass object is needed." },
  "postprocessing/UnrealBloomPass.js": { kind: "comment", note: "UnrealBloomPass constructs rewrite to effects.bloom() — drop the import." },
  "postprocessing/BloomPass.js": { kind: "comment", note: "BloomPass constructs rewrite to effects.bloom() — drop the import." },
  "postprocessing/SMAAPass.js": { kind: "comment", note: "SMAAPass constructs rewrite to effects.antiAlias({}) — fxaa is the live mode (no smaa mode); drop the import." },
  "postprocessing/TAARenderPass.js": { kind: "comment", note: "TAARenderPass constructs rewrite to effects.antiAlias({ mode: \"taa\" }) — drop the import." },
  "postprocessing/SSAARenderPass.js": { kind: "comment", note: "SSAARenderPass constructs rewrite to effects.antiAlias({}) — MSAA is a framebuffer mode (createAuraApp antialias), not a post mode; drop the import." },
  "postprocessing/BokehPass.js": { kind: "comment", note: "BokehPass constructs rewrite to effects.depthOfField() — drop the import." },
  "postprocessing/SSAOPass.js": { kind: "comment", note: "SSAOPass constructs rewrite to effects.ambientOcclusion() — drop the import." },
  "postprocessing/SAOPass.js": { kind: "comment", note: "SAOPass constructs rewrite to effects.ambientOcclusion() — drop the import." },
  "postprocessing/GTAOPass.js": { kind: "comment", note: "GTAOPass constructs rewrite to effects.ambientOcclusion() — drop the import." },
  "postprocessing/SSRPass.js": { kind: "comment", note: "SSRPass constructs rewrite to effects.screenSpaceReflections() — drop the import." },
  "postprocessing/OutlinePass.js": { kind: "comment", note: "OutlinePass constructs rewrite to effects.outline() — drop the import." },
  "postprocessing/FilmPass.js": { kind: "comment", note: "FilmPass constructs rewrite to effects.filmGrain() — drop the import." },
  "postprocessing/LUTPass.js": { kind: "comment", note: "LUTPass constructs rewrite to effects.colorGrade({ lut }) — drop the import." },
  "postprocessing/OutputPass.js": { kind: "comment", note: "the output stage is built in — configure it via createAuraApp({ output }) / app.setOutput; no pass object is needed." },
  "postprocessing/ShaderPass.js": { kind: "comment", note: "a GLSL ShaderPass maps to app.addPostPass({ name, insertAt, fragment: { glsl } }) — real GPU path today; effects.shaderPass lands with lane L1 (SH-03)." },
  "csm/CSM.js": { kind: "comment", note: "CSM collapses into lights.directional({ shadow: { cascades } }) — CascadedShadowMaps is wired in ShadowOrchestration (AD-12)." },
  // AD-04 deliberate exclusions.
  "loaders/FBXLoader.js": { kind: "excluded", note: "FBX is excluded (AD-04): convert to GLB offline and load via model(assets.<key>)." },
  "loaders/MMDLoader.js": { kind: "excluded", note: "MMD is excluded (AD-04): convert to GLB offline." },
  "loaders/PLYLoader.js": { kind: "excluded", note: "PLY is excluded (AD-04): convert to GLB offline." },
  "loaders/STLLoader.js": { kind: "excluded", note: "STL is excluded (AD-04): convert to GLB offline." },
  "loaders/USDZLoader.js": { kind: "excluded", note: "USDZ is excluded (AD-04): convert to GLB offline." },
  "loaders/3MFLoader.js": { kind: "excluded", note: "3MF is excluded (AD-04): convert to GLB offline." },
  "loaders/VOXLoader.js": { kind: "excluded", note: "VOX is excluded (AD-04): convert to GLB offline." },
  "loaders/ColladaLoader.js": { kind: "excluded", note: "Collada is excluded (AD-04): convert to GLB offline." },
  "loaders/TDSLoader.js": { kind: "excluded", note: "3DS is excluded (AD-04): convert to GLB offline." },
  "loaders/AMFLoader.js": { kind: "excluded", note: "AMF is excluded (AD-04): convert to GLB offline." },
  "loaders/IFCLoader.js": { kind: "excluded", note: "IFC is excluded (AD-04): convert to GLB offline." },
  // AD-05 deliberate exclusions.
  "exporters/GLTFExporter.js": { kind: "excluded", note: "exporters are excluded (AD-05): bake offline with gltf-transform/three in a build step." },
  "exporters/OBJExporter.js": { kind: "excluded", note: "exporters are excluded (AD-05): bake offline." },
  "exporters/PLYExporter.js": { kind: "excluded", note: "exporters are excluded (AD-05): bake offline." },
  "exporters/STLExporter.js": { kind: "excluded", note: "exporters are excluded (AD-05): bake offline." },
  "exporters/USDZExporter.js": { kind: "excluded", note: "exporters are excluded (AD-05): bake offline." },
  "exporters/DRACOExporter.js": { kind: "excluded", note: "exporters are excluded (AD-05): bake offline." },
  "exporters/ColladaExporter.js": { kind: "excluded", note: "exporters are excluded (AD-05): bake offline." }
};

function addonActionFor(specifier: string): AddonImportAction | undefined {
  const tail = specifier.startsWith("three/addons/")
    ? specifier.slice("three/addons/".length)
    : specifier.startsWith("three/examples/jsm/")
      ? specifier.slice("three/examples/jsm/".length)
      : undefined;
  return tail === undefined ? undefined : ADDON_IMPORT_ACTIONS[tail];
}

// ── Honest argument emitters ───────────────────────────────────────────────
// When the source args map cleanly onto the target's options, emit real
// option objects. `null` falls back to the `map args` TODO inline comment.

interface EmitArgsResult {
  /** The emitted expression (full call/new text). */
  readonly call: string;
  /** Optional `a3d:` guidance comment appended after the call. */
  readonly comment?: string;
}

type EmitArgs = (args: string) => EmitArgsResult | null;

const NUM = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;

function splitArgs(args: string): string[] {
  // Top-level comma split — enough for numeric/simple literal arg lists.
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of args) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim() !== "") out.push(cur);
  return out.map((s) => s.trim());
}

const numExpr = (raw: string): string | null => (NUM.test(raw) ? raw : null);

/** `2 * <expr>` folded to a literal when possible. */
const times2 = (expr: string): string => (NUM.test(expr) ? String(2 * Number(expr)) : `2 * (${expr})`);

/** `<a> / <b>` folded to a literal when both numeric. */
const div = (a: string, b: string): string =>
  NUM.test(a) && NUM.test(b) && Number(b) !== 0 ? String(Number(a) / Number(b)) : `(${a}) / (${b})`;

const hex = (raw: string): string | null => {
  // 0xRRGGBB → "#rrggbb"; "#rrggbb" / quoted strings pass through as strings.
  const m = /^0x([0-9a-fA-F]{1,8})$/.exec(raw.trim());
  if (m) return `"#${m[1].padStart(6, "0")}"`;
  if (/^["']#?[0-9a-zA-Z]+["']$/.test(raw.trim())) return raw.trim().replace(/^'|'$/g, '"');
  return null;
};

function specPairs(_construct: string, entries: readonly (readonly [string, string | undefined])[]): EmitArgsResult | null {
  const fields = entries.filter((e): e is [string, string] => e[1] !== undefined);
  if (fields.length === 0) return null;
  return { call: `{ ${fields.map(([k, v]) => `${k}: ${v}`).join(", ")} }` };
}

function mapColorArg(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  return hex(raw) ?? raw;
}

function mapPerspectiveCamera(args: string, target: string): EmitArgsResult | null {
  const a = splitArgs(args);
  const fov = a[0] !== undefined && a[0] !== "" ? a[0] : undefined;
  const near = a[2];
  const far = a[3];
  const spec = specPairs("PerspectiveCamera", [["fov", fov], ["near", near], ["far", far]]);
  if (!spec) return null;
  const aspect = a[1];
  return {
    call: `${target}(${spec.call})`,
    comment: aspect !== undefined && aspect !== "" ? `a3d: aspect ${aspect} — the renderer derives aspect from the viewport` : undefined
  };
}

function mapOrthographicCamera(args: string, target: string): EmitArgsResult | null {
  const a = splitArgs(args);
  const [left, right, top, bottom, near, far] = a;
  const sizeExpr = top !== undefined && bottom !== undefined ? div(`${top} - ${bottom}`, "2") : undefined;
  const spec = specPairs("OrthographicCamera", [["orthographicSize", sizeExpr], ["near", near], ["far", far]]);
  if (!spec) return null;
  return {
    call: `${target}(${spec.call})`,
    comment: left !== undefined && right !== undefined ? `a3d: left ${left}/right ${right} fold into the square frustum (orthographicSize); viewport aspect widens it` : undefined
  };
}

function mapGeometryArgs(construct: string, target: string): EmitArgs {
  return (args) => {
    const a = splitArgs(args);
    const n = (i: number) => a[i];
    switch (construct) {
      case "BoxGeometry": {
        if (a.length === 0) return { call: `${target}()` };
        const size = `[${n(0) ?? "1"}, ${n(1) ?? "1"}, ${n(2) ?? "1"}]`;
        return { call: `${target}({ size: ${size} })` };
      }
      case "SphereGeometry": {
        const r = n(0);
        if (r === undefined) return { call: `${target}()` };
        const params: [string, string | undefined][] = [["widthSegments", n(1)], ["heightSegments", n(2)]];
        const p = specPairs(construct, params);
        return { call: `${target}({ size: ${times2(r)}${p ? `, params: ${p.call}` : ""} })` };
      }
      case "CylinderGeometry": {
        if (a.length === 0) return { call: `${target}()` };
        const [rT, rB, h] = a;
        if (rT === undefined || rB === undefined) return null;
        const xy = rB;
        const radiusTop = NUM.test(rT) && NUM.test(rB) ? String(Number(rT) / (2 * Number(rB))) : div(rT, `2 * (${rB})`);
        const p = specPairs(construct, [
          ["radiusTop", radiusTop],
          ["radialSegments", n(3)],
          ["heightSegments", n(4)],
          ["openEnded", n(5) === "true" ? "true" : n(5) === "false" ? "false" : undefined]
        ]);
        return { call: `${target}({ size: [${times2(xy)}, ${h ?? "1"}, ${times2(xy)}]${p ? `, params: ${p.call}` : ""} })` };
      }
      case "PlaneGeometry": {
        if (a.length === 0) return { call: `${target}()` };
        const [w, h] = a;
        const p = specPairs(construct, [["widthSegments", n(2)], ["heightSegments", n(3)]]);
        return {
          call: `${target}({ size: [${w ?? "1"}, 1, ${h ?? w ?? "1"}]${p ? `, params: ${p.call}` : ""} })`,
          comment: "a3d: three's PlaneGeometry faces +Z (XY); Aura's plane lies in XZ — rotate the node -90° about X for an XY wall"
        };
      }
      case "CapsuleGeometry": {
        const r = n(0);
        if (r === undefined) return { call: `${target}()` };
        const len = n(1) ?? "0";
        const p = specPairs(construct, [["capSegments", n(2)], ["radialSegments", n(3)]]);
        const height = NUM.test(len) && NUM.test(r) ? String(Number(len) + 2 * Number(r)) : `(${len}) + 2 * (${r})`;
        return { call: `${target}({ size: [${times2(r)}, ${height}, ${times2(r)}]${p ? `, params: ${p.call}` : ""} })` };
      }
      case "TorusGeometry": {
        const r = n(0);
        if (r === undefined) return { call: `${target}()` };
        const scale = `${r} / 0.43`;
        const p = specPairs(construct, [
          ["tube", n(1) !== undefined ? `${n(1)} / (${scale})` : undefined],
          ["tubularSegments", n(2)],
          ["radialSegments", n(3)]
        ]);
        return { call: `${target}({ size: ${scale}${p ? `, params: ${p.call}` : ""} })` };
      }
      default:
        return null;
    }
  };
}

function mapStandardMaterialArgs(target: string, extra: readonly (readonly [string, string])[] = []): EmitArgs {
  return (args) => {
    const trimmed = args.trim();
    if (trimmed === "") return { call: `${target}(${extra.length > 0 ? `{ ${extra.map(([k, v]) => `${k}: ${v}`).join(", ")} }` : ""})` };
    if (!trimmed.startsWith("{")) {
      const color = hex(trimmed);
      if (color) {
        const inner = [`color: ${color}`, ...extra.map(([k, v]) => `${k}: ${v}`)].join(", ");
        return { call: `${target}({ ${inner} })` };
      }
      return null;
    }
    const body = trimmed.slice(1, trimmed.lastIndexOf("}") >= 0 ? trimmed.lastIndexOf("}") : trimmed.length).trim();
    if (body === "") {
      return { call: `${target}(${extra.length > 0 ? `{ ${extra.map(([k, v]) => `${k}: ${v}`).join(", ")} }` : "{}"})` };
    }
    const fields: string[] = extra.map(([k, v]) => `${k}: ${v}`);
    const dropped: string[] = [];
    const passthrough = new Set(["roughness", "metalness", "metallic", "opacity", "transparent", "emissiveIntensity", "envMapIntensity", "clearcoat", "clearcoatRoughness", "transmission", "ior", "sheen", "flatShading", "side", "alphaTest"]);
    for (const part of splitArgs(body)) {
      const colon = part.indexOf(":");
      if (colon < 0) {
        dropped.push(part);
        continue;
      }
      const key = part.slice(0, colon).trim().replace(/^["']|["']$/g, "");
      const value = part.slice(colon + 1).trim();
      if (key === "color" || key === "emissive" || key === "specularColor" || key === "sheenColor") {
        const mapped = hex(value);
        if (mapped) fields.push(`${key}: ${mapped}`);
        else dropped.push(`${key}: ${value}`);
      } else if (key === "metalness") {
        fields.push(`metallic: ${value}`);
      } else if (passthrough.has(key)) {
        fields.push(`${key}: ${value}`);
      } else {
        dropped.push(`${key}: ${value}`);
      }
    }
    if (fields.length === 0) return null;
    return {
      call: `${target}({ ${fields.join(", ")} })`,
      comment: dropped.length > 0 ? `a3d: unmapped material keys — ${dropped.join("; ")}` : undefined
    };
  };
}

function mapLightArgs(construct: string, target: string): EmitArgs {
  return (args) => {
    const a = splitArgs(args);
    switch (construct) {
      case "DirectionalLight":
      case "AmbientLight": {
        const spec = specPairs(construct, [["color", mapColorArg(a[0])], ["intensity", a[1]]]);
        return spec ? { call: `${target}(${spec.call})` } : { call: `${target}()` };
      }
      case "PointLight": {
        const spec = specPairs(construct, [["color", mapColorArg(a[0])], ["intensity", a[1]], ["distance", a[2]], ["decay", a[3]]]);
        return spec ? { call: `${target}(${spec.call})` } : { call: `${target}()` };
      }
      case "SpotLight": {
        const spec = specPairs(construct, [["color", mapColorArg(a[0])], ["intensity", a[1]], ["distance", a[2]], ["angle", a[3]], ["penumbra", a[4]], ["decay", a[5]]]);
        return spec ? { call: `${target}(${spec.call})` } : { call: `${target}()` };
      }
      case "HemisphereLight": {
        const spec = specPairs(construct, [["color", mapColorArg(a[0])], ["intensity", a[2]]]);
        if (!spec) return { call: `${target}()` };
        return {
          call: `${target}(${spec.call})`,
          comment: a[1] !== undefined ? `a3d: hemisphere ground tint ${a[1]} has no slot — pick the dominant tint` : undefined
        };
      }
      default:
        return null;
    }
  };
}

function mapPostPassArgs(construct: string, target: string): EmitArgs {
  return (args) => {
    const a = splitArgs(args);
    switch (construct) {
      case "UnrealBloomPass": {
        const spec = specPairs(construct, [["intensity", a[1]], ["radius", a[2]], ["threshold", a[3]]]);
        return {
          call: `${target}(${spec?.call ?? "{}"})`,
          comment: "a3d: the resolution arg is dropped — the post graph sizes passes to the render target"
        };
      }
      case "SMAAPass":
        return {
          call: `${target}({})`,
          comment: `a3d: SMAA has no native mode — antiAlias mode is "fxaa" (default) | "taa" | "off"; smaa is not implemented on the live path`
        };
      case "TAARenderPass":
        return { call: `${target}({ mode: "taa" })` };
      case "SSAARenderPass":
        return {
          call: `${target}({})`,
          comment: `a3d: supersampling is not a post mode — MSAA lives at the framebuffer (createAuraApp antialias: "msaa" | "msaa-plus-high-dpi"); post modes are fxaa/taa`
        };
      case "SSAOPass":
      case "SAOPass":
      case "GTAOPass":
        // three args are (scene, camera, w, h[, params]) — none map to AO
        // options; the post graph binds scene/camera and sizes passes itself.
        return {
          call: `${target}({})`,
          comment: "a3d: the (scene, camera, size) args are dropped — the post graph owns them; tune effects.ambientOcclusion intensity/radius"
        };
      case "Fog": {
        const spec = specPairs(construct, [["color", mapColorArg(a[0])]]);
        return {
          call: `${target}(${spec?.call ?? "{}"})`,
          comment: a[1] !== undefined || a[2] !== undefined ? `a3d: near ${a[1] ?? "…"}/far ${a[2] ?? "…"} linear fog — Aura fog is density/height based; retune into density` : undefined
        };
      }
      case "FogExp2": {
        const spec = specPairs(construct, [["color", mapColorArg(a[0])], ["density", a[1]]]);
        return { call: `${target}(${spec?.call ?? "{}"})` };
      }
      case "InstancedMesh": {
        const count = a[2];
        const geoMatch = a[0]?.match(/\b(Box|Sphere|Plane|Cylinder|Capsule|Torus)Geometry\b/);
        const kind = geoMatch ? geoMatch[1]!.toLowerCase() : "box";
        return {
          call: `instances.${kind}({ transforms: [] })`,
          comment: `a3d: ${count ?? "?"} instances — transforms/instanceColors populate the arrays from the update loop; ${geoMatch ? "factory inferred from the geometry arg" : "geometry is a variable — pick the instances.* factory matching it"}; the setMatrixAt/setColorAt handle ships as instances.mesh (SG-01)`
        };
      }
      case "BokehPass": {
        // BokehPass(scene, camera, { focus, aperture, maxblur }) — rename
        // maxblur→maxBlur and drop the scene/camera args (the pass binds to
        // the post graph's scene).
        const params = a[2];
        if (params === undefined) return { call: `${target}()` };
        const body = params.trim().replace(/^\{/, "").replace(/\}$/, "");
        const fields = splitArgs(body)
          .map((part) => {
            const colon = part.indexOf(":");
            if (colon < 0) return undefined;
            const key = part.slice(0, colon).trim().replace(/^["']|["']$/g, "");
            const value = part.slice(colon + 1).trim();
            const renamed = key === "maxblur" ? "maxBlur" : key;
            return `${renamed}: ${value}`;
          })
          .filter((f): f is string => f !== undefined);
        return {
          call: `${target}({ ${fields.join(", ")} })`,
          comment: "a3d: focus is a linear-distance fraction in the DOF spec, not a physical f-stop — retune aperture"
        };
      }
      case "OrbitControls":
        return {
          call: `${target}({})`,
          comment: "a3d: target/damping map to camera.orbit options; per-frame input comes from the runtime, not DOM listeners"
        };
      case "WebGLRenderer":
      case "WebGPURenderer":
        return {
          call: `${target}({ resize: true })`,
          comment: `a3d: ${args.trim() ? `ctor options (${args.trim()}) — ` : ""}createAuraApp owns the loop, sizing and context; see the scene/camera/options spec`
        };
      default:
        return null;
    }
  };
}

function controlsCtor(name: string, args: string): EmitArgsResult | null {
  const a = splitArgs(args);
  const camera = a[0]?.trim();
  const dropped = a.slice(1).filter((part) => part.trim() !== "");
  return {
    call: camera ? `new ${name}(${camera})` : `new ${name}()`,
    comment: `a3d: ctor is (cameraLike?, options) — ${dropped.length > 0 ? `dropped args (${dropped.join(", ")}) — ` : ""}dom wiring goes through options`
  };
}

// ── Mutable math classes vs option-field primitives ───────────────────────────
// `@aura3d/math/three` Color/Euler/Vector3 are classes, but Aura3D option fields take "#rrggbb" strings and
// [x, y, z] tuples. The class is right at a standalone site (`const c = new THREE.Color(...); c.setHex(...)`);
// the primitive is right where the value is consumed as an option.

/** Constructs whose emitted form lives in `@aura3d/math/three`; they take the classes as arguments. */
const MATH_THREE_CONSTRUCTS: ReadonlySet<string> = new Set([
  "Vector2", "Vector3", "Vector4", "Quaternion", "Euler", "Matrix3", "Matrix4", "Box3", "Sphere", "Plane", "Ray", "Frustum", "Color", "Triangle"
]);
const PRIMITIVE_CLASS_OPEN = /\bnew\s+(?:THREE\.)?(Color|Euler|Vector3)\s*\(/;

function colorPrimitive(args: string): string {
  const trimmed = args.trim();
  if (trimmed === "") return '"#ffffff"';
  const literal = hex(trimmed);
  if (literal) return literal;
  // Non-literal (a variable, an r/g/b triple, an HSL string): let the class do the conversion.
  return `\`#\${new Color(${trimmed}).getHexString()}\``;
}

function eulerPrimitive(args: string): string {
  const parts = splitArgs(args);
  const order = parts.length > 3 ? parts[3] : undefined;
  const xyz = `[${[0, 1, 2].map((i) => parts[i] ?? "0").join(", ")}]`;
  if (order === undefined || /^['"]XYZ['"]$/.test(order)) return xyz;
  return `${xyz} /* a3d: Euler order ${order} dropped — node rotation is XYZ; compose a quaternion for other orders */`;
}

function vector3Primitive(args: string): string {
  const parts = splitArgs(args);
  return `[${[0, 1, 2].map((i) => parts[i] ?? "0").join(", ")}]`;
}

function primitiveFor(name: string, args: string): string {
  if (name === "Color") return colorPrimitive(args);
  if (name === "Euler") return eulerPrimitive(args);
  return vector3Primitive(args);
}

/** Rewrites every `new (THREE.)Color/Euler/Vector3(...)` in `text` to its option-field primitive, innermost first. */
function inlineMathPrimitives(text: string): string {
  const m = PRIMITIVE_CLASS_OPEN.exec(text);
  if (!m) return text;
  const open = m.index + m[0].length - 1;
  const close = matchingParen(text, open);
  if (close < 0) return text;
  const inner = inlineMathPrimitives(text.slice(open + 1, close));
  return text.slice(0, m.index) + primitiveFor(m[1] ?? "", inner) + inlineMathPrimitives(text.slice(close + 1));
}

/** A block comment may not contain another one: drop complete nested comments, break any stray terminator. */
function commentSafe(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\*\//g, "* /").replace(/\s{2,}/g, " ").trim();
}

// Option sites that are visible without the surrounding construct: `scene.background = new THREE.Color(...)` and
// object-literal keys. `const color = new THREE.Color(...)` has neither a leading `.` nor a `:` after the name,
// so a variable keeps the class.
const PRIMITIVE_CONTEXT_KEYS: Readonly<Record<string, { readonly assign: string; readonly key: string }>> = {
  Color: { assign: "background|color|emissive|specular|sheenColor|groundColor", key: "background|color|emissive|specularColor|sheenColor|groundColor" },
  Vector3: { assign: "(?!)", key: "position|scale|target|direction|center|size|offset" },
  Euler: { assign: "(?!)", key: "rotation|euler" }
};

function primitiveOptionContexts(source: string, construct: string, needle: string): string[] {
  const keys = PRIMITIVE_CONTEXT_KEYS[construct];
  if (!keys) return [];
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:\\.(?:${keys.assign})\\s*=(?!=)|\\b(?:${keys.key})\\s*:)\\s*${escaped}`, "g");
  return [...source.matchAll(re)].map((m) => m[0]);
}

const EMIT_ARGS: Readonly<Record<string, EmitArgs>> = {
  PerspectiveCamera: (args) => mapPerspectiveCamera(args, "camera.perspective"),
  OrthographicCamera: (args) => mapOrthographicCamera(args, "camera.orthographic"),
  BoxGeometry: mapGeometryArgs("BoxGeometry", "primitives.box"),
  SphereGeometry: mapGeometryArgs("SphereGeometry", "primitives.sphere"),
  CylinderGeometry: mapGeometryArgs("CylinderGeometry", "primitives.cylinder"),
  PlaneGeometry: mapGeometryArgs("PlaneGeometry", "primitives.plane"),
  CapsuleGeometry: mapGeometryArgs("CapsuleGeometry", "primitives.capsule"),
  TorusGeometry: mapGeometryArgs("TorusGeometry", "primitives.torus"),
  MeshStandardMaterial: mapStandardMaterialArgs("material.pbr"),
  MeshLambertMaterial: mapStandardMaterialArgs("material.pbr", [["unlit", "false"]]),
  MeshPhongMaterial: mapStandardMaterialArgs("material.pbr"),
  MeshBasicMaterial: mapStandardMaterialArgs("material.pbr", [["unlit", "true"]]),
  DirectionalLight: mapLightArgs("DirectionalLight", "lights.directional"),
  PointLight: mapLightArgs("PointLight", "lights.point"),
  SpotLight: mapLightArgs("SpotLight", "lights.spot"),
  AmbientLight: mapLightArgs("AmbientLight", "lights.ambient"),
  HemisphereLight: mapLightArgs("HemisphereLight", "lights.ambient"),
  UnrealBloomPass: mapPostPassArgs("UnrealBloomPass", "effects.bloom"),
  SMAAPass: mapPostPassArgs("SMAAPass", "effects.antiAlias"),
  TAARenderPass: mapPostPassArgs("TAARenderPass", "effects.antiAlias"),
  SSAARenderPass: mapPostPassArgs("SSAARenderPass", "effects.antiAlias"),
  SSAOPass: mapPostPassArgs("SSAOPass", "effects.ambientOcclusion"),
  SAOPass: mapPostPassArgs("SAOPass", "effects.ambientOcclusion"),
  GTAOPass: mapPostPassArgs("GTAOPass", "effects.ambientOcclusion"),
  BokehPass: mapPostPassArgs("BokehPass", "effects.depthOfField"),
  Fog: mapPostPassArgs("Fog", "effects.fog"),
  FogExp2: mapPostPassArgs("FogExp2", "effects.depthFog"),
  InstancedMesh: mapPostPassArgs("InstancedMesh", "instances.box"),
  OrbitControls: mapPostPassArgs("OrbitControls", "camera.orbit"),
  WebGLRenderer: mapPostPassArgs("WebGLRenderer", "createAuraApp"),
  WebGPURenderer: mapPostPassArgs("WebGPURenderer", "createAuraApp"),
  Scene: (args) => (args.trim() === "" ? { call: "scene()" } : null),
  Group: (args) => (args.trim() === "" ? { call: "group()" } : null),
  RoomEnvironment: () => ({ call: "environments.neutral()" }),
  // The math classes below come from `@aura3d/math/three`: mutable, three-compatible, same constructor arguments,
  // so the source arguments pass through verbatim at standalone sites (`const c = new THREE.Color(...)`).
  // Color, Euler and Vector3 are classes now, but Aura3D option fields (scene.background, light and fog colour,
  // node position/rotation) take a hex string or a tuple. Where the codemod can see an option site (an argument of a
  // construct it rewrites, or `.background =` / `color:` style keys) it emits the primitive instead; see
  // `inlineMathPrimitives` and `primitiveOptionContexts`. Any other site keeps the class and says how to cross over.
  Color: (args) => ({ call: `new Color(${args})`, comment: "a3d: mutable Color class; Aura3D options take a hex string, pass `#${c.getHexString()}`" }),
  Euler: (args) => ({ call: `new Euler(${args})`, comment: "a3d: mutable Euler class; node rotation takes [x, y, z], pass [e.x, e.y, e.z]" }),
  Vector2: (args) => ({ call: `new Vector2(${args})` }),
  Vector3: (args) => ({ call: `new Vector3(${args})`, comment: "a3d: mutable Vector3 class; node specs take [x, y, z], pass v.toArray()" }),
  Triangle: (args) => ({ call: `new Triangle(${args})` }),
  Vector4: (args) => ({ call: `new Vector4(${args})` }),
  Quaternion: (args) => ({ call: `new Quaternion(${args})`, comment: args.trim() === "" ? undefined : undefined }),
  Matrix3: (args) => ({ call: `new Matrix3(${args})` }),
  Matrix4: (args) => ({ call: `new Matrix4(${args})` }),
  Box3: (args) => ({ call: `new Box3(${args})` }),
  Sphere: (args) => ({ call: `new Sphere(${args})` }),
  Plane: (args) => ({ call: `new Plane(${args})` }),
  Ray: (args) => ({ call: `new Ray(${args})` }),
  Frustum: (args) => ({ call: `new Frustum(${args})` }),
  // Aura controls ctors are `(cameraLike?, options)` or `(options)` — three's
  // `(camera, domElement)` arg pair does not pass through. Keep the first arg
  // (the camera-like) and drop the rest with a comment, or emit the bare
  // options object for options-only ctors.
  MapControls: (args) => controlsCtor("MapControls", args),
  TrackballControls: (args) => controlsCtor("TrackballControls", args),
  ArcballControls: (args) => controlsCtor("ArcballControls", args),
  FlyControls: (args) => controlsCtor("FlyControls", args),
  FirstPersonControls: (args) => controlsCtor("FirstPersonControls", args),
  PointerLockControls: (args) => controlsCtor("PointerLockControls", args),
  DragControls: () => ({ call: "new DragControls({})", comment: "a3d: ctor takes DragControlsOptions, not (objects, camera, dom) — deprecated in @aura3d/engine/controls; prefer InteractionControls/picking" }),
  TransformControls: () => ({ call: "new TransformControls({})", comment: "a3d: ctor takes TransformControlsOptions, not (camera, dom) — the gizmo attaches to Aura objects" }),
  AudioListener: () => ({ call: "new AudioListener()", comment: "a3d: AudioListener.setTransform writes the pose into ctx.listener when a context is bound; listenerSync is the per-frame driver" })
};

const THREE_NAMED_AUDIO_IMPORT = /import\s*\{[^}]*\bAudio\b[^}]*\}\s*from\s*["']three(?:\/[^"']*)?["']/;
const STANDARD_VERTEX_ATTRIBUTES: ReadonlySet<string> = new Set(["position", "normal", "uv", "color"]);
// Mirrors RootGeometry.assertCustomAttributeName (checked against it in tests/unit/aura3d-cli/migrate-three.test.ts),
// plus three's own non-standard-but-built-in names the engine does not carry as custom attributes.
const RESERVED_CUSTOM_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set([
  "position", "positions", "normal", "normals", "uv", "uv0", "uvs", "uv1", "uv2", "uv3", "color", "colors", "tangent", "tangents",
  "joints", "weights", "joints1", "weights1", "skinIndex", "skinWeight", "lineStart", "lineEnd", "lineCorner", "lineDistance", "index",
  "instanceMatrix", "instanceColor"
]);

/** Why a three attribute name cannot become an engine custom attribute, or undefined when it can. */
export function customAttributeBlocker(name: string): string | undefined {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return "is not a GLSL identifier";
  if (name.startsWith("gl_") || name.includes("__")) return "is reserved by GLSL (gl_ prefix or double underscore)";
  if (name.startsWith("a_") || name.startsWith("u_")) return "uses a prefix reserved for engine attributes/uniforms (a_, u_)";
  if (RESERVED_CUSTOM_ATTRIBUTE_NAMES.has(name)) return "collides with a built-in vertex semantic the engine does not carry as a custom attribute";
  return undefined;
}

const CUSTOM_ATTRIBUTE_CALL = /\.setAttribute\(\s*(["'])([A-Za-z0-9_]+)\1\s*,\s*(?![\s"'`\d])/g;

export function emitMigratedSource(source: string): MigrateResult {
  const constructs = parseThreeSource(source);
  const rows: MigrateRow[] = [];
  const neededImports = new Map<string, Set<string>>();
  const comments = new Map<number, string[]>();
  const rewrites: { readonly match: string; readonly replacement: string }[] = [];
  let rewritten = 0;
  let sawRenderer = false;

  for (const c of constructs) {
    if (c.construct === "import") continue; // handled at the end
    if (c.specifier === "bare" && UNSAFE_BARE_NAME.test(c.construct)) continue;
    // `new Audio(src)` is the browser's HTMLAudioElement unless three's Audio was imported by name.
    if (c.specifier === "bare" && c.construct === "Audio" && !THREE_NAMED_AUDIO_IMPORT.test(source)) continue;
    const mapping = threeMappingFor(c.construct);
    if (c.specifier === "bare" && !mapping) continue; // not a THREE name — don't report local ctors

    const row = rowFor(c, mapping);
    rows.push(row);

    const isMapped = mapping && (mapping.mapping === "exact" || mapping.mapping === "approximate");
    if (isMapped && mapping.emit !== "comment") {
      rewritten++;
      if (mapping.engineImport) {
        const from = mapping.engineImportFrom ?? ENGINE_ROOT;
        const set = neededImports.get(from) ?? new Set<string>();
        set.add(mapping.engineImport);
        neededImports.set(from, set);
      }
      if (c.construct.endsWith(".load")) {
        // loader `.load(` calls get a guidance comment, not a rewrite (the
        // model() call needs a typed asset key the codemod cannot invent).
        // Mapped, so `a3d:` — `TODO(a3d-migrate)` is reserved for no-coverage.
        pushComment(comments, c.line, `// a3d: ${c.construct} → ${mapping.target} — ${mapping.note}`);
      } else {
        const replacement = emitCall(mapping, c);
        const needle = `new THREE.${c.construct}(${c.rawArgs ?? c.args})`;
        const needleBare = `new ${c.construct}(${c.rawArgs ?? c.args})`;
        const used = source.includes(needle) ? needle : source.includes(needleBare) ? needleBare : undefined;
        if (used) {
          // An option site the codemod can see (`.background =`, `color:` ...) takes the primitive, not the class.
          if (PRIMITIVE_CONTEXT_KEYS[c.construct]) {
            const primitive = primitiveFor(c.construct, inlineMathPrimitives(c.args));
            for (const site of primitiveOptionContexts(source, c.construct, used)) {
              rewrites.push({ match: site, replacement: site.slice(0, site.length - used.length) + primitive });
            }
          }
          rewrites.push({ match: used, replacement });
        }
        if (c.construct === "WebGLRenderer" || c.construct === "WebGPURenderer") sawRenderer = true;
      }
    } else if (isMapped && mapping.emit === "comment") {
      // Config-shaped targets (output, environments.capture, app.addPostPass):
      // the row reports the mapping; the code gets a guidance comment, not a
      // fake call. `a3d:` — the construct IS covered, it just needs
      // restructuring the codemod can't automate.
      rewritten++;
      if (mapping.engineImport) {
        const from = mapping.engineImportFrom ?? ENGINE_ROOT;
        const set = neededImports.get(from) ?? new Set<string>();
        set.add(mapping.engineImport);
        neededImports.set(from, set);
      }
      pushComment(comments, c.line, `// a3d: ${c.construct} → ${mapping.target} — ${mapping.note}`);
    } else if (mapping && mapping.mapping === "pending") {
      // Reserved but not yet public — name the planned API and owning lane.
      pushComment(comments, c.line, `// TODO(a3d-migrate): parityPending ${c.construct} → ${mapping.target} — ${mapping.note}`);
    } else if (mapping) {
      // Deliberate `none` row (excluded / no equivalent on the public
      // surface) — a statement, not a missing mapping.
      pushComment(comments, c.line, `// a3d: ${c.construct} — ${mapping.note}`);
    } else {
      pushComment(comments, c.line, `// TODO(a3d-migrate): no mapping for ${c.construct} — ${row.note}`);
    }
  }

  // Standard attributes (position/normal/uv/color) are fields of geometry.dynamic;
  // any other name is a custom per-vertex attribute (R-23), carried by
  // geometry.dynamic({ attributes }) and read by name in material.custom GLSL.
  // Gated on a BufferAttribute-family construct plus a non-string second
  // argument so DOM `el.setAttribute("id", "x")` calls in the same file are not
  // flagged.
  if (constructs.some((x) => /BufferAttribute$/.test(x.construct))) {
    source.split("\n").forEach((text, index) => {
      for (const m of text.matchAll(CUSTOM_ATTRIBUTE_CALL)) {
        const name = m[2] ?? "";
        if (STANDARD_VERTEX_ATTRIBUTES.has(name)) continue;
        const blocker = customAttributeBlocker(name);
        if (blocker) {
          const blockedNote = `vertex attribute "${name}" has no public Aura3D equivalent — the name ${blocker}; rename it, or drop the per-vertex data`;
          pushComment(comments, index + 1, `// TODO(a3d-migrate): ${blockedNote}`);
          rows.push({ construct: `setAttribute("${name}")`, line: index + 1, mapping: "none", note: blockedNote });
          continue;
        }
        const note = `custom vertex attribute "${name}" → geometry.dynamic({ attributes: { ${name}: { itemSize, data } } }) (R-23, max 11 per geometry, GLSL-identifier names); declare it in the material.custom vertex stage as \`in <float|vec2|vec3|vec4> ${name};\` (GLSL1 \`attribute\` is accepted, but \`varying\`/\`texture2D\`/\`gl_FragColor\` must still be ported to #version 300 es); per-frame writes go through handle.updateAttribute("${name}", { array, offset }); for a THREE.Points object add topology: "points" and set gl_PointSize in the vertex shader`;
        pushComment(comments, index + 1, `// a3d: ${note}`);
        rows.push({ construct: `setAttribute("${name}")`, line: index + 1, mapping: "approximate", note });
      }
    });
  }

  let code = source;
  // Longest-match first so an outer construct (`new UnrealBloomPass(new
  // THREE.Vector2(...), …)`) rewrites before the nested `new THREE.Vector2`
  // inside its args can mangle the needle.
  for (const { match, replacement } of [...rewrites].sort((a, b) => b.match.length - a.match.length)) {
    code = code.replaceAll(match, replacement);
  }

  // Color/Euler/Vector3 only need their `@aura3d/math/three` import where the class form survived; a file whose
  // every use became an option primitive must not import an unused name.
  const mathThreeImports = neededImports.get("@aura3d/math/three");
  if (mathThreeImports) {
    for (const name of ["Color", "Euler", "Vector3"]) {
      if (mathThreeImports.has(name) && !new RegExp(`\\bnew\\s+${name}\\s*\\(`).test(code)) mathThreeImports.delete(name);
    }
    if (mathThreeImports.size === 0) neededImports.delete("@aura3d/math/three");
  }

  // three/app method folds — only when a renderer construct was seen so
  // non-three `.render(`/`.setSize(` calls are never touched.
  if (sawRenderer) {
    code = code.replace(/([A-Za-z_$][\w$]*)\.setSize\([^;\n]*\)/g, `/* a3d: $1.setSize(...) — the app owns canvas sizing (createAuraApp resize option) */`);
    code = code.replace(/([A-Za-z_$][\w$]*)\.setPixelRatio\([^;\n]*\)/g, `/* a3d: $1.setPixelRatio(...) — app.setPixelRatio lands with lane L7 (SH-05) */`);
    code = code.replace(/([A-Za-z_$][\w$]*)\.setClearColor\([^;\n]*\)/g, `/* a3d: $1.setClearColor(...) — app.setClearColor lands with lane L7 (SH-05); clear colour comes from scene().background */`);
    code = code.replace(/([A-Za-z_$][\w$]*)\.setAnimationLoop\(/g, `$1.onFrame(`);
    code = code.replace(/([A-Za-z_$][\w$]*)\.render\([^;\n]*\)/g, `/* a3d: $1.render(...) — createAuraApp renders its scene every frame; manual stepping is app.step(dt) */`);
    code = code.replaceAll("renderer.domElement", "renderer.canvas");
  }

  // rewrite three imports
  const importGroups = [...neededImports.entries()].sort(([a], [b]) => a.localeCompare(b));
  const hasThreeImportStatement = constructs.some((x) => x.construct === "import" && (x.specifier === "three" || x.specifier === "three/src/three.module.js" || x.specifier === "three/webgpu"));
  // No `from "three"` statement to rewrite — the needed engine imports go in
  // a fresh block at the top of the file so the emitted calls resolve.
  if (importGroups.length > 0 && !hasThreeImportStatement) {
    const statements = importGroups
      .map(([from, names]) => `import { ${[...names].sort().join(", ")} } from "${from}";`)
      .join("\n");
    code = `${statements}\n${code}`;
  }
  if (importGroups.length > 0 || constructs.some((x) => x.construct === "import")) {
    let rootImportWritten = hasThreeImportStatement ? false : true;
    for (const c of constructs.filter((x) => x.construct === "import")) {
      const spec = c.specifier ?? "";
      if (spec === "three" || spec === "three/src/three.module.js" || spec === "three/webgpu") {
        if (!rootImportWritten && importGroups.length > 0) {
          const statements = importGroups
            .map(([from, names]) => `import { ${[...names].sort().join(", ")} } from "${from}";`)
            .join(" ");
          code = code.replace(/import\s+(?:\*\s+as\s+THREE|\{[^}]*\})?\s*(?:\*\s+as\s+THREE)?\s*from\s+["']three(?:\/src\/three\.module\.js|\/webgpu)?["']\s*;?/, statements);
          rootImportWritten = true;
        } else if (!rootImportWritten) {
          // no imports needed — comment the `import * as THREE` line out so
          // the emitted file doesn't keep a live three specifier.
          const original = code.split("\n")[c.line - 1];
          if (original !== undefined && /^\s*import\b/.test(original)) {
            code = code.replace(original, () => `// a3d:drop ${original.trim()} — no engine imports required`);
          } else {
            pushComment(comments, c.line, `// a3d: "three" import removed — no engine imports required`);
          }
          rootImportWritten = true;
        } else {
          // a second `from "three"` statement — drop it too.
          const original = code.split("\n")[c.line - 1];
          if (original !== undefined && /^\s*import\b/.test(original)) {
            code = code.replace(original, () => `// a3d:drop ${original.trim()} — duplicate three import`);
          }
        }
        if (spec === "three/webgpu") {
          pushComment(comments, c.line, `// a3d: three/webgpu — createAuraApp mounts WebGL2; NodeMaterial constructs map to material.node (SH-01 TSL subset, GLSL only); compute maps to compute.* (SH-04, WebGPU-only)`);
        }
      } else if (spec === "three/tsl") {
        pushComment(comments, c.line, `// TODO(a3d-migrate): three/tsl imports are not rewritten — rebuild node graphs with the tsl.* subset and material.node (see the NodeMaterial row for the supported and unsupported names)`);
        rows.push({ construct: `import "${spec}"`, line: c.line, mapping: "none", note: "three/tsl specifier is not rewritten; use the tsl.* subset (SH-01) and material.node for supported nodes." });
      } else {
        const action = addonActionFor(spec);
        if (action?.kind === "rewrite") {
          code = code.replaceAll(`from "${spec}"`, `from "${action.to}"`).replaceAll(`from '${spec}'`, `from '${action.to}'`);
          rows.push({ construct: `import "${spec}"`, line: c.line, mapping: "approximate", note: `specifier rewritten to ${action.to} — named exports exist there.` });
        } else if (action?.kind === "comment" || action?.kind === "excluded") {
          // Drop the import line in place (commented out) when it sits alone on
          // its line — the emitted code no longer needs it and leaving a live
          // `from "three/…"` specifier would break the build.
          const original = code.split("\n")[c.line - 1];
          const escapedSpec = spec.replaceAll(/[.*+?^$()|[\]\\]/g, "\\$&");
          const singleLine = original !== undefined && new RegExp(`^\\s*import\\b.*from\\s*["']${escapedSpec}["']\\s*;?\\s*$`).test(original);
          if (singleLine) {
            // function replacement: the line may contain `$`-sequences that
            // String.replace would interpret as group references.
            code = code.replace(original, () => `// a3d:drop ${original.trim()} — ${action.note}`);
          } else {
            pushComment(comments, c.line, `// a3d:drop ${spec} — ${action.note}`);
          }
          rows.push({
            construct: `import "${spec}"`,
            line: c.line,
            mapping: action.kind === "excluded" ? "none" : "approximate",
            note: `import dropped: ${action.note}`
          });
        } else {
          pushComment(comments, c.line, `// TODO(a3d-migrate): import specifier "${spec}" has no public Aura3D equivalent — resolve manually`);
          rows.push({ construct: `import "${spec}"`, line: c.line, mapping: "none", note: "three/addons specifier is not rewritten; resolve the named export against @aura3d/engine manually." });
        }
      }
    }
  }

  // splice comments (bottom-up so line numbers stay valid)
  const codeLines = code.split("\n");
  for (const [line, texts] of [...comments.entries()].sort((a, b) => b[0] - a[0])) {
    const at = Math.min(line, codeLines.length);
    codeLines.splice(Math.max(0, at - 1), 0, ...texts);
  }
  code = codeLines.join("\n");

  rows.sort((a, b) => a.line - b.line);
  return { code, rows, rewrittenConstructs: rewritten };
}

function rowFor(c: ThreeConstruct, mapping: ThreeMapping | undefined): MigrateRow {
  if (!mapping) {
    return { construct: c.construct, line: c.line, mapping: "none", note: "no Aura3D equivalent in the T6.1 table; resolve manually." };
  }
  if (mapping.mapping === "pending") {
    return { construct: c.construct, line: c.line, mapping: "pending", note: `${mapping.target} — ${mapping.note}` };
  }
  const note = mapping.target === "" ? mapping.note : `${mapping.target} — ${mapping.note}`;
  return { construct: c.construct, line: c.line, mapping: mapping.mapping, note };
}

function emitCall(mapping: ThreeMapping, c: ThreeConstruct): string {
  // Arguments of a construct that is not itself a `@aura3d/math/three` class are option values: a nested
  // Color/Euler/Vector3 becomes the hex string or tuple that option takes, never a class instance.
  const args = MATH_THREE_CONSTRUCTS.has(mapping.construct) ? c.args : inlineMathPrimitives(c.args);
  const emitter = EMIT_ARGS[mapping.construct];
  if (emitter) {
    const out = emitter(args);
    if (out) {
      return `${out.call}${out.comment ? ` /* ${commentSafe(out.comment)} */` : ""}`;
    }
  }
  // Covered constructs get `a3d:` guidance, not `TODO(a3d-migrate)` — the
  // TODO marker is reserved for pending/unmapped rows.
  const todo = ` /* ${commentSafe(`a3d: ${c.construct} — ${args ? `map args (${args}); ` : ""}${mapping.note}`)} */`;
  if (args.trim() === "" && mapping.emit !== "new") {
    // no args to mis-map — emit the clean factory plus a short guidance note
    return `${mapping.target}() /* a3d: ${mapping.note} */`;
  }
  if (mapping.emit === "new") {
    return `new ${mapping.target}()${args ? ` /* ${commentSafe(`a3d: original args (${args}) — ${mapping.note}`)} */` : ` /* a3d: ${mapping.note} */`}`;
  }
  return `${mapping.target}()${todo}`;
}

function pushComment(map: Map<number, string[]>, line: number, text: string): void {
  const list = map.get(line) ?? [];
  list.push(text);
  map.set(line, list);
}
