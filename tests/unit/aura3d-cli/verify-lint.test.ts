import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { FOG_VALID_OPTIONS, INSTANCES_MODEL_UNAPPLIED_OPTIONS, RESERVED_UNIFORM_NAMES, lintSources } from "../../../packages/aura3d-cli/src/verify/lint.js";

const lint = (text: string, extra: { path: string; text: string }[] = [], options = {}) => lintSources([{ path: "src/main.ts", text }, ...extra], options);
const codes = (text: string, extra: { path: string; text: string }[] = []) => lint(text, extra).map((f) => f.code);

describe("verify lint rules", () => {
  test("shadow light with only receiver-off surfaces fires; a default primitive receives", () => {
    const flat = `const m = material.custom({ glsl: { fragment: "void main(){}" } });`;
    const bad = `${flat}\nlights.directional({ position: [1, 2, 3], shadow: true });\nprimitives.plane({ name: "floor", material: m });`;
    expect(lint(bad).map((f) => f.code)).toEqual(["LINT_SHADOW_NO_RECEIVER"]);
    expect(lint(bad)[0]).toMatchObject({ location: { file: "src/main.ts", line: 2 } });
    // a default primitive receives shadows, so the light does something
    expect(codes(`lights.directional({ shadow: true });\nprimitives.plane({ name: "floor", material: material.pbr({}) });`)).toEqual([]);
    expect(codes(`${bad}\nprimitives.box({ name: "b" });`)).toEqual([]);
    // custom material that opts in
    expect(codes(`const m = material.custom({ receiveShadow: true, glsl: { fragment: "void main(){}" } });\nlights.directional({ shadow: true });\nprimitives.plane({ material: m });`)).toEqual([]);
    // explicit receiveShadow: false on every surface
    expect(codes(`lights.spot({ shadow: { bias: 0.001 } });\nprimitives.plane({ receiveShadow: false });\nprimitives.box({ receiveShadow: false });`)).toEqual(["LINT_SHADOW_NO_RECEIVER"]);
    // shadow off, or no surface builders visible (nodes come from a helper): no evidence, no finding
    expect(codes(`lights.directional({ shadow: false });\nprimitives.plane({ receiveShadow: false });`)).toEqual([]);
    expect(codes(`lights.directional({ shadow: true });`)).toEqual([]);
  });

  test("sky plus a background colour fires, a background taken from the sky does not", () => {
    expect(codes(`scene().background("#123456").add(sky.preetham({}));`)).toEqual(["LINT_SKY_HIDES_BACKGROUND"]);
    expect(codes(`scene({ background: "#123" }).add(sky.gradient({}));`)).toEqual(["LINT_SKY_HIDES_BACKGROUND"]);
    expect(codes(`const s = sky.dayNight({}); scene().background(s.background);`)).toEqual([]);
    expect(codes(`scene().background("#123456");`)).toEqual([]);
  });

  test("uniforms the GLSL never reads, and reserved names", () => {
    const src = `material.custom({ glsl: { fragment: \`out vec4 outColor; void main(){ outColor = vec4(used); }\` }, uniforms: { used: "f32", dead: "f32" } });`;
    expect(lint(src)).toMatchObject([{ code: "LINT_SHADER_UNIFORM_UNREAD" }]);
    expect(lint(src)[0]!.message).toContain('"dead"');
    const reserved = `material.custom({ glsl: { fragment: "void main(){}" }, uniforms: { uTime: "f32" } });`;
    expect(codes(reserved)).toEqual(["LINT_UNIFORM_RESERVED"]);
    // a shader that is not statically resolvable never produces an "unread" claim
    expect(codes(`const f = loadShader(); material.custom({ glsl: { fragment: f }, uniforms: { a: "f32" } });`)).toEqual([]);
    // an alias counts as a read
    expect(codes(`material.custom({ glsl: { fragment: "float x = shaderName;" }, uniforms: { a: "f32" }, uniformAliases: { a: "shaderName" } });`)).toEqual([]);
  });

  test("resolves shader text through a const and a template with substitutions", () => {
    const src = "const frag = `${prelude} void main(){ x = used; }`;\nmaterial.custom({ glsl: { fragment: frag }, uniforms: { used: \"f32\", dead: \"f32\" } });";
    expect(lint(src).map((f) => f.code)).toEqual(["LINT_SHADER_UNIFORM_UNREAD"]);
  });

  test("attributes no shader reads", () => {
    const src = `material.custom({ glsl: { vertex: "in float aPhase; void main(){ float p = aPhase; }", fragment: "void main(){}" } });\ngeometry.dynamic({ positions: [], attributes: { aPhase: x, aSpeed: y } });`;
    const found = lint(src);
    expect(found).toMatchObject([{ code: "LINT_SHADER_ATTRIBUTE_UNREAD" }]);
    expect(found[0]!.message).toContain("aSpeed");
  });

  test("effects options the lowering ignores", () => {
    expect(lint(`effects.fog({ color: "#fff", density: 0.02, particleCount: 500 });`)).toMatchObject([{ code: "LINT_EFFECT_OPTION_IGNORED", location: { line: 1 } }]);
    expect(codes(`effects.fog({ color: "#fff", density: 0.02, heightFalloff: 1 });`)).toEqual([]);
    expect(codes(`instances.model(assets.tree, { count: 3, lod: [1, 2] });`)).toEqual(["LINT_EFFECT_OPTION_IGNORED"]);
    expect(codes(`effects.fog({ color: "#fff", particleCount: undefined });`)).toEqual([]);
  });

  test("a uTime shader needs onFrame and a mutable node to be driven", () => {
    const shader = `material.custom({ glsl: { fragment: "out vec4 o; void main(){ o = vec4(sin(uTime)); }" } });`;
    expect(codes(shader)).toEqual(["LINT_UTIME_NOT_ANIMATED"]);
    expect(codes(`${shader}\nnode.runtime({ id: "w", mutable: true });\napp.onFrame(() => {});`)).toEqual([]);
    expect(codes(`material.custom({ glsl: { fragment: "out vec4 o; void main(){ o = vec4(waveClock); }" }, uniforms: { waveClock: "f32" } });`)).toEqual([]);
  });

  test("app.ready() must be awaited or chained", () => {
    expect(codes(`const app = createAuraApp("#app", {});`)).toEqual(["LINT_READY_NOT_AWAITED"]);
    expect(codes(`createAuraApp("#app", {});`)).toEqual([]);
    expect(codes(`async function main() { const app = createAuraApp("#app", {}); await app.ready(); }`)).toEqual([]);
    // module-level await can deadlock a single-entry bundle
    expect(codes(`const app = createAuraApp("#app", {}); await app.ready();`)).toEqual(["LINT_TOP_LEVEL_AWAIT_READY"]);
    expect(codes(`const app = createAuraApp("#app", {}); app.ready().then(() => {});`)).toEqual([]);
    // anything awaited at module scope that waits on the mount deadlocks the same way
    for (const wait of ["app.ready().then(() => {})", "Promise.all([app.ready(), 1])", "app.readyStrict()", "app.readiness({ stage: \"first-frame\" })", "game.ready()", "warmPrograms(app)", "app.precompile()"]) {
      expect(codes(`const app = createAuraApp("#app", {}); void app.ready(); await ${wait};`), wait).toEqual(["LINT_TOP_LEVEL_AWAIT_READY"]);
    }
    expect(codes(`const app = createAuraApp("#app", {}); void app.ready(); await fetch("/x"); const later = async () => { await app.ready(); };`)).toEqual([]);
    expect(codes(`const app = createAuraApp("#app", {}); app.ready();`)).toEqual(["LINT_READY_NOT_AWAITED"]);
  });

  test("scale off by orders of magnitude, and a camera inside a big node", () => {
    expect(codes(`primitives.box({ name: "crate" }).position(0, 0.5, 0).scale(100);`)).toEqual(["LINT_SCALE_EXTREME"]);
    expect(codes(`primitives.box({ name: "tiny" }).scale(0.01);`)).toEqual(["LINT_SCALE_EXTREME"]);
    expect(codes(`primitives.plane({ name: "ground" }).scale(400);`)).toEqual([]);
    expect(codes(`primitives.sphere({ name: "ball" }).scale(1.2);`)).toEqual([]);
    expect(codes(`primitives.sphere({ name: "hero" }).scale(20);\ncamera.orbit({ target: [0, 0, 0], distance: 4 });`)).toEqual(["LINT_CAMERA_INSIDE_OBJECT"]);
    expect(codes(`primitives.sphere({ name: "hero" }).scale(20);\ncamera.orbit({ target: [0, 0, 0], distance: 30 });`)).toEqual([]);
    expect(codes(`primitives.sphere({ name: "hero" }).position(50, 0, 0).scale(20);\ncamera.perspective({ position: [0, 3, 8], target: [0, 0, 0] });`)).toEqual([]);
  });

  test("asset checks: hand-written entry with no file, unknown key, and a string path", () => {
    const assetsFile = { path: "src/aura-assets.ts", text: `export const assets = defineAuraAssets({ robot: { type: "model", url: "/aura-assets/robot.glb" }, tree: { type: "model", url: "https://cdn.example.com/tree.glb" } });` };
    const main = `scene().add(model(assets.robot)).add(model(assets.drone));`;
    const found = lintSources([{ path: "src/main.ts", text: main }, assetsFile], { group: "assets", fileExists: () => false });
    expect(found.map((f) => f.code).sort()).toEqual(["ASSET_KEY_UNKNOWN", "ASSET_PATH_INVENTED"]);
    expect(lintSources([{ path: "src/main.ts", text: main }, assetsFile], { group: "assets", fileExists: (url) => url === "/aura-assets/robot.glb" }).map((f) => f.code)).toEqual(["ASSET_KEY_UNKNOWN"]);
    expect(lintSources([{ path: "src/x.ts", text: `model("/models/a.glb");` }], { group: "assets" }).map((f) => f.code)).toEqual(["ASSET_PATH_INVENTED"]);
  });

  test("scene and asset groups run independently", () => {
    const src = `const app = createAuraApp("#a", {});\nmodel("/m.glb");`;
    expect(lintSources([{ path: "src/a.ts", text: src }], { group: "assets" }).map((f) => f.code)).toEqual(["ASSET_PATH_INVENTED"]);
    expect(lintSources([{ path: "src/a.ts", text: src }], { group: "scene" }).map((f) => f.code)).toEqual(["LINT_READY_NOT_AWAITED"]);
  });
});

