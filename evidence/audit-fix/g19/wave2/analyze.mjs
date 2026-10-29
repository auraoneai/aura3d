// Decode HP_META / HP_GRID / HP_JPG lines from remote acr-run logs and compare arms.
// Usage: node analyze.mjs <outDir> <label>=<acr-run.log> ...
// The "model" mask is every 4x4 block whose luma differs by more than 3 between the 4.3.7 frame and the 4.5.0 base
// frame (no environment): only the lit PBR models change there, the custom unlit shaders do not.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [outDir, ...pairs] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const runs = {};
for (const pair of pairs) {
  const [label, file] = pair.split("=");
  const text = readFileSync(file, "utf8");
  const metas = [], grids = {}, jpgs = {};
  for (const raw of text.split("\n")) {
    const line = raw.replace(/^.*?(HP_(META|GRID|JPG) )/, "$1");
    if (line.startsWith("HP_META ")) metas.push(JSON.parse(line.slice(8)));
    else if (line.startsWith("HP_GRID ")) { const [, arm, step, dim, b64] = line.trim().split(" "); grids[`${arm}@${step}`] = { dim, data: Buffer.from(b64, "base64") }; }
    else if (line.startsWith("HP_JPG ")) { const [, arm, step, part, b64] = line.trim().split(" "); const [i, n] = part.split("/").map(Number); const k = `${arm}@${step}`; (jpgs[k] ??= { n, parts: [] }).parts[i - 1] = b64; }
  }
  for (const [k, j] of Object.entries(jpgs)) if (j.parts.filter(Boolean).length === j.n) writeFileSync(join(outDir, `${label}__${k.replace("@", "__step")}.jpg`), Buffer.from(j.parts.join(""), "base64"));
  runs[label] = { metas, grids };
}
const all = Object.entries(runs).flatMap(([label, r]) => Object.entries(r.grids).map(([k, g]) => ({ key: `${label}:${k}`, step: k.split("@")[1], g })));
const ref = (step) => all.find((x) => x.key === `437:none@${step}`)?.g.data;
const base = (step) => all.find((x) => x.key === `base:none@${step}`)?.g.data;
const rows = [];
for (const x of all) {
  const r = ref(x.step), b = base(x.step);
  let mN = 0, mSum = 0, mRef = 0, wDiff = 0;
  for (let i = 0; i < x.g.data.length; i++) {
    wDiff += Math.abs(x.g.data[i] - (r?.[i] ?? 0));
    if (r && b && Math.abs(r[i] - b[i]) > 3) { mN++; mSum += x.g.data[i]; mRef += r[i]; }
  }
  const meta = runs[x.key.split(":")[0]].metas.find((m) => `${m.arm}@${m.step}` === x.key.split(":")[1]);
  rows.push({ key: x.key, step: Number(x.step), wholeMean: meta?.mean, maskBlocks: mN, maskMean: mN ? +(mSum / mN).toFixed(2) : null, maskRef437: mN ? +(mRef / mN).toFixed(2) : null, maskDelta: mN ? +((mSum - mRef) / mN).toFixed(2) : null, meanAbsDiffVs437: r ? +(wDiff / x.g.data.length).toFixed(2) : null });
}
rows.sort((a, b) => a.step - b.step || a.key.localeCompare(b.key));
writeFileSync(join(outDir, "compare.json"), JSON.stringify({ rows, metas: Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, r.metas])) }, null, 2) + "\n");
console.table(rows);
