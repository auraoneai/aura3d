/**
 * PRD-15 T5.1 — scaffold `packages/engine/src/public/index.ts` and the
 * `docs/architecture/root-export-dispositions.json` ledger.
 *
 * Keep-set for "." (§6.6): the app import tally (apps/, templates/,
 * examples/, benchmarks/), every contracts/index.ts name, and every
 * lanes/index.ts name. Every other current "." name gets a disposition:
 *   - "live"     — stays on "." (keep-set)
 *   - "deprecated" — stays on "." as a @deprecated re-export because a
 *     non-15-owned file still imports it, or it is a §6.6 union name
 *   - "drop"     — leaves "." entirely (no in-repo consumer, or only
 *     15-owned consumers which this lane migrates)
 *
 * `to` destination rules (§6.6 + §6.1): evidence regex → ./devtools;
 * @aura3d/rendering + engine render modules → ./renderer; domain packages →
 * their subpath; engine-internal names that cannot physically join a domain
 * package → ./devtools; A3D-* legacy apps names → deleted.
 *
 * CLI:
 *   pnpm exec tsx --tsconfig tsconfig.base.json tools/export-surface/scaffold.ts \
 *     --write            # emit public/index.ts + dispositions.json
 *     --check            # diff mode (CI)
 *     --report           # print the live/dead split without writing
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { moduleExports, deprecatedUnionNames } from "./inventory.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const INVENTORY_PATH = join(REPO_ROOT, "docs/architecture/root-export-inventory.json");
const DISPOSITIONS_PATH = join(REPO_ROOT, "docs/architecture/root-export-dispositions.json");
const PUBLIC_ENTRY = join(REPO_ROOT, "packages/engine/src/public/index.ts");

const EVIDENCE_RE = /(Evidence|Report|Readiness|Proof|Audit|Claim|Parity|Receipt|Superiority|Probe|CurrentRoutes|ExternalParity)/;

const DOMAIN_SUBPATHS: Readonly<Record<string, string>> = {
  rendering: "./renderer",
  assets: "./assets",
  audio: "./audio",
  input: "./input",
  controls: "./controls",
  scripting: "./scripting",
  "editor-runtime": "./editor-runtime",
  workflows: "./workflows",
  physics: "./physics",
  "physics-rapier": "./physics",
  scene: "./scene",
  math: "./math",
  ecs: "./ecs",
  animation: "./animation"
};

interface InventoryName {
  readonly kind: "value" | "type";
  readonly deprecated: boolean;
  readonly deprecatedTo?: string;
  readonly origin: string;
  readonly inContracts: boolean;
  readonly inLanes: boolean;
  readonly consumers: readonly { file: string; owner: string; typeOnly: boolean }[];
  readonly starConsumers: readonly string[];
}

interface Inventory {
  readonly names: Record<string, InventoryName>;
  readonly appTally: readonly string[];
}

export interface Disposition {
  readonly name: string;
  readonly kind: "value" | "type";
  readonly from: ".";
  readonly to: string;
  readonly disposition: "live" | "deprecated" | "drop";
  readonly reason: string;
  readonly consumers: readonly string[];
  readonly owners: readonly string[];
}

function destinationFor(name: string, row: InventoryName): { to: string; reason: string } {
  if (row.deprecatedTo === "deleted") return { to: "deleted", reason: "§6.6 union name — deleted in 4.0.0" };
  if (row.deprecatedTo) {
    const to = row.deprecatedTo.replace(/^@aura3d\/engine\//, "./");
    // §6.6 union names: engine-internal implementations can only land on
    // engine-hosted entries ("."/"./renderer"/"./devtools") — a domain
    // package (./assets etc.) cannot re-export an engine-local symbol.
    if (to === "./renderer" || to === "./devtools" || !row.origin.startsWith("packages/engine/")) {
      return { to, reason: "§6.6 union destination" };
    }
    return {
      to: "./devtools",
      reason: `§6.6 union destination was ${to} but the implementation lives in engine (${row.origin}); a domain package cannot re-export it — dev subpath until the next minor`
    };
  }
  if (EVIDENCE_RE.test(name)) return { to: "./devtools", reason: "evidence/report name → devtools (§6.6)" };
  const pkg = /^packages\/([^/]+)\//.exec(row.origin)?.[1] ?? "";
  if (pkg && DOMAIN_SUBPATHS[pkg]) return { to: DOMAIN_SUBPATHS[pkg]!, reason: `domain package ${pkg} → ${DOMAIN_SUBPATHS[pkg]}` };
  if (/engine\/src\/(devtools|testing)\//.test(row.origin)) return { to: "./devtools", reason: "engine devtools/testing origin" };
  if (/engine\/src\/(advanced-runtime|production-runtime|renderer)\//.test(row.origin)) return { to: "./renderer", reason: "engine renderer/runtime origin" };
  if (/engine\/src\/.*(Asset|GLTF|Gltf|Resource|Loader)/.test(row.origin)) return { to: "./devtools", reason: "engine-internal asset helper → ./devtools (§6.6 says ./assets; cannot join the 05-owned package)" };
  if (/^(A3D|createA3D)/.test(name) || pkg === "apps" || pkg === "product-studio") return { to: "deleted", reason: "A3D-legacy/apps surface deleted in 4.0.0 (§6.6)" };
  return { to: "deleted", reason: "not in §6.6 keep-set; no destination subpath applies" };
}

export function computeDispositions(inv: Inventory): Disposition[] {
  const depUnion = deprecatedUnionNames();
  const keep = new Set(inv.appTally.filter((n) => !depUnion.has(n) && !EVIDENCE_RE.test(n)));
  const out: Disposition[] = [];
  for (const [name, row] of Object.entries(inv.names)) {
    const inKeep = (keep.has(name) || row.inContracts || row.inLanes) && !depUnion.has(name) && !EVIDENCE_RE.test(name);
    const consumers = row.consumers.map((c) => c.file);
    const owners = [...new Set(row.consumers.map((c) => c.owner))].sort();
    const foreignConsumers = row.consumers.filter((c) => c.owner !== "15");
    const { to, reason } = destinationFor(name, row);

    if (inKeep) {
      out.push({ name, kind: row.kind, from: ".", to: ".", disposition: "live", reason: "§6.6 keep-set (app tally / contracts / lanes)", consumers, owners });
      continue;
    }
    if (row.deprecated || depUnion.has(name)) {
      out.push({ name, kind: row.kind, from: ".", to, disposition: "deprecated", reason: `§6.6 union name — kept at 4.0.0, deprecated until the next minor; ${reason}`, consumers, owners });
      continue;
    }
    if (foreignConsumers.length > 0) {
      out.push({
        name, kind: row.kind, from: ".", to, disposition: "deprecated",
        reason: `consumed by non-15 files — kept as @deprecated re-export until owners migrate (${reason})`,
        consumers, owners
      });
      continue;
    }
    out.push({
      name, kind: row.kind, from: ".", to,
      disposition: "drop",
      reason: consumers.length ? `consumed only by 15-owned files (migrated by this lane); ${reason}` : `no in-repo consumers; ${reason}`,
      consumers, owners
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function emitPublicIndex(dispositions: readonly Disposition[]): string {
  const live = dispositions.filter((d) => d.disposition === "live");
  const dep = dispositions.filter((d) => d.disposition === "deprecated");
  const liveValues = live.filter((d) => d.kind === "value").map((d) => d.name);
  const liveTypes = live.filter((d) => d.kind === "type").map((d) => d.name);

  const lines: string[] = [
    "/**",
    " * `@aura3d/engine` \".\" — the PRD-15 §6.6 public surface.",
    " * Explicit named exports only: the §6.6 keep-set (game/template/benchmark",
    " * import tally + contracts + lane contracts) as live exports, plus the",
    " * union of still-consumed names as @deprecated re-exports kept at 4.0.0",
    " * (§6.6 step 3). Generated by tools/export-surface/scaffold.ts — regenerate with",
    " * `pnpm exec tsx --tsconfig tsconfig.base.json tools/export-surface/scaffold.ts --write`.",
    " */",
    "",
    "// Lane provide() side-effects — how lane contract implementations reach \".\".",
    'import "../lanes/index.js";',
    ""
  ];

  const chunk = (names: readonly string[]): string[] =>
    names.length ? [`export { ${names.join(", ")} } from "../agent-api/index.js";`] : [];
  const chunkType = (names: readonly string[]): string[] =>
    names.length ? [`export type { ${names.join(", ")} } from "../agent-api/index.js";`] : [];

  lines.push("// ── Live surface (§6.6 keep-set) ────────────────────────────────────────");
  lines.push(...chunk(liveValues));
  lines.push(...chunkType(liveTypes));
  lines.push("");
  lines.push("// ── Deprecated union (kept at 4.0.0 per §6.6 step 3 — removes in the next minor; each names its destination) ──");
  for (const d of dep) {
    const use = d.to === "deleted" ? "No replacement — removes next minor." : `Use \`${d.to.replace(/^\./, "@aura3d/engine")}\`.`;
    const kw = d.kind === "type" ? "export type" : "export";
    lines.push(`/** @deprecated ${use} Kept at 4.0.0 — removes in the next minor once its blocking lane's request lands. */`);
    lines.push(`${kw} { ${d.name} } from "../agent-api/index.js";`);
  }
  lines.push("");
  return lines.join("\n");
}

