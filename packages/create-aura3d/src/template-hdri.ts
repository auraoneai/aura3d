// Look HDRIs for scaffolded projects. Look presets can reference
// `/hdri/<file>.hdr` (packages/engine/src/agent-api/looks/looks.ts HDRI_ASSET),
// so templates that author a look ship the catalogue under public/hdri/
// to avoid IBL/sky 404s when a preset uses one. The single source is packages/create-aura3d/hdri/
// (CC0 originals and derived images, see hdri/ATTRIBUTION.md).

import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Directory name of the HDRI set inside the create-aura3d package root. */
export const TEMPLATE_HDRI_DIR = "hdri";
export const TEMPLATE_HDRI_ATTRIBUTION = "ATTRIBUTION.md";
// Pinned independently of the files being copied. Keep this list and the
// attribution in step with the public looks catalogue, including night-2k
// which is used by an internal look upgrade rather than an AuraHdriId.
export const TEMPLATE_HDRI_SHA256: Readonly<Record<string, string>> = {
  "autumn_field_puresky_1k.hdr": "e60470d3a0f219585df1d74c393b472361c5400a7ff8d071ebe6eca29b7fe2b0",
  "belfast_sunset_puresky_1k.hdr": "f5c14eb2ca1e2e7e281e39d3bf1a2898f43cc2b2db3232ab40c0c147e7d1c7a3",
  "cobblestone_street_night_1k.hdr": "033963d2d4f34a98ee2b8d5989c29860eaaedfaf4a99e1205777a01262150a63",
  "deep_space_starfield_1k.hdr": "1239cd4504c18d1b7e60921531c572430bf3493e3070caf57ae5e64062118526",
  "hangar_interior_1k.hdr": "7746637511161f1c30938c0fc5c8ea14f887866e97f4504bd3c5161335888b74",
  "indoor-workshop_1k.hdr": "3a7dd0110ad011289abae4f4637aa0a0e58abcbd8a3fe1f5f3ba664276dbb351",
  "industrial_sunset_puresky_1k.hdr": "988320101df317784b2a869b40b0e23519726bf8827def4ed8eef806df2601cd",
  "kloppenheim_02_1k.hdr": "c122eb29c259d8c2ef0093c20130faa67ea216f5a1407c409ee4fc97cd5ba002",
  "kloppenheim_06_puresky_1k.hdr": "206c67e3a1b992282821cf06662bdd69bbb4915c1c4444a66338a40d6a7d4e34",
  "museum_of_history_1k.hdr": "350906ce6c759dbd9e1ad7a38023267ea2426e29c3f1b16fe58e500b61c3d583",
  "night-2k.hdr": "d458fe7f20969d89eedbb7ae12d346abf68c86d844235696e7d70baad3e04cf0",
  "outdoor-midday_1k.hdr": "206c67e3a1b992282821cf06662bdd69bbb4915c1c4444a66338a40d6a7d4e34",
  "rooftop_night_1k.hdr": "4c8820e1517cc5fea7acaaa9b7ac1c043a4584f8b6042b6d6c72f8764abb255e",
  "spruit_sunrise_1k.hdr": "3ac30651cde16d2a80521273ec917ba3feca172ea4b842335431201879f39593",
  "studio_small_08_1k.hdr": "f6a989f89432eb4eee3191364a9c1ceed195c4ec3544173a3c04fd96cb91d0ba",
  "sunset-dramatic_1k.hdr": "169745b6baf57aefe59c71b2f0019857cbbc5ab9c87f70d7d5c87eaa7bc83929",
  "venice_sunset_1k.hdr": "ada97320249204fe041054c281ead9425e54302ac1538466a71cc9c1f381c725",
  "warm_bar_1k.hdr": "d2681f6912d3ade36e2bf998bdd31758596cc0ea524ca5177032a0ec86e1a685"
};
// Digest of the attribution with LF line endings; update when its content changes.
const ATTRIBUTION_SHA256 = "cba7b6d9600b131ef9df39bd93e0c60decb3b31a44a64f3f179768b5392b00aa";
/** Neutral is embedded in the engine; these optional presets need local files. */
export const TEMPLATE_ENVIRONMENT_DIR = "aura-environments";
export const TEMPLATE_ENVIRONMENT_PRESETS = ["studio", "outdoor", "sunset", "night", "indoor"] as const;

// V2 prompt-plan compilation also adds a look, even without a direct looks call.
const LOOK_AUTHORING = /\b(?:looks\.(?:preset|nodes)|compilePromptPlanV2|promptPlanToSceneV2)\s*\(/;
const SOURCE_FILE = /\.(ts|tsx|js|mjs)$/;

/** True when source under `<projectDir>/src` authors a look directly or through a v2 prompt plan. */
export function templateAuthorsLook(projectDir: string): boolean {
  const src = join(projectDir, "src");
  if (!existsSync(src)) return false;
  const stack = [src];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const file = join(current, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (SOURCE_FILE.test(entry.name) && LOOK_AUTHORING.test(readFileSync(file, "utf8"))) return true;
    }
  }
  return false;
}

/**
 * Deliver the complete verified look catalogue and its attribution, together
 * with the baked environment presets. Existing identical files are retained;
 * conflicting files are reported without replacing user data.
 */
