import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

/**
 * Route-local evidence helpers shared by the package and monorepo corridor
 * browser specs.  The old receipt only said `ready: true`; it did not bind the
 * result to the source or to a real screenshot, which made a stale/empty
 * receipt indistinguishable from current playable evidence.
 */

export const CORRIDOR_ROUTE = "/examples/neon-corridor-strike/" as const;
export const CORRIDOR_ROUTE_HEALTH_SCHEMA = "aura3d-route-health/1.0" as const;

const ROUTE_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const REPO_ROOT = resolve(ROUTE_ROOT, "../..");

export interface CorridorRuntimeEvidence {
  readonly claimLabel?: string;
  readonly rendererMode?: string;
  readonly rendererFallback?: string;
  readonly typedAssets?: readonly string[];
  readonly primitiveCount?: number;
  readonly knownLimits?: readonly string[];
  readonly status?: string;
  readonly hp?: number;
  readonly ammo?: number;
  readonly reserve?: number;
  readonly shotsFired?: number;
  readonly hits?: number;
  readonly kills?: number;
  readonly pickups?: number;
  readonly resets?: number;
  readonly pointerLockRequested?: number;
  readonly objective?: string;
  readonly exitReached?: boolean;
}

export interface CorridorScreenshotReceipt {
  readonly status: "captured";
  readonly path: string;
  readonly sha256: `sha256-${string}`;
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
}

export interface CorridorRouteSourceSnapshot {
  readonly root: "examples/neon-corridor-strike";
  readonly hash: `sha256-${string}`;
  readonly files: readonly string[];
}

export interface CorridorRouteHealthReceipt {
  readonly schema: typeof CORRIDOR_ROUTE_HEALTH_SCHEMA;
  readonly generatedAt: string;
  readonly appId: "neon-corridor-strike";
  readonly route: typeof CORRIDOR_ROUTE;
  readonly status: "ready" | "error";
  readonly pass: boolean;
  readonly classification: "prototype";
  readonly publicShowcase: false;
  readonly promotionStatus: "hold-public-showcase-until-independent-human-visual-review";
  readonly renderer: {
    readonly path: "createAuraApp root safe API";
    readonly mode: string;
    readonly fallback: string;
  };
  readonly primaryAssets: readonly {
    readonly id: string;
    readonly typedRef: string;
    readonly role: string;
    readonly status: "typed-primary-asset";
    readonly manifestHash: string;
  }[];
  readonly primitiveStatus: {
    readonly sourceOccurrences: number;
    readonly role: "set-dressing-with-typed-primary-assets";
  };
  readonly claimStatus: {
    readonly status: "prototype";
    readonly label: "prototype";
    readonly blockers: readonly string[];
  };
  readonly source: CorridorRouteSourceSnapshot;
  readonly evidence: {
    readonly status: "captured" | "blocked";
    readonly screenshotEvidence: string;
    readonly screenshot: CorridorScreenshotReceipt;
    readonly gameplay: {
      readonly status: "passed" | "blocked";
      readonly claimLabel: string;
      readonly routeReady: boolean;
      readonly runStatus: string;
      readonly shotsFired: number;
      readonly hits: number;
      readonly kills: number;
      readonly pickups: number;
      readonly resets: number;
    };
  };
  readonly routeGate: {
    readonly requiresKeyboardDelta: true;
    readonly pass: boolean;
    readonly focusedSpecs: readonly string[];
  };
}

/**
 * Hash every route input that can change the mounted output.  Generated test
 * reports and `dist/` are intentionally excluded; the receipt should become
 * stale when authored source, manifest, HTML, or route configuration changes.
 */
export function corridorRouteSourceSnapshot(): CorridorRouteSourceSnapshot {
  const candidates = [
    ...walk(resolve(ROUTE_ROOT, "src")).filter((path) => path.endsWith(".ts")),
    resolve(ROUTE_ROOT, "index.html"),
    resolve(ROUTE_ROOT, "aura.assets.json"),
    resolve(ROUTE_ROOT, "package.json"),
    resolve(ROUTE_ROOT, "playwright.config.ts"),
    resolve(ROUTE_ROOT, "vite.config.ts")
  ].filter((path) => existsSync(path)).sort();
  const files = candidates.map((path) => relative(REPO_ROOT, path).replaceAll("\\", "/"));
  const canonical = candidates.map((path) => {
    const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
    return `${relative(REPO_ROOT, path).replaceAll("\\", "/")}\0${hash}\n`;
  }).join("");
  return {
    root: "examples/neon-corridor-strike",
    hash: `sha256-${createHash("sha256").update(canonical).digest("hex")}`,
    files
  };
}

/** Build a source-bound receipt for a screenshot produced by Playwright. */
export function corridorScreenshotReceipt(absolutePath: string, bytes?: Uint8Array): CorridorScreenshotReceipt {
  const payload = bytes ? Buffer.from(bytes) : readFileSync(absolutePath);
  const dimensions = pngDimensions(payload);
  const path = relative(REPO_ROOT, resolve(absolutePath)).replaceAll("\\", "/");
  return {
    status: "captured",
    path,
    sha256: `sha256-${createHash("sha256").update(payload).digest("hex")}`,
    sizeBytes: payload.byteLength,
    width: dimensions.width,
    height: dimensions.height
  };
}

