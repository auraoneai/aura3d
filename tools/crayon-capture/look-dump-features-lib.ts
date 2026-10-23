/**
 * tools/crayon-capture/look-dump-features-lib — static feature map of a captured game bundle.
 *
 * Parses captured third-party JavaScript as inert text (never executed) with the TypeScript parser and records
 * WHAT the game contains and WHERE (`line:col`, `offset`), so a porter can see which screens, key bindings, audio
 * cues, data tables, shaders and effects exist and which are still unported. Only inventories, names, counts,
 * numbers and short matched labels are recorded: never code snippets.
 */
import ts from "typescript";
import { hashString } from "./look-dump-lib.js";

export const FEATURES_SCHEMA = "a3d-look-features/1";

export interface Loc {
  readonly file: string;
  readonly line: number;
  readonly col: number;
  readonly offset: number;
}

const SCREEN_WORDS: readonly (readonly [string, RegExp])[] = [
  ["title", /\b(title screen|title|splash)\b/i],
  ["menu", /\b(main menu|menu)\b/i],
  ["pause", /\bpaus(e|ed)\b/i],
  ["game-over", /\b(game ?over|you died|wasted|crashed)\b/i],
  ["results", /\b(results?|scoreboard|summary|stats)\b/i],
  ["victory", /\b(victory|you win|winner|complete[d]?|finished|finale)\b/i],
  ["level-select", /\b(level select|select level|levels?|stages?|chapters?|routes?)\b/i],
  ["settings", /\b(settings|options|preferences)\b/i],
  ["credits", /\bcredits\b/i],
  ["garage", /\b(garage|shop|store|upgrades?|customi[sz]e|loadout)\b/i],
  ["tutorial", /\b(tutorial|how to play|controls|instructions)\b/i],
  ["intro", /\b(intro|cutscene|prologue|story|dialog(ue)?)\b/i],
  ["leaderboard", /\b(leaderboard|high ?score|best time|records?)\b/i],
  ["countdown", /\b(countdown|get ready|ready|go!)\b/i],
  ["loading", /\bloading\b/i],
  ["checkpoint", /\b(checkpoint|lap|finish line)\b/i],
  ["boss", /\bboss\b/i]
];

