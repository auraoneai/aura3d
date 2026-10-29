// Wonder World production build + deploy gate (PRD 06 gates G0 and G10). Remote runner only:
//   apps/veer-wonder-world/tools/remote-run.sh build
// Builds apps/veer-wonder-world with Vite (the app's vite.config.ts extends the root config), then runs
// `aura3d check-deploy --dist dist --no-assets --browser --route /` from the app folder (static checks plus a headless
// load that fails on HTTP errors, failed requests, uncaught errors and console errors). The app keeps its models and
// audio as module-relative assets, so its aura.assets.json lists no entries (the file must exist for check-deploy),
// hence --no-assets.
//
// Before check-deploy it scans what would be served (07 section 2.4): no source maps, and no child name in any text
// file. The name is not written here: it is the prefix of the app's working folder name (`<name>-wonder-world`), as in
// apps/veer-wonder-world/tests/unit/privacy/no-child-data.test.ts, and both the bare name and the folder form count.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";

const repo = resolve(".");
const app = join(repo, "apps", "veer-wonder-world");
const WORKING_SUFFIX = "-wonder-world";
const TEXT_FILE = /\.(?:html|js|mjs|css|json|md|txt|svg)$/i;

function run(cmd: string, args: string[], cwd: string, timeout: number): { status: number | null; out: string } {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CI: "1" } });
  return { status: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

function dirStats(dir: string): { files: number; bytes: number; byExt: Record<string, number> } {
  let files = 0;
  let bytes = 0;
  const byExt: Record<string, number> = {};
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else {
        files += 1;
        const size = statSync(p).size;
        bytes += size;
        const ext = entry.name.includes(".") ? entry.name.slice(entry.name.lastIndexOf(".") + 1) : "";
        byExt[ext] = (byExt[ext] ?? 0) + size;
      }
    }
  };
  walk(dir);
  return { files, bytes, byExt };
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(p));
    else out.push(p);
  }
  return out;
}

/** Text files of the build that contain the child's name (bare, or as the working folder name), with a count each. */
function childNameHits(dist: string): { textFiles: number; hits: Array<{ file: string; count: number }> } {
  const folder = basename(app);
  const name = folder.endsWith(WORKING_SUFFIX) ? folder.slice(0, -WORKING_SUFFIX.length) : "";
  expect(name, "the app folder is named <name>-wonder-world, so the guard name is known").not.toBe("");
  const pattern = new RegExp(`(?<![a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "gi");
  const textFiles = filesUnder(dist).filter((file) => TEXT_FILE.test(file));
  const hits: Array<{ file: string; count: number }> = [];
  for (const file of textFiles) {
    const count = (readFileSync(file, "utf8").match(pattern) ?? []).length;
    if (count > 0) hits.push({ file: file.slice(dist.length + 1), count });
  }
  return { textFiles: textFiles.length, hits };
}

test("wonder world builds with Vite and passes check-deploy --browser", async () => {
  test.setTimeout(40 * 60_000);
  const build = run(join(repo, "node_modules", ".bin", "vite"), ["build", app], repo, 20 * 60_000);
  console.log(build.out.split("\n").filter((l) => /error|warn|built in|dist\//i.test(l)).slice(-40).join("\n"));
  expect(build.status, "vite build exit").toBe(0);
  const dist = join(app, "dist");
  expect(existsSync(join(dist, "index.html"))).toBe(true);
  const stats = dirStats(dist);
  console.log(`WWJSON build-stats ${JSON.stringify(stats)}`);

  // The hit list names build files only (hashed asset names), never the matched text.
  const privacy = { sourceMaps: filesUnder(dist).filter((file) => file.endsWith(".map")).length, ...childNameHits(dist) };
  console.log(`WWJSON build-privacy-scan ${JSON.stringify(privacy)}`);
  expect(privacy.sourceMaps, "no source maps are served").toBe(0);
  expect(privacy.hits, "no child name in any served text file").toEqual([]);

  // The settle covers the whole stage boot. check-deploy closes the page when the settle ends, and the close aborts any
  // request still in flight, which it reports as a failed request: run wonder-A-20261029T135132Z failed that way with a
  // 4 s settle (a model request of the idle scene, ERR_ABORTED). On this runner's software WebGL2 the boot (GLB decode
  // and shader warm-up) takes minutes, so the page stays open for 5 minutes after the network first goes idle.
  const check = run("npx", ["-y", "@aura3d/cli@4.5.0", "check-deploy", "--dist", "dist", "--no-assets", "--browser", "--route", "/", "--browser-timeout", "180000", "--browser-settle", "300000"], app, 20 * 60_000);
  const tail = check.out.split("\n").slice(-60).join("\n");
  console.log(tail);
  console.log(`WWJSON check-deploy ${JSON.stringify({ status: check.status, tail: tail.slice(-4000) })}`);
  expect(check.status, "check-deploy exit").toBe(0);
});