export function copyTemplateHdris(hdriDir: string, projectDir: string): string[] {
  const hdris = Object.entries(TEMPLATE_HDRI_SHA256).map(([file, digest]) => ({
    relative: `public/hdri/${file}`,
    bytes: readVerifiedHdriFile(hdriDir, file, digest, true)
  }));
  hdris.push({
    relative: `public/hdri/${TEMPLATE_HDRI_ATTRIBUTION}`,
    bytes: readVerifiedHdriFile(hdriDir, TEMPLATE_HDRI_ATTRIBUTION, ATTRIBUTION_SHA256, false)
  });
  const environmentSource = join(dirname(hdriDir), TEMPLATE_ENVIRONMENT_DIR);
  const environmentFiles = validatedTemplateEnvironmentFiles(environmentSource).map((file) => ({
    relative: `public/${TEMPLATE_ENVIRONMENT_DIR}/${file}`,
    bytes: readFileSync(join(environmentSource, file))
  }));
  const files = [...hdris, ...environmentFiles];

  // Preflight both sets and every destination before writing either set.
  // Reject symlinks too: they could redirect a write outside the project.
  for (const dir of [join(projectDir, "public"), join(projectDir, "public", "hdri"), join(projectDir, "public", TEMPLATE_ENVIRONMENT_DIR)]) {
    const stat = lstatIfExists(dir);
    if (stat && !stat.isDirectory()) throw new Error(`SCAFFOLD_ASSET_CONFLICT:${dir}: expected a directory, without symlinks`);
  }
  const pending = files.filter(({ relative, bytes }) => {
    const target = join(projectDir, relative);
    const stat = lstatIfExists(target);
    if (!stat) return true;
    if (!stat.isFile() || !readFileSync(target).equals(bytes)) {
      throw new Error(`SCAFFOLD_ASSET_CONFLICT:${target}: existing file differs; it was not overwritten`);
    }
    return false;
  });
  mkdirSync(join(projectDir, "public", "hdri"), { recursive: true });
  mkdirSync(join(projectDir, "public", TEMPLATE_ENVIRONMENT_DIR), { recursive: true });
  for (const { relative, bytes } of pending) {
    const target = join(projectDir, relative);
    try { writeFileSync(target, bytes, { flag: "wx" }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`SCAFFOLD_ASSET_CONFLICT:${target}: file appeared during copying; it was not overwritten`);
      throw error;
    }
  }
  return files.map(({ relative }) => relative);
}

function lstatIfExists(path: string): ReturnType<typeof lstatSync> | undefined {
  try { return lstatSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function readVerifiedHdriFile(source: string, file: string, expected: string, radiance: boolean): Buffer {
  let bytes: Buffer;
  try { bytes = readFileSync(join(source, file)); }
  catch { throw new Error(`HDRI_UNAVAILABLE:${file}: missing or unreadable in ${source}`); }
  if (bytes.subarray(0, 42).toString("utf8").startsWith("version https://git-lfs.github.com/spec/v1")) {
    throw new Error(`HDRI_UNAVAILABLE:${file}: Git LFS pointer found; restore the full LFS object before scaffolding`);
  }
  if (radiance && !bytes.subarray(0, 11).equals(Buffer.from("#?RADIANCE\n"))) {
    throw new Error(`HDRI_INVALID:${file}: expected a Radiance HDR image`);
  }
  // Git checkouts may convert Markdown to CRLF; verify the same attribution
  // text without treating a platform line-ending conversion as tampering.
  const hashInput = radiance ? bytes : bytes.toString("utf8").replace(/\r\n/g, "\n");
  if (createHash("sha256").update(hashInput).digest("hex") !== expected) {
    throw new Error(`HDRI_INVALID:${file}: SHA-256 digest mismatch`);
  }
  return bytes;
}

/** Required files are part of the create-aura3d package and verified against each baked manifest. */
export function validatedTemplateEnvironmentFiles(source: string): string[] {
  const files: string[] = [];
  for (const preset of TEMPLATE_ENVIRONMENT_PRESETS) {
    const manifestName = `${preset}.manifest.json`;
    const manifestPath = join(source, manifestName);
    let manifest: { name?: unknown; specular?: unknown; sh9?: unknown; sha256?: { specular?: unknown; sh9?: unknown }; license?: unknown };
    try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); }
    catch { throw new Error(`ENV_PRESET_UNAVAILABLE:${preset}: install ${manifestName} and its local assets in ${source}`); }
    if (manifest.name !== preset || manifest.license !== "CC0") throw new Error(`ENV_PRESET_INVALID:${preset}: manifest name or license is invalid`);
    const data: readonly ["specular" | "sh9", string, unknown][] = [
      ["specular", `${preset}.specular.ktx2`, manifest.specular],
      ["sh9", `${preset}.sh9.f32`, manifest.sh9]
    ];
    for (const [kind, filename, declared] of data) {
      const expected = manifest.sha256?.[kind];
      if (declared !== filename || typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)) {
        throw new Error(`ENV_PRESET_INVALID:${preset}: invalid ${kind} filename or digest`);
      }
      let bytes: Buffer;
      try { bytes = readFileSync(join(source, filename)); }
      catch { throw new Error(`ENV_PRESET_UNAVAILABLE:${preset}: ${filename} is missing from ${source}`); }
      if (bytes.length === 0 || createHash("sha256").update(bytes).digest("hex") !== expected) {
        throw new Error(`ENV_PRESET_INVALID:${preset}: ${filename} digest mismatch`);
      }
    }
    files.push(manifestName, `${preset}.specular.ktx2`, `${preset}.sh9.f32`);
  }
  return files;
}
