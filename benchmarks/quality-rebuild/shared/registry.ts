/**
 * C-30 — benchmark scene registry aggregator (custodian prd12, CONTRACTS.md
 * §3.8). Wraps the 18 base scenes, aggregates every lane's `scenes/prdNN/`
 * index, and validates:
 *   - unique ids;
 *   - lane ids are `<owner>-<slug>` and match `spec.owner`;
 *   - both adapters exist (a lane scene needs a module under
 *     `aura3d/scenes/<owner>/` AND `three/scenes/<owner>/`);
 *   - `active` entries carry the runtime-required C-30 fields
 *     (`owner`, `referenceProfile`, `masks`, `brokenControls`,
 *     `primaryCriterion`).
 * Validation never throws: a bad entry is `status: "quarantined"` with a
 * `quarantineReason`, and `main.ts` never routes it.
 */
/// <reference types="vite/client" />

import { sceneSpecs } from "./scenes";
import type { RegistryEntry, SceneSpec } from "./types";

export interface BenchSceneRegistration {
  readonly id: string;
  readonly spec: unknown;
  readonly admittedAsReference?: boolean;
  readonly status?: "active" | "quarantined" | "retired";
  readonly quarantineReason?: string;
}

export interface RegisteredScene extends RegistryEntry {
  readonly quarantineReason?: string;
}

import { scenes as prd01 } from "../scenes/prd01/index";
import { scenes as prd02 } from "../scenes/prd02/index";
import { scenes as prd03 } from "../scenes/prd03/index";
import { scenes as prd04 } from "../scenes/prd04/index";
import { scenes as prd05 } from "../scenes/prd05/index";
import { scenes as prd06 } from "../scenes/prd06/index";
import { scenes as prd07 } from "../scenes/prd07/index";
import { scenes as prd08 } from "../scenes/prd08/index";
import { scenes as prd09 } from "../scenes/prd09/index";
import { scenes as prd10 } from "../scenes/prd10/index";
import { scenes as prd11 } from "../scenes/prd11/index";
import { scenes as prd12 } from "../scenes/prd12/index";
import { scenes as prd13 } from "../scenes/prd13/index";
import { scenes as prd14 } from "../scenes/prd14/index";
import { scenes as prd15 } from "../scenes/prd15/index";

const LANE_INDICES: readonly (readonly BenchSceneRegistration[])[] = [
  prd01, prd02, prd03, prd04, prd05, prd06, prd07, prd08,
  prd09, prd10, prd11, prd12, prd13, prd14, prd15
];

const OWNER_PATTERN = /^prd\d{2}-/;

const REQUIRED_ACTIVE_FIELDS: readonly (keyof SceneSpec)[] = [
  "owner",
  "referenceProfile",
  "masks",
  "brokenControls",
  "primaryCriterion"
];

/**
 * Adapter modules that exist on disk. Resolved via `import.meta.glob` so the
 * check runs in the page and under vitest without file-system access.
 */
const ADAPTER_MODULES = import.meta.glob(["../aura3d/scenes/*/*.ts", "../three/scenes/*/*.ts"]);

function adapterPath(engine: "aura3d" | "three", laneId: string): string | undefined {
  const owner = laneId.match(OWNER_PATTERN)?.[0]?.slice(0, -1);
  if (!owner) return undefined;
  const slug = laneId.slice(owner.length + 1);
  return `../${engine}/scenes/${owner}/${slug}.ts`;
}

/** Module path in `main.ts`'s glob space (`./{engine}/scenes/{owner}/{slug}.ts`). */
export function laneAdapterModulePath(engine: "aura3d" | "three", laneId: string): string | undefined {
  const path = adapterPath(engine, laneId);
  return path ? `./${path.slice(3)}` : undefined;
}

export function adapterModules(): Readonly<Record<string, unknown>> {
  return ADAPTER_MODULES;
}

function ownerFromId(id: string): string | undefined {
  return id.match(OWNER_PATTERN)?.[0]?.slice(0, -1);
}

function validateEntry(entry: RegistryEntry & { quarantineReason?: string }): { status: RegistryEntry["status"]; reason?: string } {
  if (entry.status === "retired") return { status: "retired" };
  const spec = entry.spec as Partial<SceneSpec> | undefined;
  const id = entry.id;
  if (!spec || typeof spec !== "object" || spec.id !== id) {
    return { status: "quarantined", reason: "spec.id does not match registration id" };
  }
  if (ownerFromId(id)) {
    if (spec.owner !== ownerFromId(id)) return { status: "quarantined", reason: "owner-prefix" };
    const aura = adapterPath("aura3d", id);
    const three = adapterPath("three", id);
    if (!aura || !three || !(aura in ADAPTER_MODULES) || !(three in ADAPTER_MODULES)) {
      return { status: "quarantined", reason: "missing-adapter" };
    }
  }
  const missing = REQUIRED_ACTIVE_FIELDS.filter((field) => spec[field] === undefined);
  if (missing.length > 0) return { status: "quarantined", reason: `missing-registry-fields: ${missing.join(",")}` };
  if (!Array.isArray(spec.masks) || spec.masks.some((mask) => typeof mask !== "string")) {
    return { status: "quarantined", reason: "invalid masks" };
  }
  if (!Array.isArray(spec.brokenControls) || spec.brokenControls.some((control) => typeof control !== "string")) {
    return { status: "quarantined", reason: "invalid brokenControls" };
  }
  return { status: entry.status === "quarantined" ? "quarantined" : "active", reason: entry.quarantineReason };
}

function wrapBaseScenes(): RegisteredScene[] {
  return Object.values(sceneSpecs).map((spec) => ({ id: spec.id, spec, admittedAsReference: false, status: "active" as const }));
}

const seen = new Set<string>();
const registry: RegisteredScene[] = [];
for (const entry of wrapBaseScenes()) {
  seen.add(entry.id);
  registry.push(entry);
}
for (const lane of LANE_INDICES) {
  for (const registration of lane) {
    const entry: RegisteredScene = {
      id: registration.id,
      spec: registration.spec,
      admittedAsReference: registration.admittedAsReference ?? false,
      status: registration.status ?? "active",
      quarantineReason: registration.quarantineReason
    };
    if (seen.has(entry.id)) {
      registry.push({ ...entry, status: "quarantined", quarantineReason: "duplicate-id" });
      continue;
    }
    seen.add(entry.id);
    const { status, reason } = validateEntry(entry);
    registry.push({ ...entry, status, ...(reason ? { quarantineReason: reason } : {}) });
  }
}

export const REGISTRY: readonly RegisteredScene[] = registry;

/** Registrations fed into the registry (superset kept for conformance + tests). */
export const ALL_SCENES: readonly BenchSceneRegistration[] = LANE_INDICES.flat();

export const ACTIVE_SCENES: readonly RegisteredScene[] = registry.filter((entry) => entry.status === "active");
export const ACTIVE_SCENE_IDS: readonly string[] = [
  ...registry.filter((entry) => entry.status === "active").map((entry) => entry.id)
];

export function getRegisteredScene(id: string): RegisteredScene | undefined {
  return registry.find((entry) => entry.id === id);
}

export function getActiveSceneSpec(id: string): SceneSpec | undefined {
  const entry = registry.find((candidate) => candidate.id === id && candidate.status === "active");
  return entry?.spec as SceneSpec | undefined;
}
