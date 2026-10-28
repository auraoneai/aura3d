import { readFileSync } from "node:fs";
const frames = 400;
const load = (f) => {
  const line = readFileSync(f, "utf8").split("\n").map((l) => { const i = l.indexOf("FRAME_COST_PROFILE_INCLUSIVE "); return i >= 0 ? l.slice(i) : l; }).find((l) => l.startsWith("FRAME_COST_PROFILE_INCLUSIVE "));
  const out = new Map();
  for (const e of JSON.parse(line.slice("FRAME_COST_PROFILE_INCLUSIVE ".length))) {
    const key = e.fn.replace(/:\d+$/, "").replace(/ @ .*$/, "");
    out.set(key, Math.max(out.get(key) ?? 0, e.ms));
  }
  return out;
};
const base = load(process.argv[2]);
const neu = load(process.argv[3]);
const want = ["step", "frame", "renderFrame", "execute", "warmGeneratedProgramsSync", "advance", "updateCompiledSceneReal", "createProductionRuntimeRendererInput", "programKey", "computeProgramKey", "getDiagnostics", "addPasses", "collect", "runPhase", "drawItem", "active", "readPixels", "finish", "measure"];
console.log("function".padEnd(40), "base ms/frame", "new ms/frame");
for (const k of want) console.log(k.padEnd(40), base.has(k) ? (base.get(k) / frames).toFixed(3) : "-", neu.has(k) ? (neu.get(k) / frames).toFixed(3) : "-");
