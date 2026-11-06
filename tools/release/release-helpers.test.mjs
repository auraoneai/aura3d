import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  RETIRED_PACKAGES, bannerBody, bannerTargets, checkDeprecations, deprecationCommands, insertChangelog, isRestampable,
  oversizeFiles, pagesDeployArgs, pollRound, previewBranch, registryState, restampContent
} from "./release-helpers.mjs";

test("restamp replaces whole version tokens only", () => {
  const { text, count } = restampContent('"version": "5.0.1", @aura3d/engine@5.0.1 x15.0.10 5.0.1.2 v5.0.1. 25.0.1', "5.0.1", "5.0.2");
  assert.equal(count, 3);
  assert.equal(text, '"version": "5.0.2", @aura3d/engine@5.0.2 x15.0.10 5.0.1.2 v5.0.2. 25.0.1');
  assert.throws(() => restampContent("x", "5.0", "5.0.2"), /x\.y\.z/);
  assert.equal(isRestampable("CHANGELOG.md"), false);
  assert.equal(isRestampable("pnpm-lock.yaml"), false);
  assert.equal(isRestampable("tests/reports/x.json"), false);
  assert.equal(isRestampable("marketing/hero.png"), false);
  assert.equal(isRestampable("packages/engine/package.json"), true);
});

test("changelog insertion goes above the newest section and refuses duplicates", () => {
  const cl = "# Changelog\n\nIntro.\n\n## 5.0.1 (2026-11-05)\n\nold\n\n## 5.0.0 (2026-11-04)\n\nolder\n";
  const next = insertChangelog(cl, "5.0.2", "2026-11-07", "- fix");
  assert.ok(next.indexOf("## 5.0.2") < next.indexOf("## 5.0.1"));
  assert.ok(next.startsWith("# Changelog\n\nIntro.\n\n## 5.0.2 (2026-11-07)\n\n- fix\n\n## 5.0.1"));
  assert.throws(() => insertChangelog(next, "5.0.2", "2026-11-07", "- x"), /already has/);
  const replaced = insertChangelog(next, "5.0.2", "2026-11-08", "- fix2", { replace: true });
  assert.match(replaced, /## 5\.0\.2 \(2026-11-08\)\n\n- fix2\n\n## 5\.0\.1/);
  assert.equal((replaced.match(/## 5\.0\.2/g) ?? []).length, 1);
  assert.throws(() => insertChangelog(cl, "5.0.2", "2026-11-07", "unreleased draft"), /unreleased/);
  assert.throws(() => insertChangelog(cl, "5.0.2", "7 Nov", "x"), /YYYY/);
});

const plan = { packages: [{ name: "@aura3d/engine", integrity: "sha512-a" }, { name: "create-aura3d", integrity: "sha512-b" }] };

test("deprecation commands cover superseded ranges, special versions and retired packages", () => {
  const cmds = deprecationCommands(plan, "5.0.2", "https://m", { special: { "5.0.1": "Pulled {version} {url}" } });
  assert.deepEqual(cmds.slice(0, 2).map((c) => c.spec), ["@aura3d/engine@<5.0.2", "@aura3d/engine@5.0.1"]);
  assert.equal(cmds[1].message, "Pulled 5.0.2 https://m");
  assert.equal(cmds.filter((c) => RETIRED_PACKAGES.includes(c.spec)).length, RETIRED_PACKAGES.length);
});

test("deprecation check requires only the new version undeprecated and latest on it", () => {
  const doc = (live, latest) => ({ versions: { "5.0.2": live.includes("5.0.2") ? {} : { deprecated: "x" }, "5.0.1": live.includes("5.0.1") ? {} : { deprecated: "x" } }, "dist-tags": { latest } });
  const good = { "@aura3d/engine": doc(["5.0.2"], "5.0.2"), "create-aura3d": doc(["5.0.2"], "5.0.2") };
  assert.deepEqual(checkDeprecations(good, plan, "5.0.2"), []);
  assert.equal(checkDeprecations({ ...good, "create-aura3d": doc(["5.0.2", "5.0.1"], "5.0.2") }, plan, "5.0.2").length, 1);
  assert.equal(checkDeprecations({ "@aura3d/engine": good["@aura3d/engine"] }, plan, "5.0.2").length, 1);
});

test("banner is idempotent and skips the current release and skip prefixes", () => {
  const once = bannerBody("notes", "5.0.2", "https://m");
  assert.match(once, /^> \*\*Superseded\.\*\* .*v5\.0\.2/);
  assert.equal(bannerBody(once, "5.0.2", "https://m"), once);
  assert.match(bannerBody(once, "5.0.3", "https://m"), /v5\.0\.3/);
  assert.deepEqual(bannerTargets(["v5.0.2", "v5.0.1", "v4.7.1"], "5.0.2", ["v5."]), ["v4.7.1"]);
});

test("registry poll classifies pending, mismatch and ok", async () => {
  assert.equal(registryState([["a", "ok"]]).state, "ok");
  assert.equal(registryState([["a", "ok"], ["b", "http 404"]]).state, "pending");
  assert.equal(registryState([["b", "integrity-mismatch"], ["c", "http 404"]]).state, "mismatch");
  const fetchImpl = async (url) => (url.includes("engine") ? { ok: true, json: async () => ({ dist: { integrity: "sha512-a" } }) } : { ok: true, json: async () => ({ dist: { integrity: "other" } }) });
  assert.deepEqual(await pollRound(plan, "5.0.2", fetchImpl), [["@aura3d/engine", "ok"], ["create-aura3d", "integrity-mismatch"]]);
});

test("deploy helpers: size guard, args, preview branch", () => {
  assert.deepEqual(oversizeFiles([{ path: "a", size: 25 * 1024 * 1024 }, { path: "b", size: 10 }]), ["a"]);
  assert.equal(previewBranch("5.0.2"), "release-5-0-2");
  const a = pagesDeployArgs({ project: "aura3d", dist: "d", branch: "main", freeze: "abcdef123", message: "m" });
  assert.ok(a.includes("--commit-hash") && a.includes("main"));
  assert.throws(() => pagesDeployArgs({ project: "p", dist: "d", branch: "b", freeze: "HEAD", message: "m" }), /sha/);
});

test("deploy-site dry run prints the plan and does not touch the tree", () => {
  const out = execFileSync("node", [new URL("./deploy-site.mjs", import.meta.url).pathname, "--version", "5.0.2", "--freeze", "abcdef1234", "--mode", "preview", "--dry-run"], { encoding: "utf8" });
  assert.match(out, /DRY wrangler pages deploy .*--branch release-5-0-2/);
  assert.match(out, /preview URL: https:\/\/release-5-0-2\.aura3d\.pages\.dev/);
});
