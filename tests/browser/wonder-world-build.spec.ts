// Wonder World production build + deploy gate (PRD 06 gates G0 and G10). Remote runner only:
//   apps/veer-wonder-world/tools/remote-run.sh build
// Builds apps/veer-wonder-world with Vite (the app's vite.config.ts extends the root config), then runs
// `aura3d check-deploy --dist dist --no-assets --browser --route /` from the app folder (static checks plus a headless
// load that fails on HTTP errors, failed requests, uncaught errors and console errors). The app keeps its models and
// audio as module-relative assets, so its aura.assets.json lists no entries (the file must exist for check-deploy),
// hence --no-assets.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";

const repo = resolve(".");
const app = join(repo, "apps", "veer-wonder-world");

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

test("wonder world builds with Vite and passes check-deploy --browser", async () => {
  test.setTimeout(30 * 60_000);
  const build = run(join(repo, "node_modules", ".bin", "vite"), ["build", app], repo, 20 * 60_000);
  console.log(build.out.split("\n").filter((l) => /error|warn|built in|dist\//i.test(l)).slice(-40).join("\n"));
  expect(build.status, "vite build exit").toBe(0);
  const dist = join(app, "dist");
  expect(existsSync(join(dist, "index.html"))).toBe(true);
  const stats = dirStats(dist);
  console.log(`WWJSON build-stats ${JSON.stringify(stats)}`);

  const check = run("npx", ["-y", "@aura3d/cli@4.5.0", "check-deploy", "--dist", "dist", "--no-assets", "--browser", "--route", "/", "--browser-timeout", "120000", "--browser-settle", "4000"], app, 15 * 60_000);
  const tail = check.out.split("\n").slice(-60).join("\n");
  console.log(tail);
  console.log(`WWJSON check-deploy ${JSON.stringify({ status: check.status, tail: tail.slice(-4000) })}`);
  expect(check.status, "check-deploy exit").toBe(0);
});
