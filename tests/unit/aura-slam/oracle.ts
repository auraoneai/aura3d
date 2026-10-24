import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { AI_ENV_NAMES, AI_OWNED_NAMES, createAiModule } from "../../../examples/aura-slam/sim/ai";
import { createMatchEngine } from "../../../examples/aura-slam/sim/create";
import { SWIPE_ENV_NAMES, SWIPE_OWNED_NAMES, createSwipeModule } from "../../../examples/aura-slam/sim/swipe";

const EXPOSE_NAMES = () => [...AI_OWNED_NAMES, ...SWIPE_OWNED_NAMES].join(",");
const DIR = join(process.cwd(), "tests/fixtures/aura-slam-original/toptennis");
const SOURCE = readFileSync(join(DIR, "match-engine.js"), "utf8");

export type OracleEngine = Record<string, any> & { state: any };
export interface OracleFactory { create(options?: Record<string, unknown>): OracleEngine }

function transform(): string {
  const sf = ts.createSourceFile("match-engine.js", SOURCE, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS);
  let create: ts.FunctionDeclaration | undefined;
  (function visit(n: ts.Node) { if (ts.isFunctionDeclaration(n) && n.name?.text === "create") create = n; ts.forEachChild(n, visit); })(sf);
  if (!create?.body) throw new Error("create() not found");
  const owned = new Set([...AI_OWNED_NAMES, ...SWIPE_OWNED_NAMES]);
  const cuts: Array<[number, number]> = [];
  let stateEnd = -1;
  for (const st of create.body.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && owned.has(st.name.text)) cuts.push([st.getStart(), st.getEnd()]);
    if (ts.isVariableStatement(st)) {
      const names = st.declarationList.declarations.map((d) => (ts.isIdentifier(d.name) ? d.name.text : ""));
      if (names.some((n) => owned.has(n))) cuts.push([st.getStart(), st.getEnd()]);
      if (names.includes("state")) stateEnd = st.getEnd();
    }
  }
  if (stateEnd < 0) throw new Error("state declaration not found");
  const getters = (names: readonly string[]) => names.map((n) => `get ${n}(){return ${n};}`).join(",");
  const inject = `\nconst __aiEnv={${getters(AI_ENV_NAMES)}};const __ai=options.__aiInject.createAiModule(__aiEnv);\nconst {${AI_OWNED_NAMES.join(",")}}=__ai;\n`
    + `const __swEnv={${getters(SWIPE_ENV_NAMES)}};const __sw=options.__aiInject.createSwipeModule(__swEnv);\nconst {${SWIPE_OWNED_NAMES.join(",")}}=__sw;\n`;
  // apply edits from the end
  const edits: Array<[number, number, string]> = [...cuts.map((c) => [c[0], c[1], ""] as [number, number, string]), [stateEnd, stateEnd, inject]];
  edits.sort((a, b) => b[0] - a[0]);
  let code = SOURCE;
  for (const [s, e, t] of edits) code = code.slice(0, s) + t + code.slice(e);
  return code;
}

const umdCache = new Map<string, any>();
/** The game scripts are UMD files inside a `"type": "module"` package, so Node would load them as ESM; evaluate them as CJS instead. */
function loadUmd(file: string, code?: string): any {
  const key = file;
  if (!code && umdCache.has(key)) return umdCache.get(key);
  const text = code ?? readFileSync(join(DIR, file), "utf8");
  const mod: { exports: any } = { exports: {} };
  const req = (id: string) => { if (id.startsWith("./")) return loadUmd(id.slice(2)); return createRequire(import.meta.url)(id); };
  new Function("module", "require", "globalThis", text)(mod, req, globalThis);
  if (!code) umdCache.set(key, mod.exports);
  return mod.exports;
}

function load(code: string): { Engine: OracleFactory & Record<string, any> } {
  return { Engine: loadUmd("match-engine.js", code) };
}

function exposeReturn(code: string): string {
  const marker = "  return {state,SHOT,SERVE,capabilities,resetMatch,";
  if (!code.includes(marker)) throw new Error("return marker not found");
  return code.replace(marker, `  return {__fn:{${EXPOSE_NAMES()}},__aiEnv:(typeof __aiEnv==='undefined'?undefined:__aiEnv),state,SHOT,SERVE,capabilities,resetMatch,`);
}

export function pristineEngine(): OracleFactory & Record<string, any> {
  return load(exposeReturn(SOURCE)).Engine;
}

export interface InjectedHooks { calls: Map<string, number> }
export function injectedEngine(hooks?: InjectedHooks): OracleFactory {
  const code = exposeReturn(transform());
  const { Engine } = load(code);
  const aiInject = {
    createAiModule: (env: any) => {
      const m: Record<string, any> = createAiModule(env) as any;
      if (!hooks) return m;
      const wrapped: Record<string, any> = {};
      for (const [k, v] of Object.entries(m)) wrapped[k] = typeof v === "function" ? (...a: any[]) => { hooks.calls.set(k, (hooks.calls.get(k) ?? 0) + 1); return v(...a); } : v;
      return wrapped;
    },
    createSwipeModule: (env: any) => {
      const m: Record<string, any> = createSwipeModule(env) as any;
      if (!hooks) return m;
      const wrapped: Record<string, any> = {};
      for (const [k, v] of Object.entries(m)) wrapped[k] = typeof v === "function" ? (...a: any[]) => { hooks.calls.set("sw." + k, (hooks.calls.get("sw." + k) ?? 0) + 1); return v(...a); } : v;
      return wrapped;
    },
  };
  return { create: (options = {}) => Engine.create({ ...options, __aiInject: aiInject }) };
}

/** The shipped engine (sim/create.ts: engine.ts wired to ai.ts, swipe.ts, serve.ts and the typed physics/strokes). Set SLAM_ENGINE=shipped to run the M-AI suites against it. */
export const useShipped = process.env.SLAM_ENGINE === "shipped";
export function shippedEngine(): OracleFactory {
  return { create: (options = {}) => (createMatchEngine as any)({ ...options, exposeInternals: true }) };
}
