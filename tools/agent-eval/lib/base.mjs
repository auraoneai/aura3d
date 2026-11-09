import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Both are overridable by environment so a newer published engine can be trialled without touching the 4.1.2 baseline setup.
export const DEFAULT_BASE_ROOT = process.env.AGENT_EVAL_BASE_ROOT || "/tmp/agent-eval-base";
export const AURA_VERSION = process.env.AGENT_EVAL_AURA_VERSION || "4.1.2";

/** Published 4.1.2 reaches `node:fs` from the browser entry through one import; 4.1.3 fixes it in source (04b7726ef). */
export const STOCK_BUILD_PATCH = {
  id: "stock-build-04b7726ef",
  file: "dist/engine/production-runtime/actor/ModelTextureShare.js",
  from: 'from "../../../assets/index.js"',
  to: 'from "../../../assets/browser-index.js"'
};

export function basePackageJson(arm, { auraVersion = AURA_VERSION, tarballs = null, withCli = arm === "bridge" || process.env.AGENT_EVAL_AURA_CLI === "1" } = {}) {
  // `build` is what `aura3d render` (and any agent) runs; the scorer calls vite directly.
  const scripts = { build: "vite build" };
  if (arm === "three") {
    return { name: "eval-base-three", private: true, type: "module", scripts, dependencies: { three: "0.185.1", "@types/three": "0.185.4", vite: "7.3.2", typescript: "5.9.3" } };
  }
  const dependencies = { "@aura3d/engine": auraVersion, "@aura3d/assets": auraVersion, vite: "7.3.2", typescript: "5.9.3" };
  // C1: the native arm gets the N6 agent tools (aura3d info/examples/validate/render), the bridge arm also import-three.
  if (withCli) dependencies["@aura3d/cli"] = auraVersion;
  // Optional engine peers a scaffolded project ships (for example "@dimforge/rapier3d-compat@0.20.0" for physics), as name@version pairs.
  for (const spec of (process.env.AGENT_EVAL_EXTRA_AURA_DEPS ?? "").split(",").filter(Boolean)) dependencies[spec.slice(0, spec.lastIndexOf("@"))] = spec.slice(spec.lastIndexOf("@") + 1);
  // C1 bridge arm: the Aura3D base plus three.js for the asset factories and any bridge packages (AGENT_EVAL_EXTRA_BRIDGE_DEPS, e.g. "@aura3d/cli@5.4.0").
  if (arm === "bridge") {
    Object.assign(dependencies, { three: "0.185.1", "@types/three": "0.185.4" });
    for (const spec of (process.env.AGENT_EVAL_EXTRA_BRIDGE_DEPS ?? "").split(",").filter(Boolean)) dependencies[spec.slice(0, spec.lastIndexOf("@"))] = spec.slice(spec.lastIndexOf("@") + 1);
  }
  const pkg = { name: arm === "bridge" ? "eval-base-bridge" : withCli ? "eval-base-aura-cli" : "eval-base-aura", private: true, type: "module", scripts, dependencies };
  if (tarballs) {
    const overrides = {};
    for (const file of readdirSync(tarballs).filter((f) => f.endsWith(".tgz"))) {
      const name = `@aura3d/${file.replace(/^aura3d-/, "").replace(/-\d+\.\d+\.\d+.*\.tgz$/, "")}`;
      overrides[name] = `file:${resolve(tarballs, file)}`;
    }
    for (const dep of ["@aura3d/engine", "@aura3d/assets", ...(withCli ? ["@aura3d/cli"] : [])]) if (overrides[dep]) dependencies[dep] = overrides[dep];
    pkg.overrides = overrides;
  }
  return pkg;
}

/** Idempotent. Returns "applied", "already" or "not-needed" (a version that already carries the fix). */
export function applyStockBuildPatch(nodeModulesDir) {
  const file = join(nodeModulesDir, "@aura3d/engine", STOCK_BUILD_PATCH.file);
  if (!existsSync(file)) return "not-needed";
  const text = readFileSync(file, "utf8");
  if (text.includes(STOCK_BUILD_PATCH.to)) return "already";
  if (!text.includes(STOCK_BUILD_PATCH.from)) return "not-needed";
  writeFileSync(file, text.replace(STOCK_BUILD_PATCH.from, STOCK_BUILD_PATCH.to));
  return "applied";
}

export function installedVersion(nodeModulesDir, name) {
  try {
    return JSON.parse(readFileSync(join(nodeModulesDir, name, "package.json"), "utf8")).version;
  } catch {
    return null;
  }
}

/** Install (once) the arm's published packages, apply the documented dist patch for Aura3D 4.1.2, report the result. */
export function ensureBase(arm, { baseRoot = DEFAULT_BASE_ROOT, auraVersion = AURA_VERSION, tarballs = null, patch = true, run = execFileSync, withCli } = {}) {
  const baseDir = join(baseRoot, arm);
  mkdirSync(baseDir, { recursive: true });
  const pkgPath = join(baseDir, "package.json");
  const wanted = JSON.stringify(basePackageJson(arm, { auraVersion, tarballs, ...(withCli === undefined ? {} : { withCli }) }), null, 2);
  const current = existsSync(pkgPath) ? readFileSync(pkgPath, "utf8") : "";
  if (current !== wanted || !existsSync(join(baseDir, "node_modules"))) {
    writeFileSync(pkgPath, wanted);
    run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: baseDir, stdio: "inherit", timeout: 600000 });
  }
  const nm = join(baseDir, "node_modules");
  const patchResult = arm !== "three" && patch ? applyStockBuildPatch(nm) : "not-applicable";
  return {
    baseDir,
    patch: patchResult,
    versions: {
      engine: installedVersion(nm, "@aura3d/engine"),
      cli: installedVersion(nm, "@aura3d/cli"),
      three: installedVersion(nm, "three"),
      vite: installedVersion(nm, "vite"),
      typescript: installedVersion(nm, "typescript")
    }
  };
}
