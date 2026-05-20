#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const engine = process.argv[2];
const targetReportPath = process.argv[3] || (engine === "unity"
  ? "tests/reports/v4-unity-editor-cli-smoke.json"
  : engine === "unreal"
    ? "tests/reports/v4-unreal-editor-cli-smoke.json"
    : "");
if (engine !== "unity" && engine !== "unreal") {
  console.error("Usage: node run-editor-cli-smoke.mjs <unity|unreal> [target-report-path]");
  process.exit(2);
}

const envName = engine === "unity" ? "G3D_UNITY_EDITOR" : "G3D_UNREAL_EDITOR";
const executable = executableFor(engine, envName);
if (!executable) {
  throw new Error("No " + engine + " editor executable found. Set " + envName + " to a real editor binary or add it to PATH.");
}
const command = [executable, "-version"];
const startedAt = new Date().toISOString();
const result = spawnSync(command[0], command.slice(1), { encoding: "utf8", timeout: 20_000 });
const output = String((result.stdout || "") + (result.stderr || "")).trim().slice(0, 4_000);
const report = {
  ok: result.status === 0 && output.length > 0,
  engine,
  envName,
  executable,
  command,
  startedAt,
  exitCode: result.status,
  signal: result.signal,
  timedOut: Boolean(result.error && result.error.message.includes("ETIMEDOUT")),
  output,
  claimBoundary: "This report proves only that a local external editor binary started and answered a version command. It is not render parity evidence.",
};
mkdirSync(dirname(targetReportPath), { recursive: true });
writeFileSync(targetReportPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ok: report.ok, reportPath: targetReportPath, engine, executable, exitCode: report.exitCode }, null, 2));
if (!report.ok) process.exit(1);

function executableFor(engineName, envName) {
  const envPath = process.env[envName];
  const envExecutable = normalizeEditorExecutablePath(engineName, envPath);
  if (envExecutable) return envExecutable;
  const names = engineName === "unity" ? ["Unity", "unity"] : ["UnrealEditor-Cmd", "UnrealEditor", "unreal"];
  for (const name of names) {
    const result = spawnSync("sh", ["-lc", "command -v " + shellQuote(name)], { encoding: "utf8" });
    const output = result.status === 0 ? result.stdout.trim().split("\n")[0] : "";
    if (output) return output;
  }
  return macEditorBundleExecutable(engineName);
}

function normalizeEditorExecutablePath(engineName, path) {
  if (!path) return null;
  if (existsSync(path) && !path.endsWith(".app")) return path;
  const appExecutable = engineName === "unity"
    ? join(path, "Contents/MacOS/Unity")
    : join(path, "Contents/MacOS/UnrealEditor");
  return existsSync(appExecutable) ? appExecutable : null;
}

function macEditorBundleExecutable(engineName) {
  const candidates = engineName === "unity" ? unityMacCandidates() : unrealMacCandidates();
  return candidates.find((path) => existsSync(path)) || null;
}

function unityMacCandidates() {
  return uniqueStrings(editorSearchRoots("unity").flatMap((root) => {
    const hubRoots = [
      join(root, "Unity", "Hub", "Editor"),
      join(root, "Hub", "Editor"),
      root,
    ];
    return [
      join(root, "Unity.app", "Contents", "MacOS", "Unity"),
      join(root, "Unity", "Unity.app", "Contents", "MacOS", "Unity"),
      ...hubRoots.flatMap((hubRoot) => safeReadDirectoryNames(hubRoot)
        .sort()
        .reverse()
        .map((version) => join(hubRoot, version, "Unity.app", "Contents", "MacOS", "Unity"))),
    ];
  }));
}

function unrealMacCandidates() {
  return uniqueStrings(editorSearchRoots("unreal").flatMap((root) => {
    const epicRoots = [
      join(root, "Epic Games"),
      root,
    ];
    return [
      join(root, "UnrealEditor-Cmd"),
      join(root, "UnrealEditor.app", "Contents", "MacOS", "UnrealEditor"),
      ...epicRoots.flatMap((epicRoot) => safeReadDirectoryNames(epicRoot)
        .sort()
        .reverse()
        .flatMap((version) => [
          join(epicRoot, version, "Engine", "Binaries", "Mac", "UnrealEditor-Cmd"),
          join(epicRoot, version, "Engine", "Binaries", "Mac", "UnrealEditor.app", "Contents", "MacOS", "UnrealEditor"),
        ])),
    ];
  }));
}

function editorSearchRoots(engineName) {
  const envName = engineName === "unity" ? "G3D_UNITY_SEARCH_ROOTS" : "G3D_UNREAL_SEARCH_ROOTS";
  const defaults = engineName === "unity"
    ? ["/Applications", "/Users/Shared/Unity"]
    : ["/Applications", "/Users/Shared/Epic Games", "/Users/Shared"];
  const envRoots = (process.env[envName] || "")
    .split(":")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return uniqueStrings([...envRoots, ...defaults]);
}

function safeReadDirectoryNames(path) {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function shellQuote(value) {
  return "'" + String(value).replaceAll("'", "'\\''") + "'";
}

function uniqueStrings(values) {
  return [...new Set(values)];
}