describe("lint tables stay in step with the engine", () => {
  const engine = (path: string) => readFileSync(new URL(`../../../packages/engine/src/agent-api/${path}`, import.meta.url), "utf8");
  test("reserved uniform names equal RESERVED_UNIFORM_NAMES in customMaterial.ts", () => {
    // invariant: source must keep `const RESERVED_UNIFORM_NAMES = new Set([...])` in customMaterial.ts — LINT_UNIFORM_RESERVED must flag exactly the names the engine rejects, so a renamed or reshaped table fails here instead of drifting silently
    const block = /const RESERVED_UNIFORM_NAMES = new Set\(\[([\s\S]*?)\]\)/.exec(engine("compiler/customMaterial.ts"))![1]!;
    expect([...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort()).toEqual([...RESERVED_UNIFORM_NAMES].sort());
  });
  test("fog options equal FOG_OPTION_KEYS in effects.ts", () => {
    // invariant: source must keep `export const FOG_OPTION_KEYS: readonly string[] = [...]` in nodes/effects.ts — the fog option lint must accept exactly the keys the engine applies
    const block = /export const FOG_OPTION_KEYS: readonly string\[\] = \[([\s\S]*?)\];/.exec(engine("nodes/effects.ts"))![1]!;
    expect([...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort()).toEqual([...FOG_VALID_OPTIONS].sort());
  });
  test("instances.model unapplied options equal the engine set", () => {
    // invariant: source must keep `const UNAPPLIED_INSTANCED_MODEL_OPTIONS = { ... }` in nodes/instances.ts — the lint must warn on exactly the instances.model options the engine ignores
    const block = /const UNAPPLIED_INSTANCED_MODEL_OPTIONS[^=]*= \{([\s\S]*?)\n\};/.exec(engine("nodes/instances.ts"))![1]!;
    expect([...block.matchAll(/^  (\w+):/gm)].map((m) => m[1]).sort()).toEqual([...INSTANCES_MODEL_UNAPPLIED_OPTIONS].sort());
  });
});