/**
 * Write the canonical route-health receipt.  `reportPath` may be absolute (as
 * the tests use) or relative to the repository; all artifact links are emitted
 * repository-relative so downstream auditors can resolve them unambiguously.
 */
export function writeCorridorRouteHealthReceipt(options: {
  readonly reportPath: string;
  readonly screenshotPath: string;
  readonly screenshotBytes?: Uint8Array;
  readonly evidence: CorridorRuntimeEvidence | undefined;
  readonly routeReady: boolean;
  readonly primitiveCount?: number;
  readonly gameplayStatus?: "passed" | "blocked";
}): CorridorRouteHealthReceipt {
  const source = corridorRouteSourceSnapshot();
  const screenshot = corridorScreenshotReceipt(options.screenshotPath, options.screenshotBytes);
  const manifest = readManifest();
  const primaryIds = [
    ["neonCorridorContainmentWorld", "assets.neonCorridorContainmentWorld", "primaryWorld"],
    ["neonContainmentWardenA", "assets.neonContainmentWardenA", "primaryCharacter"],
    ["neonContainmentWardenB", "assets.neonContainmentWardenB", "primaryCharacter"],
    ["neonContainmentPulseRifle", "assets.neonContainmentPulseRifle", "primaryWeapon"],
    ["ammoCrate", "assets.ammoCrate", "pickup"],
    ["medkit", "assets.medkit", "pickup"]
  ] as const;
  const primaryAssets = primaryIds.map(([id, typedRef, role]) => ({
    id,
    typedRef,
    role,
    status: "typed-primary-asset" as const,
    manifestHash: String(manifest.get(id)?.hash ?? "")
  }));
  const routeReady = options.routeReady === true;
  const gameplayStatus = options.gameplayStatus ?? (routeReady ? "passed" : "blocked");
  const report: CorridorRouteHealthReceipt = {
    schema: CORRIDOR_ROUTE_HEALTH_SCHEMA,
    generatedAt: new Date().toISOString(),
    appId: "neon-corridor-strike",
    route: CORRIDOR_ROUTE,
    status: routeReady ? "ready" : "error",
    pass: routeReady && gameplayStatus === "passed" && screenshot.sizeBytes > 1000,
    classification: "prototype",
    publicShowcase: false,
    promotionStatus: "hold-public-showcase-until-independent-human-visual-review",
    renderer: {
      path: "createAuraApp root safe API",
      mode: options.evidence?.rendererMode ?? "unknown",
      fallback: options.evidence?.rendererFallback ?? "unknown"
    },
    primaryAssets,
    primitiveStatus: {
      sourceOccurrences: options.primitiveCount ?? options.evidence?.primitiveCount ?? 0,
      role: "set-dressing-with-typed-primary-assets"
    },
    claimStatus: {
      status: "prototype",
      label: "prototype",
      blockers: ["independent human visual review required before promotion"]
    },
    source,
    evidence: {
      status: routeReady && screenshot.sizeBytes > 1000 ? "captured" : "blocked",
      screenshotEvidence: screenshot.path,
      screenshot,
      gameplay: {
        status: gameplayStatus,
        claimLabel: options.evidence?.claimLabel ?? "prototype",
        routeReady,
        runStatus: options.evidence?.status ?? "unknown",
        shotsFired: options.evidence?.shotsFired ?? 0,
        hits: options.evidence?.hits ?? 0,
        kills: options.evidence?.kills ?? 0,
        pickups: options.evidence?.pickups ?? 0,
        resets: options.evidence?.resets ?? 0
      }
    },
    routeGate: {
      requiresKeyboardDelta: true,
      pass: routeReady && gameplayStatus === "passed",
      focusedSpecs: [
        "tests/browser/neon-corridor-strike.spec.ts",
        "tests/browser/neon-corridor-strike-shot-visual.spec.ts",
        "examples/neon-corridor-strike/tests/gameplay-smoke.spec.ts"
      ]
    }
  };
  const outputPath = resolve(options.reportPath);
  mkdirFor(outputPath);
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function readManifest(): Map<string, { readonly hash?: string }> {
  const parsed = JSON.parse(readFileSync(resolve(ROUTE_ROOT, "aura.assets.json"), "utf8")) as {
    readonly assets?: readonly { readonly id?: string; readonly hash?: string }[];
  };
  return new Map((parsed.assets ?? []).flatMap((asset) => asset.id ? [[asset.id, asset] as const] : []));
}

function walk(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const child = resolve(path, entry);
    return statSync(child).isDirectory() ? walk(child) : [child];
  });
}

function mkdirFor(path: string): void {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
}

function pngDimensions(bytes: Uint8Array): { readonly width: number; readonly height: number } {
  if (bytes.byteLength >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = Buffer.from(bytes);
    return { width: view.readUInt32BE(16), height: view.readUInt32BE(20) };
  }
  return { width: 0, height: 0 };
}
