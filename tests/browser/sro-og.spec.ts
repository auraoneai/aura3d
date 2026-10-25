import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";

const FILES = ["og-1200x630.png", "twitter-1200x630.png", "twitter-1200x600.png"];
const CHUNK = 60000;
// The remote image only copies fixed directories: the render inputs are staged under apps/__og with the same layout.
const ROOT = existsSync("apps/__og/marketing/scripts/generate-og.mjs") ? "apps/__og" : ".";

test("render the Aura3D social cards on the remote runner", async () => {
  test.setTimeout(600_000);
  const run = spawnSync("node", [`${ROOT}/marketing/scripts/generate-og.mjs`], { cwd: process.cwd(), encoding: "utf8", timeout: 540_000 });
  console.log(`@@SRO generate exit=${run.status}`);
  console.log(`@@SRO stdout ${String(run.stdout).slice(-400).replace(/\s+/g, " ")}`);
  console.log(`@@SRO stderr ${String(run.stderr).slice(0, 500).replace(/\s+/g, " ")}`);
  expect(run.status).toBe(0);
  for (const name of FILES) {
    const file = resolve(process.cwd(), ROOT, "store-assets/brand/social", name);
    let size = 0;
    try { size = statSync(file).size; } catch { console.log(`@@SRO missing ${name}`); continue; }
    const b64 = readFileSync(file).toString("base64");
    const total = Math.ceil(b64.length / CHUNK);
    console.log(`@@SRO file ${name} bytes=${size}`);
    for (let i = 0; i < total; i += 1) console.log(`@@PNG ${name} ${i + 1}/${total} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  }
});