const POST_WORDS = /bloom|vignette|chromatic|aberration|grain|fxaa|smaa|ssao|bokeh|depth ?of ?field|\bdof\b|tonemap|tone[_ ]?mapping|exposure|colou?r ?grad|\blut\b|godray|outline|glitch|scanline|radial ?blur|motion ?blur|halo|lens ?flare|sharpen/i;
const PARTICLE_WORDS = /particle|emitter|spark|trail|dust|smoke|rain|snow|splash|confetti|ember|burst|explosion|firework|debris|speed ?line|streak/i;
const KEY_NAMES = /^(Key[A-Z]|Arrow(Up|Down|Left|Right)|Space|Enter|Escape|Tab|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Digit[0-9]|Backspace)$/;
const AUDIO_API = /^(AudioContext|webkitAudioContext|createOscillator|createGain|createBufferSource|decodeAudioData|createBiquadFilter|createPanner|createDynamicsCompressor|createStereoPanner|createConvolver|createAnalyser|createMediaElementSource|AudioListener|PositionalAudio|Howl|Howler)$/;
const AUDIO_EXT = /\.(mp3|ogg|wav|m4a|opus|flac|webm)(\?|$)/i;
const ASSET_EXT = /\.(glb|gltf|obj|fbx|ktx2|basis|png|jpe?g|webp|avif|gif|svg|hdr|exr|mp3|ogg|wav|m4a|opus|woff2?|ttf|otf|json|wasm|bin)(\?|#|$)/i;
const THREE_CLASSES = new Set([
  "Scene", "PerspectiveCamera", "OrthographicCamera", "WebGLRenderer", "WebGPURenderer", "Mesh", "InstancedMesh", "BatchedMesh", "SkinnedMesh", "Points", "Line", "LineSegments", "LineLoop", "Sprite", "Group", "Object3D", "Bone", "Skeleton",
  "BoxGeometry", "SphereGeometry", "PlaneGeometry", "CylinderGeometry", "ConeGeometry", "CapsuleGeometry", "TorusGeometry", "TorusKnotGeometry", "RingGeometry", "CircleGeometry", "TubeGeometry", "ExtrudeGeometry", "LatheGeometry", "ShapeGeometry", "BufferGeometry", "InstancedBufferGeometry", "BufferAttribute", "Float32BufferAttribute", "InstancedBufferAttribute", "InstancedInterleavedBuffer",
  "MeshBasicMaterial", "MeshStandardMaterial", "MeshPhysicalMaterial", "MeshLambertMaterial", "MeshPhongMaterial", "MeshToonMaterial", "MeshMatcapMaterial", "MeshDepthMaterial", "ShaderMaterial", "RawShaderMaterial", "PointsMaterial", "LineBasicMaterial", "LineDashedMaterial", "SpriteMaterial", "MeshStandardNodeMaterial", "MeshBasicNodeMaterial", "NodeMaterial",
  "AmbientLight", "DirectionalLight", "PointLight", "SpotLight", "HemisphereLight", "RectAreaLight", "LightProbe", "Fog", "FogExp2", "Color", "Vector2", "Vector3", "Vector4", "Quaternion", "Euler", "Matrix3", "Matrix4", "Box3", "Sphere", "Plane", "Ray", "Raycaster", "Clock", "Curve", "CatmullRomCurve3", "CubicBezierCurve3", "QuadraticBezierCurve3", "LineCurve3", "Spherical",
  "TextureLoader", "CubeTextureLoader", "GLTFLoader", "DRACOLoader", "KTX2Loader", "RGBELoader", "EXRLoader", "FontLoader", "AudioLoader", "ImageLoader", "FileLoader", "LoadingManager",
  "CanvasTexture", "DataTexture", "VideoTexture", "CubeTexture", "Texture", "CompressedTexture", "WebGLRenderTarget", "WebGLCubeRenderTarget", "PMREMGenerator", "CubeCamera",
  "AnimationMixer", "AnimationClip", "AnimationAction", "KeyframeTrack", "VectorKeyframeTrack", "NumberKeyframeTrack", "QuaternionKeyframeTrack", "PropertyBinding",
  "AudioListener", "Audio", "PositionalAudio", "AudioAnalyser",
  "EffectComposer", "RenderPass", "UnrealBloomPass", "ShaderPass", "OutputPass", "SMAAPass", "FXAAPass", "BokehPass", "SSAOPass", "GlitchPass", "FilmPass", "AfterimagePass", "OutlinePass", "PostProcessing"
]);

export interface FeatureMap {
  readonly schema: typeof FEATURES_SCHEMA;
  readonly game: string;
  readonly sources: readonly { file: string; bytes: number; lines: number; singleLine: boolean; hash: string }[];
  readonly screens: readonly { screen: string; hits: number; first: readonly Loc[] }[];
  readonly stateSwitches: readonly { loc: Loc; cases: readonly string[] }[];
  readonly domIds: readonly { id: string; loc: Loc }[];
  readonly inputs: {
    readonly keys: readonly { key: string; hits: number; first: Loc }[];
    readonly listeners: readonly { event: string; hits: number; first: Loc }[];
  };
  readonly audio: {
    readonly apiUse: readonly { api: string; hits: number; first: Loc }[];
    readonly urls: readonly { path: string; loc: Loc }[];
    readonly oscillatorTypes: readonly string[];
    readonly oscillatorCalls: number;
    readonly playCalls: number;
  };
  readonly storage: readonly { store: string; op: string; key: string | null; loc: Loc }[];
  readonly network: readonly { kind: string; target: string | null; loc: Loc }[];
  readonly platform: readonly { api: string; loc: Loc }[];
  readonly three: { readonly constructed: Record<string, number>; readonly imports: readonly string[]; readonly importSources: readonly string[] };
  readonly shaders: readonly { kind: "glsl" | "wgsl"; chars: number; hash: string; uniforms: readonly string[]; varyings: readonly string[]; loc: Loc }[];
  readonly postFx: readonly { word: string; hits: number; first: readonly Loc[] }[];
  readonly particles: readonly { word: string; hits: number; first: readonly Loc[] }[];
  readonly dataTables: readonly { kind: "numeric-array" | "object-array" | "config-object"; length: number; stats?: { min: number; max: number; mean: number; head: readonly number[] }; keys?: readonly string[]; numbers?: Record<string, number>; loc: Loc }[];
  readonly assets: readonly { path: string; ext: string; loc: Loc }[];
  readonly functions: readonly { name: string; params: number; chars: number; loc: Loc }[];
  readonly counts: Record<string, number>;
}

type Hit = { hits: number; first: Loc[] };

export function analyzeSource(game: string, files: readonly { readonly file: string; readonly text: string }[]): FeatureMap {
  const screens = new Map<string, Hit>();
  const postFx = new Map<string, Hit>();
  const particles = new Map<string, Hit>();
  const keys = new Map<string, { hits: number; first: Loc }>();
  const listeners = new Map<string, { hits: number; first: Loc }>();
  const audioApi = new Map<string, { hits: number; first: Loc }>();
  const audioUrls: { path: string; loc: Loc }[] = [];
  const oscTypes = new Set<string>();
  let oscCalls = 0;
  let playCalls = 0;
  const stateSwitches: { loc: Loc; cases: string[] }[] = [];
  const domIds: { id: string; loc: Loc }[] = [];
  const storage: { store: string; op: string; key: string | null; loc: Loc }[] = [];
  const network: { kind: string; target: string | null; loc: Loc }[] = [];
  const platform: { api: string; loc: Loc }[] = [];
  const constructed: Record<string, number> = {};
  const importNames = new Set<string>();
  const importSources = new Set<string>();
  const shaders: FeatureMap["shaders"][number][] = [];
  const dataTables: FeatureMap["dataTables"][number][] = [];
  const assets: { path: string; ext: string; loc: Loc }[] = [];
  const functions: FeatureMap["functions"][number][] = [];
  const sources: FeatureMap["sources"][number][] = [];
  const counts: Record<string, number> = { stringLiterals: 0, functions: 0, newExpressions: 0, calls: 0 };

  const bump = (m: Map<string, Hit>, k: string, loc: Loc) => {
    const h = m.get(k) ?? { hits: 0, first: [] };
    h.hits++;
    if (h.first.length < 3) h.first.push(loc);
    m.set(k, h);
  };
  const bumpOne = (m: Map<string, { hits: number; first: Loc }>, k: string, loc: Loc) => {
    const h = m.get(k);
    if (h) h.hits++;
    else m.set(k, { hits: 1, first: loc });
  };

  for (const { file, text } of files) {
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const lineCount = text.split("\n").length;
    sources.push({ file, bytes: Buffer.byteLength(text), lines: lineCount, singleLine: lineCount <= 3 && text.length > 5000, hash: hashString(text) });
    const locOf = (node: ts.Node): Loc => {
      const start = node.getStart(sf);
      const lc = sf.getLineAndCharacterOfPosition(start);
      return { file, line: lc.line + 1, col: lc.character + 1, offset: start };
    };
    const alias = new Map<string, string>(); // local name -> imported name

    const stringValue = (n: ts.Node): string | null => (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : null);
    const calleeName = (e: ts.Expression): string | null => (ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : null);

    const visitString = (text0: string, node: ts.Node) => {
      counts.stringLiterals = (counts.stringLiterals ?? 0) + 1;
      if (text0.length === 0 || text0.length > 4000) {
        if (text0.length > 40) maybeShader(text0, node);
        return;
      }
      const loc = locOf(node);
      if (text0.length <= 60) {
        for (const [name, re] of SCREEN_WORDS) if (re.test(text0)) bump(screens, name, loc);
        if (POST_WORDS.test(text0)) bump(postFx, (POST_WORDS.exec(text0) as RegExpExecArray)[0].toLowerCase(), loc);
        if (PARTICLE_WORDS.test(text0)) bump(particles, (PARTICLE_WORDS.exec(text0) as RegExpExecArray)[0].toLowerCase(), loc);
        if (KEY_NAMES.test(text0)) bumpOne(keys, text0, loc);
      }
      if (text0.length <= 400) {
        if (AUDIO_EXT.test(text0)) audioUrls.push({ path: stripQuery(text0), loc });
        const am = ASSET_EXT.exec(text0);
        if (am && !text0.includes(" ") && text0.length > 3) assets.push({ path: stripQuery(text0), ext: (am[1] as string).toLowerCase(), loc });
        if (text0.includes("id=\"") || text0.includes("id='")) {
          const re = /\bid=["']([A-Za-z0-9_-]{1,48})["']/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(text0)) !== null && domIds.length < 400) domIds.push({ id: m[1] as string, loc });
        }
      }
      maybeShader(text0, node);
    };
    const maybeShader = (s: string, node: ts.Node) => {
      if (s.length < 40) return;
      const glsl = /gl_FragColor|gl_Position|void\s+main\s*\(|precision\s+(high|medium|low)p|#version\s+\d+|layout\s*\(location/.test(s);
      const wgsl = /@fragment|@vertex|@compute|fn\s+\w+\s*\(.*\)\s*->/.test(s);
      if (!glsl && !wgsl) return;
      const uniforms = [...s.matchAll(/\buniform\s+(?:highp\s+|mediump\s+|lowp\s+)?\w+\s+(\w+)/g)].map((m) => m[1] as string);
      const varyings = [...s.matchAll(/\b(?:varying|in|out)\s+(?:highp\s+|mediump\s+|lowp\s+)?\w+\s+(\w+)\s*;/g)].map((m) => m[1] as string);
      if (shaders.length < 200) shaders.push({ kind: wgsl && !glsl ? "wgsl" : "glsl", chars: s.length, hash: hashString(s), uniforms: [...new Set(uniforms)].slice(0, 40), varyings: [...new Set(varyings)].slice(0, 24), loc: locOf(node) });
    };

    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) visitString(node.text, node);
      else if (ts.isTemplateExpression(node)) {
        const whole = node.head.text + node.templateSpans.map((s) => s.literal.text).join("");
        visitString(whole, node);
      } else if (ts.isImportDeclaration(node)) {
        const spec = stringValue(node.moduleSpecifier);
        if (spec) importSources.add(stripQuery(spec));
        const nb = node.importClause?.namedBindings;
        if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) {
          const imported = (el.propertyName ?? el.name).text;
          alias.set(el.name.text, imported);
          importNames.add(imported);
        }
      } else if (ts.isNewExpression(node)) {
        counts.newExpressions = (counts.newExpressions ?? 0) + 1;
        const cn = calleeName(node.expression);
        if (cn) {
          const real = alias.get(cn) ?? cn;
          if (THREE_CLASSES.has(real)) constructed[real] = (constructed[real] ?? 0) + 1;
          if (cn === "WebSocket") network.push({ kind: "WebSocket", target: node.arguments?.[0] ? stringValue(node.arguments[0]) : null, loc: locOf(node) });
          else if (cn === "Worker" || cn === "SharedWorker") network.push({ kind: cn, target: node.arguments?.[0] ? stringValue(node.arguments[0]) : null, loc: locOf(node) });
          else if (cn === "Audio") { bumpOne(audioApi, "Audio", locOf(node)); }
          else if (AUDIO_API.test(cn)) bumpOne(audioApi, cn, locOf(node));
        }
      } else if (ts.isCallExpression(node)) {
        counts.calls = (counts.calls ?? 0) + 1;
        const cn = calleeName(node.expression);
        const first = node.arguments[0];
        const arg0 = first ? stringValue(first) : null;
        if (cn) {
          if (AUDIO_API.test(cn)) bumpOne(audioApi, cn, locOf(node));
          if (cn === "createOscillator") oscCalls++;
          if (cn === "play" || cn === "playSound" || cn === "start" && ts.isPropertyAccessExpression(node.expression)) playCalls++;
          if (cn === "addEventListener" && arg0) bumpOne(listeners, arg0, locOf(node));
          if (cn === "getElementById" && arg0 && domIds.length < 400) domIds.push({ id: arg0, loc: locOf(node) });
          if ((cn === "querySelector" || cn === "querySelectorAll") && arg0) {
            const m = /#([A-Za-z0-9_-]{1,48})/.exec(arg0);
            if (m && domIds.length < 400) domIds.push({ id: m[1] as string, loc: locOf(node) });
          }
          if ((cn === "getItem" || cn === "setItem" || cn === "removeItem") && ts.isPropertyAccessExpression(node.expression)) {
            const obj = node.expression.expression;
            const store = ts.isIdentifier(obj) ? obj.text : ts.isPropertyAccessExpression(obj) ? obj.name.text : "?";
            if (/storage/i.test(store)) storage.push({ store, op: cn, key: arg0, loc: locOf(node) });
          }
          if (cn === "open" && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "indexedDB") storage.push({ store: "indexedDB", op: "open", key: arg0, loc: locOf(node) });
          if (cn === "fetch") network.push({ kind: "fetch", target: arg0 ? stripQuery(arg0) : null, loc: locOf(node) });
          if (cn === "postMessage") platform.push({ api: "postMessage", loc: locOf(node) });
          if (cn === "requestPointerLock" || cn === "requestFullscreen" || cn === "getGamepads" || cn === "vibrate" || cn === "requestAnimationFrame" && false) platform.push({ api: cn, loc: locOf(node) });
          if (cn === "setValueAtTime" || cn === "linearRampToValueAtTime" || cn === "exponentialRampToValueAtTime") bumpOne(audioApi, cn, locOf(node));
        }
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword && arg0) network.push({ kind: "dynamic-import", target: stripQuery(arg0), loc: locOf(node) });
      } else if (ts.isPropertyAccessExpression(node)) {
        const n = node.name.text;
        if (n === "type" && ts.isBinaryExpression(node.parent) && node.parent.right && stringValue(node.parent.right)) {
          const v = stringValue(node.parent.right) as string;
          if (/^(sine|square|sawtooth|triangle)$/.test(v)) oscTypes.add(v);
        }
        if (AUDIO_API.test(n)) bumpOne(audioApi, n, locOf(node));
      } else if (ts.isSwitchStatement(node)) {
        const labels: string[] = [];
        for (const c of node.caseBlock.clauses) if (ts.isCaseClause(c)) { const v = stringValue(c.expression); if (v !== null && v.length <= 32) labels.push(v); }
        if (labels.length >= 4 && stateSwitches.length < 40) stateSwitches.push({ loc: locOf(node), cases: labels.slice(0, 24) });
      } else if (ts.isArrayLiteralExpression(node)) {
        const els = node.elements;
        if (els.length >= 16 && els.every((e) => ts.isNumericLiteral(e) || (ts.isPrefixUnaryExpression(e) && ts.isNumericLiteral(e.operand)))) {
          const nums = els.map((e) => Number(e.getText(sf)));
          const sum = nums.reduce((a, b) => a + b, 0);
          if (dataTables.length < 120) dataTables.push({ kind: "numeric-array", length: nums.length, stats: { min: Math.min(...nums), max: Math.max(...nums), mean: sum / nums.length, head: nums.slice(0, 6) }, loc: locOf(node) });
        } else if (els.length >= 8 && els.every((e) => ts.isObjectLiteralExpression(e))) {
          const keysOf = new Set<string>();
          for (const e of els.slice(0, 4)) for (const p of (e as ts.ObjectLiteralExpression).properties) if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) keysOf.add(p.name.text);
          if (dataTables.length < 120) dataTables.push({ kind: "object-array", length: els.length, keys: [...keysOf].slice(0, 24), loc: locOf(node) });
        }
      } else if (ts.isObjectLiteralExpression(node) && node.properties.length >= 12) {
        const nums: Record<string, number> = {};
        const names: string[] = [];
        let literalish = 0;
        for (const p of node.properties) {
          if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) continue;
          const k = p.name.text;
          names.push(k);
          const v = p.initializer;
          if (ts.isNumericLiteral(v) || (ts.isPrefixUnaryExpression(v) && ts.isNumericLiteral(v.operand))) { if (Object.keys(nums).length < 60) nums[k] = Number(v.getText(sf)); literalish++; }
          else if (ts.isStringLiteral(v) || v.kind === ts.SyntaxKind.TrueKeyword || v.kind === ts.SyntaxKind.FalseKeyword) literalish++;
        }
        if (literalish >= node.properties.length * 0.6 && dataTables.length < 120) dataTables.push({ kind: "config-object", length: node.properties.length, keys: names.slice(0, 60), numbers: nums, loc: locOf(node) });
      } else if (ts.isIdentifier(node)) {
        const t = node.text;
        if (t.length > 3 && t.length <= 40) {
          if (PARTICLE_WORDS.test(t)) bump(particles, (PARTICLE_WORDS.exec(t) as RegExpExecArray)[0].toLowerCase(), locOf(node));
          if (POST_WORDS.test(t)) bump(postFx, (POST_WORDS.exec(t) as RegExpExecArray)[0].toLowerCase(), locOf(node));
          for (const [name, re] of SCREEN_WORDS) if (re.test(t.replace(/([a-z])([A-Z])/g, "$1 $2"))) { bump(screens, name, locOf(node)); break; }
        }
      }
      if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
        counts.functions = (counts.functions ?? 0) + 1;
        const chars = node.end - node.getStart(sf);
        if (chars > 600) {
          let name = "";
          if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) && node.name) name = node.name.getText(sf);
          else if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) name = node.parent.name.text;
          else if (node.parent && ts.isPropertyAssignment(node.parent) && (ts.isIdentifier(node.parent.name) || ts.isStringLiteral(node.parent.name))) name = node.parent.name.text;
          functions.push({ name: name || "(anonymous)", params: node.parameters.length, chars, loc: locOf(node) });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  const sortHits = (m: Map<string, Hit>, label: "screen" | "word") =>
    [...m.entries()].sort((a, b) => b[1].hits - a[1].hits || a[0].localeCompare(b[0])).map(([k, h]) => (label === "screen" ? { screen: k, hits: h.hits, first: h.first } : { word: k, hits: h.hits, first: h.first }));
  const sortOne = <T extends string>(m: Map<string, { hits: number; first: Loc }>, label: T) =>
    [...m.entries()].sort((a, b) => b[1].hits - a[1].hits || a[0].localeCompare(b[0])).map(([k, h]) => ({ [label]: k, hits: h.hits, first: h.first }));
  const dedupe = <T extends { id?: string; path?: string }>(arr: T[], key: (t: T) => string) => { const seen = new Set<string>(); return arr.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }); };

  return {
    schema: FEATURES_SCHEMA,
    game,
    sources,
    screens: sortHits(screens, "screen") as unknown as FeatureMap["screens"],
    stateSwitches,
    domIds: dedupe(domIds, (d) => d.id).slice(0, 200),
    inputs: { keys: sortOne(keys, "key") as unknown as FeatureMap["inputs"]["keys"], listeners: sortOne(listeners, "event") as unknown as FeatureMap["inputs"]["listeners"] },
    audio: { apiUse: sortOne(audioApi, "api") as unknown as FeatureMap["audio"]["apiUse"], urls: dedupe(audioUrls, (u) => u.path).slice(0, 80), oscillatorTypes: [...oscTypes].sort(), oscillatorCalls: oscCalls, playCalls },
    storage: storage.slice(0, 80),
    network: network.slice(0, 120),
    platform: platform.slice(0, 40),
    three: { constructed: Object.fromEntries(Object.entries(constructed).sort(([a], [b]) => a.localeCompare(b))), imports: [...importNames].sort().slice(0, 200), importSources: [...importSources].sort().slice(0, 40) },
    shaders,
    postFx: sortHits(postFx, "word") as unknown as FeatureMap["postFx"],
    particles: sortHits(particles, "word") as unknown as FeatureMap["particles"],
    dataTables,
    assets: dedupe(assets, (a) => a.path).slice(0, 200),
    functions: functions.sort((a, b) => b.chars - a.chars).slice(0, 40),
    counts
  };
}

