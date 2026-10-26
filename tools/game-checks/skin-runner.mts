// Runs the @aura3d/cli skin check over the given rigged GLB files (spawned by tools/game-checks, which is plain Node).
// usage: tsx tools/game-checks/skin-runner.mts <repo-root> <file.glb> [more.glb ...]   -> JSON on stdout
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { checkAssetSkin, readSkinAllowlist } from "../../packages/aura3d-cli/src/skin/command.ts";

const [, , root, ...files] = process.argv;
if (!root) throw new Error("usage: skin-runner.mts <repo-root> <file.glb>...");
const manifestPath = resolve(root, "aura.assets.json");
const manifest = existsSync(manifestPath) ? (JSON.parse(readFileSync(manifestPath, "utf8")) as { assets?: { id: string; url?: string; outputPath?: string }[] }) : {};
const idFor = (file: string): string => manifest.assets?.find((a) => a.url?.endsWith(`/${basename(file)}`) || a.outputPath?.endsWith(`/${basename(file)}`))?.id ?? basename(file).replace(/\.glb$/, "");
const allow = readSkinAllowlist(root);
const out = files.map((file) => {
  const id = idFor(file);
  const result = checkAssetSkin(id, file, { samples: 6 }, allow);
  return {
    file: basename(file), id, ok: result.ok, allowed: result.allowed, allowReason: result.allowReason ?? null,
    blocking: result.report.findings.filter((f) => f.severity === "error" && !result.allowed.includes(f.code)).map((f) => ({ code: f.code, message: f.message })),
    allowedFindings: result.report.findings.filter((f) => f.severity === "error" && result.allowed.includes(f.code)).map((f) => f.code)
  };
});
console.log(JSON.stringify(out));