export function emitSubpathEntry(dispositions: readonly Disposition[], subpath: "./renderer" | "./devtools"): string {
  const moved = dispositions.filter((d) => d.to === subpath);
  const values = moved.filter((d) => d.kind === "value").map((d) => d.name);
  const types = moved.filter((d) => d.kind === "type").map((d) => d.name);
  const title = subpath === "./renderer" ? "@aura3d/engine/renderer" : "@aura3d/engine/devtools";
  const section = subpath === "./renderer" ? "§7.2" : "§7.3";
  const lines: string[] = [
    "/**",
    ` * \`${title}\` — PRD-15 ${section} public subpath.`,
    " * Includes every name dispositioned here from the \".\" surface",
    " * (docs/architecture/root-export-dispositions.json). Regenerate with",
    " * `tools/export-surface/scaffold.ts --write`.",
    " */",
    ""
  ];
  if (subpath === "./renderer") {
    lines.push(
      "// §7.2 core surface — the one renderer and its frame/IO types.",
      'export { Renderer } from "@aura3d/rendering";',
      'export type { CameraLike, RenderDeviceDiagnostics, RenderItem, RendererInput, RendererOptions, RenderSource, ResizeToDisplayOptions, ResizeToDisplayResult, RendererAnimationLoop } from "@aura3d/rendering";',
      'export type { RendererCreateOptions, RendererFrameResult, RendererLifecycle } from "@aura3d/rendering/contracts";',
      "",
      "// Scene graph + material/geometry classes the compiler emits (§7.2 curated list).",
      'export { Scene, SceneNode, Object3D, Group, Mesh, SkinnedMesh, InstancedMesh, PerspectiveCamera, OrthographicCamera, DirectionalLight, PointLight, SpotLight, Renderable } from "@aura3d/scene";',
      'export type { MeshOptions, Object3DOptions, RenderableDescriptor } from "@aura3d/scene";',
      'export { Geometry, Material, PBRMaterial, UnlitMaterial, TexturedPBRMaterial, TexturedUnlitMaterial, SkinnedLitMaterial, InstancedPBRMaterial, TextureBinding } from "@aura3d/rendering";',
      'export type { RenderMaterial } from "@aura3d/rendering";',
      "",
      '/** @deprecated 3.1.0, kept at 4.0.0 — removes in the next minor. Alias of Renderer. */',
      'export { Renderer as A3DRenderer } from "@aura3d/rendering";',
      '/** @deprecated 3.1.0, kept at 4.0.0 — removes in the next minor. Alias of RendererCreateOptions. */',
      'export type { RendererCreateOptions as A3DRendererOptions } from "@aura3d/rendering/contracts";',
      ""
    );
  }
  const devOnlyCurated = new Set<string>();
  if (subpath === "./devtools") {
    lines.push(
      "// §7.3 — dev-only evidence/diagnostics; never imported by \".\" or \"./renderer\".",
      'export { createAuraAssetPanelRows } from "../devtools/AuraAssetPanel.js";',
      'export type { AuraAssetPanelRow } from "../devtools/AuraAssetPanel.js";',
      'export { createAuraDiagnosticsOverlay } from "../devtools/AuraDiagnosticsOverlay.js";',
      'export type { AuraDiagnosticsOverlay } from "../devtools/AuraDiagnosticsOverlay.js";',
      'export { createAuraPerformancePanelSnapshot } from "../devtools/AuraPerformancePanel.js";',
      'export type { AuraPerformancePanelSnapshot } from "../devtools/AuraPerformancePanel.js";',
      ""
    );
    for (const n of ["createAuraAssetPanelRows", "AuraAssetPanelRow", "createAuraDiagnosticsOverlay", "AuraDiagnosticsOverlay", "createAuraPerformancePanelSnapshot", "AuraPerformancePanelSnapshot"]) devOnlyCurated.add(n);
  }
  const alreadyExported = new Set([
    "Renderer", "CameraLike", "RenderDeviceDiagnostics", "RenderItem", "RendererInput",
    "RendererOptions", "RenderSource", "ResizeToDisplayOptions", "ResizeToDisplayResult",
    "RendererAnimationLoop", "RendererCreateOptions", "RendererFrameResult", "RendererLifecycle",
    "Scene", "SceneNode", "Object3D", "Group", "Mesh", "SkinnedMesh", "InstancedMesh",
    "PerspectiveCamera", "OrthographicCamera", "DirectionalLight", "PointLight", "SpotLight",
    "Renderable", "MeshOptions", "Object3DOptions", "RenderableDescriptor",
    "Geometry", "Material", "PBRMaterial", "UnlitMaterial", "TexturedPBRMaterial",
    "TexturedUnlitMaterial", "SkinnedLitMaterial", "InstancedPBRMaterial", "TextureBinding",
    "RenderMaterial", "A3DRenderer", "A3DRendererOptions"
  ]);
  const restValues = values.filter((n) => !alreadyExported.has(n) && !devOnlyCurated.has(n));
  const restTypes = types.filter((n) => !alreadyExported.has(n) && !devOnlyCurated.has(n));
  if (restValues.length) lines.push(`export { ${restValues.join(", ")} } from "../agent-api/index.js";`);
  if (restTypes.length) lines.push(`export type { ${restTypes.join(", ")} } from "../agent-api/index.js";`);
  lines.push("");
  return lines.join("\n");
}

