import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** The original game scripts are hand-written UMD modules; the UI tests evaluate them as data (CommonJS shim) to compare behaviour. */
const dir = resolve(process.cwd(), "tests/fixtures/aura-slam-original/toptennis");
const cache = new Map<string, unknown>();
function require(spec: string): any {
  const file = resolve(dir, spec.endsWith(".js") ? spec : `${spec}.js`);
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} as unknown };
  new Function("module", "exports", "require", readFileSync(file, "utf8"))(module, module.exports, require);
  cache.set(file, module.exports);
  return module.exports;
}
export const originalEngine = require(`match-engine.js`) as {
  create(options?: Record<string, unknown>): any;
  capabilities: Record<string, unknown>;
  SHOT: Record<string, number>;
};
export const originalPhysics = require(`physics.js`) as { speedKph(ball: unknown): number };
export const originalResults = require(`match-results.js`) as { summarize(state: unknown, names?: unknown): any };
export const originalControls = require(`controls.js`) as { create(options?: { storage?: unknown }): any };

export function memoryStorage(): { store: Map<string, string>; getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const store = new Map<string, string>();
  return { store, getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } };
}

/** An original engine mid-match: serve, rally or point in progress after `steps` fixed steps with a scripted swing. */
export function playedEngine(steps: number, options: Record<string, unknown> = {}): any {
  const engine = originalEngine.create({ ...options });
  engine.resetMatch({ difficulty: "club", venue: "hard", ...options });
  engine.state.mode = "playing";
  for (let i = 0; i < steps; i++) {
    if (i === 10 || i === 140) engine.requestSwing("player", engine.state.time, false);
    engine.step(1 / 60);
  }
  return engine;
}
