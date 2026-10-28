// Numeric-row tally for the head-to-head benchmark. Mirrors the rows that harness/report.mjs counts in
// "Tally of numeric rows" (sections 1 to 9), so a 4.3.7+ results file is scored the same way as 4.1.2.
//
// Verdict rule (unchanged from the benchmark README): lower is better, within the tolerance is a tie,
// a missing or non-numeric side is unmeasurable.
import { auraRun } from "../shared/arms.mjs";

export const SCENES = ["pbr-viewer", "forest", "skinned-character", "game-loop", "shader-water"];
export const ALL_SCENES = ["baseline", ...SCENES];
export const TIE = 0.05;

export function verdict(three, aura, tol = TIE) {
  const bad = (v) => v === null || v === undefined || Number.isNaN(v);
  if (bad(three) || bad(aura)) return "unmeasurable";
  const base = Math.max(Math.abs(three), Math.abs(aura), 1e-9);
  if (Math.abs(three - aura) / base <= tol) return "tie";
  return aura < three ? "Aura3D better" : "three.js better";
}

/** Successful-response network totals for one run, same definition as report.mjs section 5. */
export function networkOf(run) {
  const reqs = run?.requests;
  if (!reqs) return null;
  const ok = reqs.filter((r) => r.status < 400);
  const js = ok.filter((r) => /\.m?js$/.test(r.path));
  return {
    count: ok.length,
    failed: reqs.length - ok.length,
    bytes: ok.reduce((a, r) => a + r.bytes, 0),
    jsBytes: js.reduce((a, r) => a + r.bytes, 0),
    jsCount: js.length
  };
}

/**
 * @param results  parsed results.json (`scenes.<scene>.results.<arm>`)
 * @param statics  parsed static-metrics.json (`apps["<scene>/<three|aura>"].scene`)
 * @returns {{ tally: Record<string, number>, rows: Array<{section: string, scene: string, three: unknown, aura: unknown, verdict: string}>, totalRows: number }}
 */
export function computeTally(results, statics) {
  const tally = { "Aura3D better": 0, "three.js better": 0, tie: 0, unmeasurable: 0 };
  const rows = [];
  const add = (section, scene, three, aura, tol) => {
    const v = verdict(three, aura, tol);
    tally[v] += 1;
    rows.push({ section, scene, three, aura, verdict: v });
  };
  const sceneResults = (scene) => results?.scenes?.[scene]?.results;
  const threeRun = (scene) => sceneResults(scene)?.three;
  const msaaRun = (scene) => sceneResults(scene)?.["three-msaa"];
  const aRun = (scene) => auraRun(sceneResults(scene) ?? {});
  const stat = (scene, lib) => statics?.apps?.[`${scene}/${lib}`]?.scene;

  for (const s of ALL_SCENES) add("1 loc", s, stat(s, "three")?.loc, stat(s, "aura")?.loc, TIE);
  for (const s of ALL_SCENES) add("2 tokens", s, stat(s, "three")?.tokens, stat(s, "aura")?.tokens, TIE);
  for (const s of ALL_SCENES) {
    add("3 modules", s, stat(s, "three")?.distinctModules, stat(s, "aura")?.distinctModules, 0);
    add("3 symbols", s, stat(s, "three")?.distinctSymbols, stat(s, "aura")?.distinctSymbols, TIE);
  }
  for (const [name, key] of [["4a raw", "raw"], ["4b gzip", "gzip"], ["4c brotli", "brotli"]]) {
    for (const s of ALL_SCENES) add(name, s, threeRun(s)?.build?.bundle?.[key], aRun(s)?.build?.bundle?.[key], TIE);
  }
  for (const s of ALL_SCENES) add("4d largest chunk", s, threeRun(s)?.build?.bundle?.largestChunk?.raw, aRun(s)?.build?.bundle?.largestChunk?.raw, TIE);
  for (const s of ALL_SCENES) add("5a requests", s, networkOf(threeRun(s))?.count, networkOf(aRun(s))?.count, 0);
  for (const s of ALL_SCENES) add("5b js bytes", s, networkOf(threeRun(s))?.jsBytes, networkOf(aRun(s))?.jsBytes, TIE);
  for (const s of ALL_SCENES) add("5c total bytes", s, networkOf(threeRun(s))?.bytes, networkOf(aRun(s))?.bytes, TIE);
  for (const s of ALL_SCENES) add("6 ttff", s, threeRun(s)?.ttffMs?.median, aRun(s)?.ttffMs?.median, TIE);
  for (const s of ALL_SCENES) add("7a frame median", s, threeRun(s)?.totalMs?.median, aRun(s)?.totalMs?.median, TIE);
  for (const s of ALL_SCENES) add("7b frame p95", s, threeRun(s)?.totalMs?.p95, aRun(s)?.totalMs?.p95, TIE);
  for (const s of ALL_SCENES) add("7c cpu median", s, threeRun(s)?.cpuMs?.median, aRun(s)?.cpuMs?.median, TIE);
  for (const s of ALL_SCENES) add("7d frame, equal AA", s, msaaRun(s)?.totalMs?.median, aRun(s)?.totalMs?.median, TIE);
  for (const s of ALL_SCENES) add("7e ttff, equal AA", s, msaaRun(s)?.ttffMs?.median, aRun(s)?.ttffMs?.median, TIE);
  for (const s of ALL_SCENES) add("8a draws", s, threeRun(s)?.perFrame?.draws, aRun(s)?.perFrame?.draws, 0.1);
  for (const s of ALL_SCENES) add("8b triangles", s, threeRun(s)?.perFrame?.tris, aRun(s)?.perFrame?.tris, 0.1);
  for (const s of ALL_SCENES) add("8c programs", s, threeRun(s)?.perFrame?.programs, aRun(s)?.perFrame?.programs, 0);
  // Section 9: there is no ground-truth image, so every scene with a correctness block is one unmeasurable row.
  for (const s of SCENES) {
    if (!results?.scenes?.[s]?.correctness) continue;
    tally.unmeasurable += 1;
    rows.push({ section: "9 correctness", scene: s, three: null, aura: null, verdict: "unmeasurable" });
  }
  return { tally, rows, totalRows: rows.length };
}
