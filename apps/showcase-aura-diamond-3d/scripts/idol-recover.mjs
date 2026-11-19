// Finish Idol jobs whose generate.mjs client gave up after its 20-minute poll while the fal queue was saturated: the paid
// request keeps running on fal, so this waits for it (by the request id in artifacts/idol/ledger.jsonl) and then runs the
// same post-processing generate.mjs does (skin refit, role-budget optimise, normalise, 4-view preview, provenance).
//   node apps/showcase-aura-diamond-3d/scripts/idol-recover.mjs --spec tools/idol/specs/aura-diamond-3d.json [--only k1,k2]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const spec = JSON.parse(readFileSync(resolve(root, opt("spec")), "utf8"));
const only = (opt("only", "") ?? "").split(",").filter(Boolean);
const CLI = join(root, "packages/aura3d-cli/dist/cli.js");
const ROLE_BUDGET = { prop: [6000, 1024], background: [15000, 1024], "set-dressing": [15000, 1024], character: [30000, 2048], hero: [40000, 2048], vehicle: [40000, 2048] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function falKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  for (const line of readFileSync(join(homedir(), ".config/auraone/fal.env"), "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?FAL_KEY\s*=\s*["']?([^"'\s]+)/);
    if (m) return m[1];
  }
  throw new Error("FAL_KEY missing");
}
const headers = { Authorization: `Key ${falKey()}` };
const cli = (argv) => { try { return { ok: true, out: execFileSync("node", [CLI, ...argv], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 }) }; } catch (e) { return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }; } };
const clean = (s) => String(s ?? "").split("\n").filter((l) => !l.startsWith("objc[")).join("\n").trim();
async function download(url, dest) { for (let a = 0; ; a++) { try { const r = await fetch(url); if (!r.ok) throw new Error(`download ${r.status}`); writeFileSync(dest, Buffer.from(await r.arrayBuffer())); return; } catch (e) { if (a >= 3) throw e; await sleep(3000); } } }