function main(): void {
  const args = process.argv.slice(2);
  const inv = JSON.parse(readFileSync(INVENTORY_PATH, "utf8")) as Inventory;
  const dispositions = computeDispositions(inv);
  const byDisp = { live: 0, deprecated: 0, drop: 0 };
  const byTo = new Map<string, number>();
  for (const d of dispositions) {
    byDisp[d.disposition]++;
    byTo.set(d.to, (byTo.get(d.to) ?? 0) + 1);
  }
  const liveValues = dispositions.filter((d) => d.disposition === "live" && d.kind === "value").length;
  const liveTotal = byDisp.live;
  console.log(JSON.stringify({ ...byDisp, liveValues, liveTotal, byTo: Object.fromEntries([...byTo].sort()) }, null, 2));

  if (args.includes("--report")) return;

  const indexSrc = emitPublicIndex(dispositions);
  const ledger = {
    generatedAt: new Date().toISOString(),
    source: INVENTORY_PATH.replace(`${REPO_ROOT}/`, ""),
    entries: dispositions
  };

  const prevIndex = (() => { try { return readFileSync(PUBLIC_ENTRY, "utf8"); } catch { return null; } })();
  const prevLedger = (() => { try { return readFileSync(DISPOSITIONS_PATH, "utf8"); } catch { return null; } })();
  const nextLedger = JSON.stringify(ledger, null, 2) + "\n";

  const rendererSrc = emitSubpathEntry(dispositions, "./renderer");
  const devtoolsSrc = emitSubpathEntry(dispositions, "./devtools");
  const RENDERER_ENTRY = join(REPO_ROOT, "packages/engine/src/public/renderer.ts");
  const DEVTOOLS_ENTRY = join(REPO_ROOT, "packages/engine/src/public/devtools.ts");

  if (args.includes("--check")) {
    let ok = true;
    if (prevIndex !== indexSrc) { console.error(`stale: ${PUBLIC_ENTRY.replace(`${REPO_ROOT}/`, "")}`); ok = false; }
    for (const [path, src] of [[RENDERER_ENTRY, rendererSrc], [DEVTOOLS_ENTRY, devtoolsSrc]] as const) {
      const prev = (() => { try { return readFileSync(path, "utf8"); } catch { return null; } })();
      if (prev !== src) { console.error(`stale: ${path.replace(`${REPO_ROOT}/`, "")}`); ok = false; }
    }
    const prevNoTs = prevLedger ? JSON.stringify(JSON.parse(prevLedger)) : null;
    const nextNoTs = JSON.stringify({ ...ledger, generatedAt: "" });
    if (prevLedger === null || JSON.stringify({ ...JSON.parse(prevLedger), generatedAt: "" }) !== nextNoTs) { console.error(`stale: ${DISPOSITIONS_PATH.replace(`${REPO_ROOT}/`, "")}`); ok = false; }
    process.exit(ok ? 0 : 1);
  }

  if (args.includes("--write")) {
    mkdirSync(dirname(PUBLIC_ENTRY), { recursive: true });
    writeFileSync(PUBLIC_ENTRY, indexSrc);
    writeFileSync(RENDERER_ENTRY, rendererSrc);
    writeFileSync(DEVTOOLS_ENTRY, devtoolsSrc);
    mkdirSync(dirname(DISPOSITIONS_PATH), { recursive: true });
    writeFileSync(DISPOSITIONS_PATH, nextLedger);
    console.log(`wrote public/{index,renderer,devtools}.ts + ${DISPOSITIONS_PATH.replace(`${REPO_ROOT}/`, "")}`);
  } else {
    console.log("pass --write to emit files, --check to diff");
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
