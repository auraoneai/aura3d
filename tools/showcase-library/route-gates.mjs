import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
export const defaultRepoRoot = resolve(toolDir, "../..");
export const routeGateConfigRelativePath = "tools/showcase-library/route-gates.json";
const releaseClasses = new Set([
  "release-ready candidate",
  "internal-diagnostic",
  "game-layer-diagnostic",
  "prototype-blocked",
  "index-route",
  "removed-from-public-showcase"
]);

export function getShowcaseRouteGateConfigPath(root = defaultRepoRoot) {
  return resolve(root, routeGateConfigRelativePath);
}

export function readShowcaseRouteGateConfig(root = defaultRepoRoot) {
  const configPath = getShowcaseRouteGateConfigPath(root);
  const raw = readFileSync(configPath, "utf8");
  const config = JSON.parse(raw);
  validateRouteGateConfig(config, configPath);
  return config;
}

export function listShowcaseRouteGates(root = defaultRepoRoot, options = {}) {
  const publishedOnly = options.publishedOnly ?? true;
  const config = readShowcaseRouteGateConfig(root);
  return config.routes.filter((route) => !publishedOnly || route.published);
}

export function showcaseRouteGateHash(root = defaultRepoRoot) {
  const raw = readFileSync(getShowcaseRouteGateConfigPath(root), "utf8");
  return createHash("sha256").update(raw).digest("hex");
}

export function showcaseRouteById(id, root = defaultRepoRoot) {
  const route = readShowcaseRouteGateConfig(root).routes.find((entry) => entry.id === id);
  if (!route) throw new Error(`Missing showcase route gate for ${id}`);
  return route;
}

function validateRouteGateConfig(config, configPath) {
  if (!config || typeof config !== "object") {
    throw new Error(`${configPath} must contain a JSON object`);
  }
  if (config.schema !== "aura3d-showcase-route-gates/1.0") {
    throw new Error(`${configPath} has unsupported schema ${String(config.schema)}`);
  }
  if (!Array.isArray(config.routes)) {
    throw new Error(`${configPath} must contain a routes array`);
  }

  const ids = new Set();
  const paths = new Set();
  const globals = new Set();
  for (const route of config.routes) {
    if (!route || typeof route !== "object") throw new Error(`${configPath} contains an invalid route`);
    for (const key of ["id", "label", "path", "globalName"]) {
      if (typeof route[key] !== "string" || !route[key].trim()) {
        throw new Error(`${configPath} route ${String(route.id)} is missing ${key}`);
      }
    }
    if (!/^showcase-[a-z0-9-]+$/.test(route.id)) {
      throw new Error(`${configPath} route id ${String(route.id)} must match showcase-[a-z0-9-]+`);
    }
    if (route.path !== `/apps/${route.id}/`) {
      throw new Error(`${configPath} route ${route.id} path must be /apps/${route.id}/`);
    }
    if (!releaseClasses.has(route.releaseClass)) {
      throw new Error(`${configPath} route ${route.id} must define a supported releaseClass`);
    }
    if (route.releaseClass === "index-route" && route.id !== "showcase-index") {
      throw new Error(`${configPath} only showcase-index can use releaseClass index-route`);
    }
    if (route.id === "showcase-index" && route.releaseClass !== "index-route") {
      throw new Error(`${configPath} showcase-index must use releaseClass index-route`);
    }
    if (ids.has(route.id)) throw new Error(`${configPath} duplicates route id ${route.id}`);
    if (paths.has(route.path)) throw new Error(`${configPath} duplicates route path ${route.path}`);
    if (globals.has(route.globalName)) throw new Error(`${configPath} duplicates route global ${route.globalName}`);
    ids.add(route.id);
    paths.add(route.path);
    globals.add(route.globalName);

    if (!Array.isArray(route.primaryAssets)) {
      throw new Error(`${configPath} route ${route.id} must define primaryAssets`);
    }
    if (route.primaryAssets.length > 0) {
      if (!route.primaryAssetRoles || typeof route.primaryAssetRoles !== "object" || Array.isArray(route.primaryAssetRoles)) {
        throw new Error(`${configPath} route ${route.id} must define primaryAssetRoles`);
      }
      for (const assetId of route.primaryAssets) {
        if (typeof route.primaryAssetRoles[assetId] !== "string" || !route.primaryAssetRoles[assetId].trim()) {
          throw new Error(`${configPath} route ${route.id} must define a role for primary asset ${assetId}`);
        }
      }
      if (typeof route.routePrimaryHeroAsset !== "string" || !route.primaryAssets.includes(route.routePrimaryHeroAsset)) {
        throw new Error(`${configPath} route ${route.id} must define routePrimaryHeroAsset from primaryAssets`);
      }
      if (!Array.isArray(route.secondaryPrimaryAssets)) {
        throw new Error(`${configPath} route ${route.id} must define secondaryPrimaryAssets`);
      }
      const expectedSecondary = route.primaryAssets.filter((assetId) => assetId !== route.routePrimaryHeroAsset).sort();
      const actualSecondary = route.secondaryPrimaryAssets.slice().sort();
      if (expectedSecondary.join(",") !== actualSecondary.join(",")) {
        throw new Error(`${configPath} route ${route.id} secondaryPrimaryAssets must equal primaryAssets minus routePrimaryHeroAsset`);
      }
    } else {
      if ("routePrimaryHeroAsset" in route) {
        throw new Error(`${configPath} route ${route.id} cannot define routePrimaryHeroAsset without primaryAssets`);
      }
      if ("secondaryPrimaryAssets" in route && (!Array.isArray(route.secondaryPrimaryAssets) || route.secondaryPrimaryAssets.length > 0)) {
        throw new Error(`${configPath} route ${route.id} cannot define secondaryPrimaryAssets without primaryAssets`);
      }
    }
    if (!Number.isInteger(route.primitiveBudget) || route.primitiveBudget < 0) {
      throw new Error(`${configPath} route ${route.id} must define a nonnegative primitiveBudget`);
    }
    if (typeof route.requiresTypedPrimaryAssets !== "boolean") {
      throw new Error(`${configPath} route ${route.id} must define requiresTypedPrimaryAssets`);
    }
    if (route.gameTemplateStatus !== undefined) {
      validateGameTemplateStatus(route, configPath);
    }
    if (route.requiresAnimationSubjectDelta && !route.animationSubjectDelta) {
      throw new Error(`${configPath} route ${route.id} requires animationSubjectDelta`);
    }
  }
}

