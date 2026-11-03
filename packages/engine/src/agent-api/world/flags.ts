/**
 * PRD-10 §4.1/§7.3 — builder-time QR flag read for the `*.surface`-style
 * upgrade paths. Builders run before `createAuraApp` resolves the app's flags,
 * so the builder decides from the same source chain the app will use. The
 * C-36 handlers still gate on the app-resolved flag, so a builder that saw a
 * flag off never produces a world node a flag-off app could see.
 *
 * GU47 E-G (WP-7): the builder read used to see the environment only, so
 * `qualityRebuild: { flags }` and `?a3d-qr=` were ignored at build time and a
 * builder could disagree with its own app. It now resolves exactly like
 * `createAuraApp`: URL `?a3d-qr=` (unless `allowUrlFlags` is false), then the
 * environment, the declared `qualityRebuild`, and flags.state defaults.
 */
import { resolveQrFlags, type QrFlagInput } from "../../contracts/flags.js";
import type { QrFlagName, QrFlags } from "@aura3d/rendering/contracts";
import { soleLiveAuraApp } from "../app/liveApps.js";

/** The `qualityRebuild` option shape of `createAuraApp` / `createGameApp`. */
export interface AuraWorldBuilderFlagSource {
  readonly flags?: QrFlagInput;
  readonly allowUrlFlags?: boolean;
}

type BuilderDeclaration = AuraWorldBuilderFlagSource | QrFlags | null;
type BuilderRegistration = { source: BuilderDeclaration };
type BuilderScope = {
  readonly owner: object;
  override?: { readonly registration: BuilderRegistration | undefined; readonly source: BuilderDeclaration };
};

// An explicit ownerless declaration is retained for standalone builders. App
// scopes never inherit it, even when their own registration has been released.
let declared: BuilderDeclaration = null;
const ownedDeclarations = new WeakMap<object, BuilderRegistration>();
let activeScope: BuilderScope | undefined;

function isResolvedFlags(value: AuraWorldBuilderFlagSource | QrFlags): value is QrFlags {
  return typeof (value as QrFlags).on === "function" && typeof (value as QrFlags).values === "object";
}

/**
 * Declare the app's flags for builder-time reads. Pass the same
 * `qualityRebuild` object you give `createAuraApp` (or an app's resolved
 * `QrFlags`) BEFORE building the scene; `null` clears the declaration.
 * An explicit owner has an identity-checked disposer. Without an owner this
 * sets the standalone declaration, or a temporary override within a builder
 * scope; it never changes another app's registration.
 */
export function setWorldBuilderFlags(source: AuraWorldBuilderFlagSource | QrFlags | null | undefined): void;
export function setWorldBuilderFlags(source: AuraWorldBuilderFlagSource | QrFlags | null | undefined, owner: object): () => void;
export function setWorldBuilderFlags(source: AuraWorldBuilderFlagSource | QrFlags | null | undefined, owner?: object): (() => void) | void {
  const next = source ?? null;
  if (owner !== undefined) {
    const registration = { source: next };
    ownedDeclarations.set(owner, registration);
    return () => {
      if (ownedDeclarations.get(owner) === registration) ownedDeclarations.delete(owner);
    };
  }
  if (activeScope) {
    activeScope.override = { registration: ownedDeclarations.get(activeScope.owner), source: next };
    return;
  }
  declared = next;
}

/**
 * Execute a synchronous builder with a specific app's declaration. Nested
 * scopes and throws restore the previous scope. The scope ends when `build`
 * returns; re-enter it after each await rather than carrying it across tasks.
 */
export function withWorldBuilderFlags<T>(owner: object, build: () => T): T {
  const previous = activeScope;
  activeScope = { owner };
  try {
    return build();
  } finally {
    activeScope = previous;
  }
}

/** The flags a world builder decides with right now (same chain as the app). */
export function worldBuilderFlags(owner?: object): QrFlags {
  let source: BuilderDeclaration;
  if (owner !== undefined) {
    source = ownedDeclarations.get(owner)?.source ?? null;
  } else if (activeScope) {
    const registration = ownedDeclarations.get(activeScope.owner);
    // Do not keep an override from an earlier registration alive after its
    // owner was disposed or rebound while the synchronous builder was running.
    source = activeScope.override && activeScope.override.registration === registration
      ? activeScope.override.source
      : registration?.source ?? null;
  } else {
    // Preserve the single-app builder convenience without choosing one app's
    // flags when several apps are registered. A failed startup is not live.
    const app = soleLiveAuraApp();
    source = declared ?? (app ? ownedDeclarations.get(app)?.source : null) ?? null;
  }
  if (source !== null && isResolvedFlags(source)) return source;
  const proc = (globalThis as { process?: { env?: Readonly<Record<string, string | undefined>> } }).process;
  const href = source?.allowUrlFlags === false
    ? undefined
    : typeof location !== "undefined" && typeof location.href === "string" ? location.href : undefined;
  return resolveQrFlags({
    ...(source?.flags !== undefined ? { options: source.flags } : {}),
    ...(href !== undefined ? { url: href } : {}),
    env: proc?.env ?? {}
  });
}

export function worldBuilderFlagOn(name: QrFlagName, owner?: object): boolean {
  return worldBuilderFlags(owner).on(name);
}

export type AuraWorldSubFlag = "A3D_QR_WORLD_TERRAIN" | "A3D_QR_WORLD_WATER" | "A3D_QR_WORLD_BIOME" | "A3D_QR_WORLD_WIND";

/**
 * §13 — sub-flags are ON BY DEFAULT when `A3D_QR_WORLD` is on; they exist as
 * route-level kill switches, not opt-ins. An explicitly set sub-flag value
 * (`world.biome` / `-world.biome` list tokens, `A3D_QR_WORLD_BIOME=1|0`,
 * per-app flags, a flags.state `default-on` promotion) always wins over the
 * parent default.
 */
export function worldSubflagOn(flags: QrFlags, sub: AuraWorldSubFlag): boolean {
  const v = flags.values[sub];
  if (v !== undefined) return v !== false && v !== "off" && v !== "0";
  return flags.on("A3D_QR_WORLD");
}

/** Builder-time variant of `worldSubflagOn` (same source chain as the app). */
export function worldBuilderSubflagOn(sub: AuraWorldSubFlag, owner?: object): boolean {
  return worldSubflagOn(worldBuilderFlags(owner), sub);
}
