// Pure logic shared by the release helper CLIs (restamp-version, insert-changelog, deprecate-versions, banner-releases,
// poll-registry, deploy-site). They lived in /tmp during 4.7.13, 4.7.14 and 5.0.1 and were lost; keep them here, tested.

export const RETIRED_PACKAGES = Object.freeze([
  "@aura3d/editor", "@aura3d/environments", "@aura3d/materials", "@aura3d/three-compat",
  "@aura3d/showcase-assets", "@aura3d/showcase-assets-web", "@aura3d/lean"
]);
export const SEMVER = /^\d+\.\d+\.\d+$/;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replace `from` with `to` only where it is a whole version token (not 15.0.10, not 5.0.1.2, not 5.0.1-beta kept). */
export function restampContent(text, from, to) {
  if (!SEMVER.test(from) || !SEMVER.test(to)) throw new Error("restamp needs two x.y.z versions");
  const re = new RegExp(`(?<![\\d.])${esc(from)}(?![\\d]|\\.\\d)`, "g");
  let count = 0;
  const next = text.replace(re, () => { count++; return to; });
  return { text: next, count };
}

/** Files a restamp must never touch (history, lockfile integrity hashes, evidence reports, binaries). */
export function isRestampable(path) {
  if (/(^|\/)(CHANGELOG\.md|pnpm-lock\.yaml|package-lock\.json)$/.test(path)) return false;
  if (/^tests\/reports\//.test(path)) return false;
  if (/\.(png|jpe?g|webp|glb|gltf|ktx2|woff2?|mp3|ogg|wav|zip|tgz|gz|wasm|bin|ico)$/i.test(path)) return false;
  return true;
}

/** Insert `## <version> (<date>)` + notes above the newest existing version heading. Refuses duplicates. */
export function insertChangelog(changelog, version, date, notes, { replace = false } = {}) {
  if (!SEMVER.test(version)) throw new Error("version must be x.y.z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
  const body = notes.trim();
  if (!body) throw new Error("empty changelog notes");
  if (/unreleased|not frozen/i.test(body)) throw new Error("notes still say unreleased/not frozen");
  const section = `## ${version} (${date})\n\n${body}\n\n`;
  const existing = new RegExp(`^## ${esc(version)}\\b[^\\n]*\\n[\\s\\S]*?(?=^## |(?![\\s\\S]))`, "m");
  if (existing.test(changelog)) {
    if (!replace) throw new Error(`CHANGELOG already has a ${version} section (use --replace)`);
    return changelog.replace(existing, section);
  }
  const first = changelog.search(/^## /m);
  if (first < 0) return `${changelog.replace(/\s*$/, "\n\n")}${section}`.replace(/\n+$/, "\n");
  return changelog.slice(0, first) + section + changelog.slice(first);
}

/** npm deprecate invocations for a release. `previous` versions get their own message (for example a pulled 5.0.0). */
export function deprecationCommands(plan, version, url, { special = {} } = {}) {
  const cmds = [];
  const superseded = `Superseded by ${version} - see ${url}`;
  for (const { name } of plan.packages) {
    cmds.push({ spec: `${name}@<${version}`, message: superseded });
    for (const [v, msg] of Object.entries(special)) cmds.push({ spec: `${name}@${v}`, message: msg.replaceAll("{version}", version).replaceAll("{url}", url) });
  }
  for (const name of RETIRED_PACKAGES) cmds.push({ spec: name, message: `Retired: use @aura3d/engine@${version} or later - see ${url}` });
  return cmds;
}

/** Check registry docs: only `version` undeprecated per package, latest === version; retired packages fully deprecated. */
export function checkDeprecations(docs, plan, version) {
  const bad = [];
  for (const { name } of plan.packages) {
    const d = docs[name];
    if (!d) { bad.push(`${name}: no registry document`); continue; }
    const live = Object.entries(d.versions).filter(([, v]) => !v.deprecated).map(([k]) => k);
    if (!(live.length === 1 && live[0] === version && d["dist-tags"]?.latest === version)) bad.push(`${name}: undeprecated ${live.join(",") || "none"}, latest ${d["dist-tags"]?.latest}`);
  }
  for (const name of RETIRED_PACKAGES) {
    const d = docs[name];
    if (!d) continue;
    const live = Object.entries(d.versions).filter(([, v]) => !v.deprecated).map(([k]) => k);
    if (live.length) bad.push(`${name} (retired): undeprecated ${live.join(",")}`);
  }
  return bad;
}

export function bannerText(version, migrationUrl, repo = "auraoneai/aura3d") {
  return `> **Superseded.** This version is deprecated. Upgrade to [Aura3D ${version}](https://github.com/${repo}/releases/tag/v${version}); see the [4.x to 5.0 migration guide](${migrationUrl}).`;
}
export const BANNER_PREFIX = /^> \*\*Superseded\.\*\*[^\n]*\n+/m;
/** Idempotent: strips any existing banner and prepends the current one. */
export function bannerBody(body, version, migrationUrl) {
  return `${bannerText(version, migrationUrl)}\n\n${body.replace(BANNER_PREFIX, "")}`;
}
/** Tags to banner: every release except v<version> and anything matching a skip prefix (for example "v5." while 5.0.x is current). */
export function bannerTargets(tags, version, skipPrefixes = []) {
  return tags.filter((t) => t !== `v${version}` && !skipPrefixes.some((p) => t.startsWith(p)));
}

/** One registry poll round: results is [[name, status]]; returns state ok | pending | mismatch. */
export function registryState(results) {
  const bad = results.filter(([, s]) => s !== "ok");
  if (!bad.length) return { state: "ok", bad };
  return { state: bad.some(([, s]) => s === "integrity-mismatch") ? "mismatch" : "pending", bad };
}
export async function pollRound(plan, version, fetchImpl = fetch) {
  return Promise.all(plan.packages.map(async ({ name, integrity }) => {
    try {
      const r = await fetchImpl(`https://registry.npmjs.org/${name.replace("/", "%2F")}/${version}`, { headers: { "cache-control": "no-cache" } });
      if (!r.ok) return [name, `http ${r.status}`];
      const j = await r.json();
      return [name, j.dist?.integrity === integrity ? "ok" : "integrity-mismatch"];
    } catch (e) { return [name, String(e.message).slice(0, 40)]; }
  }));
}

/** Pages deploy guard: list files above the Cloudflare per-file limit (25 MiB; keep one MiB of headroom). */
export function oversizeFiles(entries, limitBytes = 24 * 1024 * 1024) {
  return entries.filter((e) => e.size > limitBytes).map((e) => e.path);
}
/** Argument vectors for a Pages deploy from a release tree. `branch` is "main" for production. */
export function pagesDeployArgs({ project, dist, branch, freeze, message }) {
  if (!/^[0-9a-f]{7,40}$/.test(freeze)) throw new Error("freeze must be a commit sha");
  return ["pages", "deploy", dist, "--project-name", project, "--branch", branch, "--commit-dirty=true", "--commit-hash", freeze, "--commit-message", message];
}
/** Preview branch names must be DNS-safe: release/5.0.2 -> release-5-0-2. */
export const previewBranch = (version) => `release-${version.replaceAll(".", "-")}`;
