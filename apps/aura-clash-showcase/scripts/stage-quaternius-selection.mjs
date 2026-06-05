#!/usr/bin/env node
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const selectionPath = resolve(repoRoot, "apps/aura-clash-showcase/assets/quaternius-selection.json");
const selection = JSON.parse(await readFile(selectionPath, "utf8"));
const stageRoot = resolve(repoRoot, selection.stageRoot);
const reset = process.argv.includes("--reset");

function archivePath(filename) {
  const candidates = [
    resolve(repoRoot, selection.sourceDownloadDir, filename),
    resolve(repoRoot, "apps/aura-clash-showcase/assets/quaternius-downloads", filename)
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Missing archive ${filename}. Looked in: ${candidates.join(", ")}`);
  return found;
}

function extract(zip, from, to) {
  const dest = resolve(stageRoot, to);
  const python = [
    "import pathlib, sys, zipfile",
    "zip_path, member, dest = sys.argv[1:]",
    "with zipfile.ZipFile(zip_path) as archive:",
    "    pathlib.Path(dest).write_bytes(archive.read(member))"
  ].join("\n");
  const result = spawnSync("python3", ["-c", python, zip, from, dest], { encoding: "utf8" });
  if (result.status !== 0) {
    const stderr = result.stderr ? result.stderr.toString("utf8") : "";
    throw new Error(`Failed to extract ${from} from ${zip}\n${stderr}`);
  }
  return Promise.resolve(dest);
}

async function sha256(path) {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

function expandEntries(archive) {
  const entries = [...(archive.entries ?? [])];
  if (archive.id === "downtown-city-megakit") {
    for (const piece of archive.pieceNames ?? []) {
      entries.push({
        from: `Exports/glTF (Godot)/${piece}.gltf`,
        to: `arena/neon-downtown/gltf/${piece}.gltf`
      });
      entries.push({
        from: `Exports/glTF (Godot)/${piece}.bin`,
        to: `arena/neon-downtown/gltf/${piece}.bin`
      });
    }
  }
  return entries;
}

function listZipEntries(zip) {
  const python = [
    "import json, sys, zipfile",
    "with zipfile.ZipFile(sys.argv[1]) as archive:",
    "    print(json.dumps(archive.namelist()))"
  ].join("\n");
  const result = spawnSync("python3", ["-c", python, zip], { encoding: "utf8", maxBuffer: 1024 * 1024 * 32 });
  if (result.status !== 0) {
    const stderr = result.stderr ? result.stderr.toString("utf8") : "";
    throw new Error(`Failed to list ${zip}\n${stderr}`);
  }
  return JSON.parse(result.stdout);
}

function addTextureDependencies(entries, archive, zip) {
  const listed = listZipEntries(zip);
  if (archive.id === "downtown-city-megakit") {
    for (const from of listed.filter((entry) => entry.startsWith("Exports/glTF (Godot)/") && entry.endsWith(".png"))) {
      entries.push({ from, to: `arena/neon-downtown/gltf/${from.split("/").pop()}` });
    }
  }
  if (archive.id === "universal-base-characters") {
    for (const from of listed.filter((entry) => entry.startsWith("Universal Base Characters[Standard]/Base Characters/Godot - UE/") && entry.endsWith(".png"))) {
      entries.push({ from, to: `characters/base/${from.split("/").pop()}` });
    }
  }
  const byDestination = new Map();
  for (const entry of entries) byDestination.set(entry.to, entry);
  return [...byDestination.values()];
}

async function writeTextureAliases() {
  const aliases = [
    ["characters/base/T_Eye_Normal.png", "characters/base/T_Eye_Normal_png.png"],
    ["characters/base/T_Hair_1_Normal.png", "characters/base/T_Hair_1_Normal_png.png"],
    ["characters/base/T_Hair_2_Normal.png", "characters/base/T_Hair_2_Normal_png.png"],
    ["characters/base/T_Superhero_Female_Normal.png", "characters/base/T_Superhero_Female_Normal_png.png"],
    ["characters/base/T_Superhero_Male_Normal.png", "characters/base/T_Superhero_Male_Normal_png.png"]
  ];
  const created = [];
  for (const [from, to] of aliases) {
    const src = resolve(stageRoot, from);
    const dest = resolve(stageRoot, to);
    if (existsSync(src) && !existsSync(dest)) {
      await copyFile(src, dest);
      created.push(dest.replace(`${repoRoot}/`, ""));
    }
  }
  return created;
}

if (reset) {
  await rm(stageRoot, { recursive: true, force: true });
}
await mkdir(stageRoot, { recursive: true });

const staged = [];
const archives = [];
for (const archive of selection.archives) {
  const zip = archivePath(archive.filename);
  const archiveHash = await sha256(zip);
  archives.push({ id: archive.id, filename: archive.filename, path: zip.replace(`${repoRoot}/`, ""), sha256: archiveHash });
  for (const entry of addTextureDependencies(expandEntries(archive), archive, zip)) {
    await mkdir(dirname(resolve(stageRoot, entry.to)), { recursive: true });
    const dest = await extract(zip, entry.from, entry.to);
    staged.push({ archive: archive.id, from: entry.from, to: dest.replace(`${repoRoot}/`, ""), sha256: await sha256(dest) });
  }
}
const textureAliases = await writeTextureAliases();

const output = {
  schema: "aura-clash.quaternius-staged/1.0",
  stagedAt: new Date().toISOString(),
  sourceSelection: selectionPath.replace(`${repoRoot}/`, ""),
  stageRoot: stageRoot.replace(`${repoRoot}/`, ""),
  archives,
  stagedFileCount: staged.length,
  textureAliases,
  staged
};

const outputPath = resolve(repoRoot, "apps/aura-clash-showcase/assets/quaternius-staged-manifest.json");
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Staged ${staged.length} files into ${output.stageRoot}`);
console.log(`Wrote ${outputPath.replace(`${repoRoot}/`, "")}`);