function stripQuery(s: string): string {
  return s.replace(/[?#].*$/, "");
}

// ---- porting-notes cross-check ------------------------------------------------------------------------

/** Pull the bullet lines of a PORTING-NOTES.md "Not ported"/"Gaps" section (headings are matched loosely). */
export function parseNotPorted(markdown: string): string[] {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let inSection = false;
  for (const line of lines) {
    if (/^#{1,4}\s/.test(line)) inSection = /not ported|gaps?|missing|limits?|differences|deviations?/i.test(line);
    else if (inSection) {
      const m = /^\s*(?:[-*]|\d+\.)\s+(.*\S)\s*$/.exec(line);
      if (m) out.push((m[1] as string).replace(/\s+/g, " ").slice(0, 220));
    }
  }
  return out.slice(0, 60);
}

export interface UnportedItem {
  readonly feature: string;
  readonly original: string;
  readonly port: "absent" | "present";
}

/** Compare the original's feature categories with keyword signals found in the port's own source text. */
export function compareWithPort(map: FeatureMap, portText: string): UnportedItem[] {
  const out: UnportedItem[] = [];
  const has = (re: RegExp) => re.test(portText);
  const audioHits = map.audio.apiUse.reduce((a, x) => a + x.hits, 0) + map.audio.urls.length;
  if (audioHits > 0) out.push({ feature: "audio", original: `${audioHits} audio API uses / ${map.audio.urls.length} audio assets`, port: has(/AudioContext|SpatialAudio|AudioBus|createOscillator|PositionalEmitter/) ? "present" : "absent" });
  for (const s of map.screens) {
    if (s.hits < 2) continue;
    const re = new RegExp(s.screen.replace("-", "[- ]?"), "i");
    out.push({ feature: `screen:${s.screen}`, original: `${s.hits} references`, port: has(re) ? "present" : "absent" });
  }
  if (map.postFx.length > 0) out.push({ feature: "post-processing", original: map.postFx.slice(0, 4).map((p) => `${p.word}x${p.hits}`).join(", "), port: has(/effects\.|shaderPass|bloom|PostPass/i) ? "present" : "absent" });
  if (map.particles.length > 0) out.push({ feature: "particles", original: map.particles.slice(0, 4).map((p) => `${p.word}x${p.hits}`).join(", "), port: has(/particle|points\(|sprites?\b|spark|emitter/i) ? "present" : "absent" });
  if (map.storage.length > 0) out.push({ feature: "persistence (storage)", original: `${map.storage.length} storage calls`, port: has(/localStorage|sessionStorage|indexedDB/) ? "present" : "absent" });
  const keyCount = map.inputs.keys.length;
  if (keyCount > 0) out.push({ feature: "keyboard bindings", original: map.inputs.keys.slice(0, 8).map((k) => k.key).join(", "), port: has(/keydown|KeyboardEvent|applyInput/) ? "present" : "absent" });
  if (map.inputs.listeners.some((l) => /touch|pointer|mouse/.test(l.event))) out.push({ feature: "pointer/touch input", original: map.inputs.listeners.filter((l) => /touch|pointer|mouse/.test(l.event)).map((l) => l.event).join(", "), port: has(/pointer|touch|mouse/i) ? "present" : "absent" });
  if (map.inputs.listeners.some((l) => /gamepad/.test(l.event)) || map.platform.some((p) => p.api === "getGamepads")) out.push({ feature: "gamepad", original: "gamepad API use", port: has(/gamepad/i) ? "present" : "absent" });
  if (map.platform.some((p) => p.api === "postMessage")) out.push({ feature: "host-platform postMessage hooks", original: `${map.platform.filter((p) => p.api === "postMessage").length} postMessage calls`, port: has(/postMessage/) ? "present" : "absent" });
  return out;
}
