#!/usr/bin/env node
/**
 * readback-triage.mjs — PRD-01 §11 item 5 / §15 Phase-2 checklist.
 *
 * Runs the §2.10a audit grep, resolves every hit's §4.1 owner through
 * tools/qr-ownership/check.mjs, and classifies it:
 *   (a) reads a canvas/target it renders itself (non-root) — unaffected;
 *   (b) reads the root createAuraApp canvas after the frame — migrate to
 *       app.capture() (or is lane 15's toDataURL inside screenshot());
 *   (c) third-party / unmigratable — needs renderer.debug.preserveDrawingBuffer.
 *
 * Emits evidence/prd01/readback-triage.json:
 *   { commit, generated, files: [{ path, owner, mechanisms, class, signals }] }
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const GREP = /toDataURL|readPixels|toBlob\(/;
const ROOT_CANVAS_HINTS = [
  /app\.canvas\b/,
  /querySelector\(["'`]canvas/,
  /locator\(["'`]canvas/,
  /page\.\$\(["'`]canvas/,
  /document\.querySelector\([^)]*canvas/i,
  /getElementById\(["'`][^"'`]*canvas/i,
  /\.screenshot\(/
];
const SELF_CANVAS_HINTS = [
  /createElement\(["'`]canvas/,
  /new OffscreenCanvas/,
  /createFakeWebGL2Context|createFakeCanvas|fakeCanvas|mockCanvas/i,
  /createRenderTarget|device\.readPixels|probe\.readPixels/i,
  /canvas = new |new Canvas\(/i
];
const UNMIGRATABLE_DIRS = [
  /tests\/clean-room\//,
  /node_modules\//,
  /vendor\//,
  /third[-_]party\//
];

const files = execSync(
  `git grep -l "toDataURL\\|readPixels\\|toBlob(" -- tools tests apps templates 'packages/*/src'`,
  { encoding: "utf8" }
).trim().split("\n").filter(Boolean);

const ownerLines = execSync(`node tools/qr-ownership/check.mjs ${files.map((f) => `"${f}"`).join(" ")}`, { encoding: "utf8" });
const ownerByPath = new Map();
for (const line of ownerLines.trim().split("\n")) {
  const [owner, path] = line.split("\t");
  if (owner && path) ownerByPath.set(path, owner);
}

const classified = [];
for (const path of files) {
  const source = readFileSync(path, "utf8");
  const mechanisms = new Set();
  if (/toDataURL/.test(source)) mechanisms.add("toDataURL");
  if (/toBlob\(/.test(source)) mechanisms.add("toBlob");
  if (/readPixels/.test(source)) mechanisms.add("readPixels");
  if (/\.screenshot\(/.test(source)) mechanisms.add("app-screenshot");

  const signals = [];
  const touchesRoot = ROOT_CANVAS_HINTS.filter((re) => re.test(source));
  const rendersSelf = SELF_CANVAS_HINTS.filter((re) => re.test(source));
  for (const re of touchesRoot) signals.push(`root:${re.source.slice(0, 40)}`);
  for (const re of rendersSelf) signals.push(`self:${re.source.slice(0, 40)}`);

  let klass;
  if (UNMIGRATABLE_DIRS.some((re) => re.test(path))) {
    klass = "c";
  } else if (mechanisms.has("app-screenshot") || (touchesRoot.length > 0 && (mechanisms.has("toDataURL") || mechanisms.has("toBlob")))) {
    // Post-frame read of the root createAuraApp canvas (direct or via screenshot()).
    klass = "b";
  } else if ((mechanisms.has("toDataURL") || mechanisms.has("toBlob")) && /^(apps|templates)\//.test(path)) {
    // App/template evidence readbacks query the mounted root canvas.
    klass = "b";
  } else {
    // readPixels on offscreen/self targets and self-rendered canvases are unaffected.
    klass = "a";
  }

  classified.push({
    path,
    owner: ownerByPath.get(path) ?? "unknown",
    mechanisms: [...mechanisms].sort(),
    class: klass,
    signals
  });
}

const byClass = { a: [], b: [], c: [] };
for (const row of classified) byClass[row.class].push(row);

const doc = {
  commit: execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(),
  generated: new Date().toISOString(),
  auditCommit: "c08d8acb",
  classes: {
    a: "reads a canvas/target it renders itself (non-root) — unaffected by preserveDrawingBuffer:false",
    b: "reads the root createAuraApp canvas after the frame — migrate to app.capture()",
    c: "third-party / unmigratable — temporarily renderer.debug.preserveDrawingBuffer:true with tracking comment"
  },
  counts: {
    total: classified.length,
    a: byClass.a.length,
    b: byClass.b.length,
    c: byClass.c.length
  },
  files: classified
};

mkdirSync("docs/project/aura3d-quality-rebuild/evidence/prd01", { recursive: true });
writeFileSync(
  "docs/project/aura3d-quality-rebuild/evidence/prd01/readback-triage.json",
  JSON.stringify(doc, null, 2) + "\n"
);
console.log(`total=${doc.counts.total} a=${doc.counts.a} b=${doc.counts.b} c=${doc.counts.c}`);
console.log(byClass.b.map((r) => `${r.owner}\t${r.path}`).join("\n"));
