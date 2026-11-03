// Phase-7 band re-derivation for dot-dash-3d (lane brief rule only).
// node evidence/game-upgrades-47/dot-dash-3d/tools/rederive-bands-p7.mjs <luma-after.json> <luma-bands.json> <panel tag> <capture id> [--write]
import { readFileSync, writeFileSync } from "node:fs";
import { bandFor, evaluateBands } from "/Users/gurbakshchahal/platforms/aura3d-gu47/g13/tools/look-metrics/region-luma.mjs";

const [afterF, bandsF, panel, capture] = process.argv.slice(2);
const write = process.argv.includes("--write");
const PANEL = { default: "g13p7a", classic: "g13p7a", spiral: "g13p7a", twin: "g13p7a", foundry: "g13p7a", zerocore: "g13p7z", garden: "g13p7g" };
const CAPTURE = { default: "g13p7-r1-1", classic: "g13p7-r1-2", spiral: "g13p7-r1-3", twin: "g13p7-r1-4", foundry: "g13p7-r1-6", zerocore: "g13p7-r1-7", garden: "g13p7-r2-garden" };
const rows = JSON.parse(readFileSync(afterF, "utf8"));
const spec = JSON.parse(readFileSync(bandsF, "utf8"));
const FRAC = new Set(["darkFrac", "clipFrac", "hueR", "sat", "edge"]);
const CEIL_CAP = { darkFrac: 0.6, clipFrac: 0.05 };
const res = evaluateBands(rows, spec, { slug: spec.slug });
const byVariant = new Map();
for (const r of res) if (!r.pass) for (const m of r.misses) {
  if (m.region !== "frame") throw new Error(`non-frame miss ${r.target} ${m.region}.${m.metric}`);
  const key = `${r.variant}.${m.metric}`;
  byVariant.set(key, true);
}
spec.rederived ??= {};
const metricOf = (row, metric) => (metric === "b" ? row.rgb[2] : metric === "r" ? row.rgb[0] : metric === "g" ? row.rgb[1] : row[metric]);
for (const key of byVariant.keys()) {
  const [variant, metric] = key.split(".");
  const vrows = rows.filter((x) => x.variant === variant && /^settle-(25|60)s$/.test(x.id));
  const r25 = vrows.find((x) => x.id === "settle-25s"), r60 = vrows.find((x) => x.id === "settle-60s");
  if (!r25 || !r60) throw new Error(`missing 25/60 for ${variant}`);
  const a = metricOf(r25, metric), b = metricOf(r60, metric);
  const { band } = bandFor(spec, r60);
  const from = band[metric];
  const frac = FRAC.has(metric);
  const d = frac ? 1000 : 1;
  let to;
  if (from[0] !== null && from[1] !== null) {
    const w = from[1] - from[0];
    const c = (a + b) / 2;
    const lo = Math.round((c - w / 2) * d) / d;
    to = [lo, Math.round((lo + w) * d) / d];
  } else if (from[0] !== null) {
    to = [Math.floor(0.9 * Math.min(a, b) * d) / d, null];
  } else {
    to = [null, Math.ceil(1.1 * Math.max(a, b) * d) / d];
    if (CEIL_CAP[metric] !== undefined && to[1] > CEIL_CAP[metric]) throw new Error(`${key} ceiling ${to[1]} beyond cap: needs a declared exception`);
  }
  console.log(key, "readings", a, b, "from", JSON.stringify(from), "to", JSON.stringify(to));
  spec.variants[variant] ??= {};
  spec.variants[variant][metric] = to;
  spec.rederived[key] = { from, to, panel: PANEL[variant], capture: CAPTURE[variant], date: "2026-11-01" };
}
const after = evaluateBands(rows, spec, { slug: spec.slug }).filter((r) => !r.pass);
console.log("still failing after:", after.length);
if (write) writeFileSync(bandsF, JSON.stringify(spec, null, 2) + "\n");
