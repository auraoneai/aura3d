// N3 plain look path. A simple lit scene whose author picked no look and no output (no `looks.preset`, no `output`
// option, no post effect) renders its authored colours close to what was asked for:
//
//  - output: the Khronos PBR Neutral tone map at exposure 1 instead of the implicit ACES fit. Neutral is the identity
//    below about 0.76 linear (minus a 0.04 toe offset) and compresses highlights without shifting hue, so a `#6a8a3c`
//    ground lit to albedo stays `#6a8a3c` instead of turning pale mint.
//  - no stacked fill: `environments.neutral()` next to an authored hemisphere or ambient light keeps its reflections but
//    yields its diffuse fill to those lights, so the fill is not counted twice (the benchmark's pale spider: neutral room
//    0.55 + hemisphere 0.9 + directional 2.6).
//
// `looks.preset("plain")` asks for the same path explicitly (and adds a shadowed key and a hemisphere fill). Anything
// the author chose wins: an `output` option, any look preset, any post effect, an HDRI, a background image or a
// non-WebGL2 renderer leaves the scene exactly as before (same snapshot object, no output). `createAuraApp({ plainLook:
// false })` opts an app out; `?a3d-plain-look=0` (URL) or `A3D_PLAIN_LOOK=0` (env) turns the default off for A/B captures.

import type { AuraOutputOptions } from "../../contracts/output.js";
import type { AuraSceneNode, AuraSceneSnapshot } from "../nodes/types.js";

/** Group name `looks.preset("plain")` emits. */
export const PLAIN_LOOK_GROUP = "aura-look:plain";

/** Node kinds a plain scene may hold besides lights, non-HDRI environments, skies and fog. */
const PLAIN_GEOMETRY_KINDS: ReadonlySet<string> = new Set(["model", "primitive", "group", "label", "interaction", "line", "points", "sprite", "batched"]);

const plainOutputs = new WeakSet<object>();

/** The output the plain path applies (a fresh frozen object per app, recognisable through {@link isPlainDefaultOutput}). */
export function createPlainOutput(): AuraOutputOptions {
  const output: AuraOutputOptions = Object.freeze({ toneMapping: "neutral", exposure: 1 });
  plainOutputs.add(output);
  return output;
}

/** True for an output object the plain path created (not one the author passed). */
export function isPlainDefaultOutput(output: unknown): boolean {
  return typeof output === "object" && output !== null && plainOutputs.has(output);
}

export function plainLookEnabled(): boolean {
  try {
    if (typeof location !== "undefined" && /[?&]a3d-plain-look=(0|off|false)(&|$)/.test(location.search)) return false;
    if (typeof process !== "undefined" && process.env && /^(0|off|false)$/.test(process.env.A3D_PLAIN_LOOK ?? "")) return false;
  } catch {
    /* no location/process: default on */
  }
  return true;
}

export interface PlainLookAppOptions {
  readonly plainLook?: boolean;
  readonly lighting?: unknown;
  readonly output?: unknown;
  readonly worker?: unknown;
  readonly frameMode?: unknown;
  readonly quality?: unknown;
  readonly renderer?: unknown;
}

/** App options that leave the output to the engine: no `plainLook: false`, output or lighting, main-thread WebGL2, no renderer profile. */
export function plainLookOptionsApply(options: PlainLookAppOptions): boolean {
  if (options.plainLook === false || options.output !== undefined || options.lighting !== undefined) return false;
  if (options.worker !== undefined || options.frameMode === "async") return false;
  if (options.quality !== undefined && options.quality !== "auto") return false;
  if (typeof location !== "undefined" && /[?&](aura3d-tonemap|tm|aura3d-exp|exp)=/.test(location.search)) return false;
  const r = options.renderer as {
    readonly output?: unknown;
    readonly backend?: unknown;
    readonly qualityProfile?: unknown;
    readonly drawingPath?: unknown;
    readonly textureResidency?: unknown;
    readonly mode?: unknown;
    readonly fallback?: unknown;
    readonly requiredFeatures?: readonly unknown[];
  } | undefined;
  if (r === undefined) return true;
  if (r.output !== undefined) return false;
  if (r.backend !== undefined && r.backend !== "webgl2") return false;
  if (r.qualityProfile !== undefined || r.drawingPath !== undefined || r.textureResidency !== undefined) return false;
  if (r.mode !== undefined || r.fallback !== undefined || (r.requiredFeatures?.length ?? 0) > 0) return false;
  return true;
}

type Scan = { plainLook: boolean; otherLook: boolean; authored: boolean; lit: boolean; fill: boolean };