function validateGameTemplateStatus(route, configPath) {
  const status = route.gameTemplateStatus;
  if (!status || typeof status !== "object" || Array.isArray(status)) {
    throw new Error(`${configPath} route ${route.id} gameTemplateStatus must be an object`);
  }
  if (typeof status.category !== "string" || !/^[a-z][a-z0-9-]*$/.test(status.category)) {
    throw new Error(`${configPath} route ${route.id} gameTemplateStatus.category is invalid`);
  }
  if (typeof status.publicTemplateReady !== "boolean") {
    throw new Error(`${configPath} route ${route.id} gameTemplateStatus.publicTemplateReady must be boolean`);
  }
  if (route.releaseClass === "release-ready candidate" && status.publicTemplateReady !== true) {
    throw new Error(`${configPath} route ${route.id} cannot be release-ready with an unready game template`);
  }
  if (status.publicTemplateReady === true) {
    if (!Array.isArray(status.evidence) || status.evidence.length === 0) {
      throw new Error(`${configPath} route ${route.id} gameTemplateStatus.evidence is required when publicTemplateReady is true`);
    }
    return;
  }
  if (
    typeof status.blocker !== "string" ||
    (!status.blocker.startsWith("category-template:") && !status.blocker.startsWith("asset-pair:"))
  ) {
    throw new Error(`${configPath} route ${route.id} gameTemplateStatus.blocker must be category-template:* or asset-pair:*`);
  }
  if (!Array.isArray(status.requiredBeforePublic) || status.requiredBeforePublic.length === 0) {
    throw new Error(`${configPath} route ${route.id} gameTemplateStatus.requiredBeforePublic is required`);
  }
}
