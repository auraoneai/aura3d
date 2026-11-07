// usage: node compare-frames.mjs <frames-dir> <out.json>
// For every <slug>.base.png: mean absolute difference (0-255, RGB) of base vs base2 (noise floor) and base vs branch,
// plus the real-frame verdicts written by capture-games.mjs.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
const [dir, out] = process.argv.slice(2);
const raw = async (file) => { const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
const mad = (a, b) => { if (a.w !== b.w || a.h !== b.h) return null; let s = 0; for (let i = 0; i < a.data.length; i++) s += Math.abs(a.data[i] - b.data[i]); return s / a.data.length; };
const maxDiff = (a, b) => { let m = 0, over8 = 0; for (let i = 0; i < a.data.length; i++) { const d = Math.abs(a.data[i] - b.data[i]); if (d > m) m = d; if (d > 8) over8++; } return { max: m, fracOver8: over8 / a.data.length }; };
const center = (a) => { const x0 = Math.floor(a.w * 0.3), y0 = Math.floor(a.h * 0.3), cw = Math.floor(a.w * 0.4), ch = Math.floor(a.h * 0.4); let s = 0, s2 = 0, n = 0; for (let y = y0; y < y0 + ch; y++) for (let x = x0; x < x0 + cw; x++) { const o = (y * a.w + x) * 3; const l = 0.2126 * a.data[o] + 0.7152 * a.data[o + 1] + 0.0722 * a.data[o + 2]; s += l; s2 += l * l; n++; } const m = s / n; return { mean: m, sd: Math.sqrt(Math.max(0, s2 / n - m * m)) }; };
const isReal = (a) => { const c = center(a); return c.mean > 4 && c.sd > 6; };
const rows = [];
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".base.png")).sort()) {
  const slug = f.replace(".base.png", "");
  const p = (l) => path.join(dir, `${slug}.${l}.png`);
  if (!fs.existsSync(p("base2")) || !fs.existsSync(p("branch"))) { rows.push({ slug, missing: true }); continue; }
  const [b, b2, br] = await Promise.all([raw(p("base")), raw(p("base2")), raw(p("branch"))]);
  const b3 = fs.existsSync(p("base3")) ? await raw(p("base3")) : null;
  const verdict = (l) => JSON.parse(fs.readFileSync(path.join(dir, `${slug}.${l}.json`), "utf8"));
  rows.push({
    slug,
    madBaseVsBase2: mad(b, b2), madBaseVsBase3: b3 ? mad(b, b3) : null, madBaseVsBranch: mad(b, br), madBase2VsBranch: mad(b2, br), madBase3VsBranch: b3 ? mad(b3, br) : null,
    baseVsBranchDetail: maxDiff(b, br),
    realFrame: { base: isReal(b), base2: isReal(b2), base3: b3 ? isReal(b3) : null, branch: isReal(br) }, centerStats: { base: center(b), branch: center(br) },
    branchConsoleErrors: verdict("branch").consoleErrors ?? [],
    verifiedGameFrame: isReal(b) && isReal(b2) && isReal(br) && !(verdict("branch").consoleErrors ?? []).some((e) => /RENDERER_MOUNT_FAILED/.test(e)),
    meanLuma: { base: verdict("base").mean, branch: verdict("branch").mean }, sd: { base: verdict("base").sd, branch: verdict("branch").sd },
    title: verdict("branch").title
  });
}
fs.writeFileSync(out, JSON.stringify(rows, null, 1));
for (const r of rows) console.log(r.slug, r.missing ? "MISSING" : `base-vs-base ${r.madBaseVsBase2?.toFixed(3)}/${r.madBaseVsBase3?.toFixed(3)}  base-vs-branch ${r.madBaseVsBranch?.toFixed(3)}  real(${r.realFrame.base},${r.realFrame.base2},${r.realFrame.branch})  errs=${r.branchConsoleErrors.length}  VERIFIED=${r.verifiedGameFrame}`);