function scan(nodes: readonly AuraSceneNode[], found: Scan): void {
  for (const raw of nodes) {
    const node = raw as unknown as Record<string, unknown> & { kind?: string };
    const kind = node.kind;
    if (kind === "group") {
      const name = typeof node.name === "string" ? node.name : "";
      if (name === PLAIN_LOOK_GROUP) found.plainLook = true;
      else if (name.startsWith("aura-look:")) found.otherLook = true;
      if (node.lookOutput === true || node.lookStage === true) found.otherLook = true;
      scan((node.children as readonly AuraSceneNode[] | undefined) ?? [], found);
      continue;
    }
    if (kind === "light") {
      found.lit = true;
      if ((node.light === "hemisphere" || node.light === "ambient") && (typeof node.intensity !== "number" || node.intensity > 0)) found.fill = true;
      continue;
    }
    if (kind === "environment") {
      found.lit = true;
      if (node.environment === "hdri" || node.environment === "capture") found.authored = true;
      continue;
    }
    if (kind === "sky") {
      found.lit = true;
      continue;
    }
    if (kind === "effect" && node.effect === "fog") continue;
    if (typeof kind === "string" && PLAIN_GEOMETRY_KINDS.has(kind)) continue;
    // A look node, a post effect, a scene kit or any kind this module does not know: the author chose something.
    found.authored = true;
  }
}

/** A neutral environment that yields its diffuse fill to authored hemisphere/ambient lights (keeps reflections). */
const isYieldingNeutral = (node: AuraSceneNode): boolean => {
  const env = node as unknown as { kind?: string; environment?: string; diffuseIntensity?: unknown; lookFill?: unknown };
  return env.kind === "environment" && env.environment === "neutral" && env.diffuseIntensity === undefined && env.lookFill !== true;
};

function markYield(nodes: readonly AuraSceneNode[]): readonly AuraSceneNode[] {
  let changed = false;
  const out = nodes.map((node) => {
    if (isYieldingNeutral(node)) {
      changed = true;
      return { ...node, plainDiffuseYield: true } as unknown as AuraSceneNode;
    }
    const children = (node as { children?: readonly AuraSceneNode[] }).children;
    if (node.kind === "group" && Array.isArray(children)) {
      const next = markYield(children);
      if (next !== children) {
        changed = true;
        return { ...node, children: next } as AuraSceneNode;
      }
    }
    return node;
  });
  return changed ? out : nodes;
}

export interface PlainLookResolution {
  /** `"default"`: nothing authored; `"preset"`: `looks.preset("plain")`. */
  readonly source: "default" | "preset";
  readonly snapshot: AuraSceneSnapshot;
  readonly output: AuraOutputOptions;
}

/**
 * The plain path for one scene, or `null` when the author chose a look, an output or a post effect (or the scene has no
 * authored light at all: the 5.1 cold-start look covers bare geometry). Pure: never mutates `snapshot`.
 */
export function resolvePlainLook(snapshot: AuraSceneSnapshot, options: PlainLookAppOptions): PlainLookResolution | null {
  if (!plainLookOptionsApply(options)) return null;
  const found: Scan = { plainLook: false, otherLook: false, authored: false, lit: false, fill: false };
  scan(snapshot.nodes, found);
  let source: PlainLookResolution["source"];
  if (found.plainLook && !found.otherLook) source = "preset";
  else {
    if (!plainLookEnabled()) return null;
    if (found.plainLook || found.otherLook || found.authored || !found.lit) return null;
    if (snapshot.backgroundImage !== undefined || snapshot.backgroundToneMapped === false) return null;
    source = "default";
  }
  const nodes = found.fill ? markYield(snapshot.nodes) : snapshot.nodes;
  return { source, snapshot: nodes === snapshot.nodes ? snapshot : { ...snapshot, nodes }, output: createPlainOutput() };
}

/** Apply the no-stack rule to a later scene (`app.setScene`) of an app already on the plain path. */
export function withPlainFillYield(snapshot: AuraSceneSnapshot): AuraSceneSnapshot {
  const found: Scan = { plainLook: false, otherLook: false, authored: false, lit: false, fill: false };
  scan(snapshot.nodes, found);
  if (!found.fill) return snapshot;
  const nodes = markYield(snapshot.nodes);
  return nodes === snapshot.nodes ? snapshot : { ...snapshot, nodes };
}

/**
 * `app.setScene` on an app that booted on the plain path: the next scene re-decides against the author's own options.
 * A plain next scene keeps the neutral output (and the no-stack rule); a scene that authors a look, post effect or HDRI
 * returns no output, so the app falls back to what the author passed (a look's own output preset applies again instead
 * of being overridden by the neutral tone map). Apps that did not boot on the plain path never call this.
 */
export function plainLookForNextScene(
  next: AuraSceneSnapshot,
  authoredOptions: PlainLookAppOptions
): { readonly snapshot: AuraSceneSnapshot; readonly output?: AuraOutputOptions } {
  const resolved = resolvePlainLook(next, authoredOptions);
  return resolved ? { snapshot: resolved.snapshot, output: resolved.output } : { snapshot: next };
}