const ledger = readFileSync(join(root, "artifacts/idol/ledger.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.game === spec.game);
// generate.mjs only ledgers a request once it completes; a timed-out one is named in its log line "(request <id>)".
const fromLog = new Map();
for (const f of (opt("from-log", "") ?? "").split(",").filter(Boolean)) {
  for (const line of readFileSync(f, "utf8").split("\n")) {
    try { const r = JSON.parse(line); const m = /idol: timed out .*\(request ([0-9a-f-]+)\)/.exec(r.error ?? ""); if (m) fromLog.set(r.key, m[1]); } catch { /* not a result line */ }
  }
}
const lastIdol = (key) => (fromLog.has(key) ? { requestId: fromLog.get(key) } : ledger.filter((e) => e.key === key && e.model === "speridlabs/idol/max").at(-1));
const imageUsd = (key) => (ledger.some((e) => e.key === key && e.model.startsWith("openai/")) ? 0.17 : 0);

async function recover(item) {
  const outDir = resolve(root, item.outDir ?? spec.outDir);
  const finalGlb = join(outDir, `${item.key}.glb`);
  if (existsSync(finalGlb)) return { key: item.key, skipped: true };
  const entry = lastIdol(item.key);
  if (!entry) return { key: item.key, error: "no idol request in the ledger" };
  const base = `https://queue.fal.run/speridlabs/idol/requests/${entry.requestId}`;
  for (;;) {
    let s;
    try { s = await (await fetch(`${base}/status`, { headers })).json(); } catch { await sleep(15000); continue; }
    if (s.status === "COMPLETED") break;
    if (!["IN_QUEUE", "IN_PROGRESS"].includes(s.status)) return { key: item.key, error: `status ${JSON.stringify(s).slice(0, 200)}` };
    await sleep(20000);
  }
  const idol = await (await fetch(base, { headers })).json();
  if (!idol.game_glb?.url) return { key: item.key, error: `result ${JSON.stringify(idol).slice(0, 300)}` };
  const work = join(root, "artifacts/idol", spec.game, item.key);
  mkdirSync(work, { recursive: true }); mkdirSync(outDir, { recursive: true });
  writeFileSync(join(work, "idol-result.json"), JSON.stringify(idol, null, 1));
  const rawGlb = join(work, "game.glb");
  await download(idol.game_glb.url, rawGlb);
  const rig = Boolean(item.rig);
  let source = rawGlb, skin = null;
  if (rig) {
    if (!idol.rigged_character_glb?.url) return { key: item.key, error: `could not rig (${JSON.stringify(idol.rig)})` };
    const rigged = join(work, "rigged.glb");
    await download(idol.rigged_character_glb.url, rigged);
    const clips = (idol.rig?.animations ?? []).join(",");
    const refit = join(work, "refit.glb");
    const rep = cli(["assets", "repair-skin", rigged, "--out", refit, ...(clips ? ["--keep-clips", clips] : []), "--refit-skeleton", "--smooth-bridges"]);
    source = existsSync(refit) ? refit : rigged;
    const val = cli(["assets", "validate", "--skin", source]);
    skin = { pass: val.ok, repaired: source === refit, report: clean(val.out).split("\n").slice(0, 6).join("\n"), repairLog: clean(rep.out).split("\n").slice(-4).join("\n") };
  }
  const role = item.role ?? (rig ? "character" : "prop");
  const [maxVerts, tex] = ROLE_BUDGET[role] ?? ROLE_BUDGET.prop;
  const optGlb = join(work, "opt.glb");
  // `assets optimize --role` takes hero|vehicle|character|prop|background: set-dressing optimises as background (same budget)
  const cliRole = role === "set-dressing" ? "background" : ROLE_BUDGET[role] ? role : "prop";
  const o = cli(["assets", "optimize", "--file", source, "--out", optGlb, "--role", cliRole,
    "--max-verts", String(item.maxVerts ?? maxVerts), "--tex", String(item.tex ?? tex), ...(rig || item.noSimplify ? ["--no-simplify"] : [])]);
  if (!existsSync(optGlb)) return { key: item.key, error: `optimise failed ${clean(o.out).slice(-400)}` };
  const { normalizeGlb } = await import(join(root, "tools/idol/normalize.mjs"));
  const norm = await normalizeGlb(optGlb, finalGlb, { front: item.front ?? "+x", size: item.size, yawDeg: item.yawDeg ?? 0, provenance: { generator: "idol", key: item.key } });
  const views = join(work, "views.png");
  try { execFileSync("python3", ["-I", join(root, "tools/idol/render-views.py"), finalGlb, views], { stdio: "ignore", timeout: 600_000 }); } catch { /* advisory */ }
  const idolUsd = rig ? 0.25 : 0.2;
  const prov = {
    schema: "aura3d.idol-provenance/1", game: spec.game, key: item.key, generatedAt: new Date().toISOString(),
    generator: "tools/idol/generate.mjs (finished by apps/showcase-aura-diamond-3d/scripts/idol-recover.mjs after the client poll timed out)",
    terms: "fal.ai model output; speridlabs/idol/max lists commercial use as supported. Generated for this project; no third-party likeness, brand or logo requested.",
    steps: [{ step: "idol", model: "speridlabs/idol/max", requestId: entry.requestId, usd: idolUsd, meshStats: idol.mesh_stats, rig: idol.rig ?? null }],
    role, rig, skin, normalized: norm, finalGlb: relative(root, finalGlb), sizeBytes: readFileSync(finalGlb).length,
    preview: existsSync(views) ? relative(root, views) : null, usd: Number((imageUsd(item.key) + idolUsd).toFixed(2))
  };
  writeFileSync(join(outDir, `${item.key}.idol.json`), JSON.stringify(prov, null, 2) + "\n");
  return { key: item.key, finalGlb: prov.finalGlb, sizeMB: +(prov.sizeBytes / 1e6).toFixed(2), skin: skin ? (skin.pass ? "pass" : "FAIL") : undefined, dims: norm.size };
}

const items = spec.items.filter((i) => !only.length || only.includes(i.key));
await Promise.all(items.map(async (item) => {
  try { console.log(JSON.stringify(await recover(item))); } catch (e) { console.log(JSON.stringify({ key: item.key, error: String(e.message ?? e).slice(0, 400) })); }
}));
console.log("recover done");
