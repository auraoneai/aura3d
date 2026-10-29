// beat-three.js L-P1: pick the render path for one mount (direct canvas MSAA vs HDR multisampled target).

import { directPathItemBlockers, isQualityMode, qrCoreOutputOn, resolveBloomFusionConfig, resolveRenderPath, withDirectPath, type AuraQualityMode, type BloomFusionConfig, type DirectPathItemLike, type RenderPathDecision } from "@aura3d/rendering";
import type { AuraBloomFusion, QrFlags } from "@aura3d/rendering/contracts";
import type { AuraCreateAppOptions, AuraModelNode, AuraSceneSnapshot } from "../nodes/types.js";
import { groups } from "../nodes/groups.js";
import { ignoreInvalidUrlValue, parseBloomFusionOption, type UrlOptionPolicy } from "./rendererOptions.js";

/** What `app.diagnostics().renderPath` reports. */
export interface AuraRenderPathReport {
  readonly path: RenderPathDecision["path"];
  readonly quality: AuraQualityMode;
  readonly reason: string;
  /**
   * Bloom pass fusion mode that applies to this mount. `"off"` whenever no fused bloom pass can be issued: quality `production` or
   * `safe-basic`, the direct path (no post chain), the legacy LDR route (not HDR, so the pyramid never fuses), or a scene with no
   * bloom effect. Otherwise the selected mode. The pyramid itself additionally needs a five-mip-or-fewer plan, which depends on the
   * canvas size and is only known at render time.
   */
  readonly bloomFusion: AuraBloomFusion | "off";
}

/** Fusion is allowed only under quality `auto` or `cinematic`; the mount (`applyRenderPathToCanvas`) and the report both use this. */
export function bloomFusionAllowed(quality: AuraQualityMode): boolean {
  return quality === "auto" || quality === "cinematic";
}

/**
 * The bloom fusion mode to report. The pyramid fuses only on the HDR route (`hdr-msaa`) and only when the scene has a bloom
 * effect (the only source of a bloom pass), so every other combination reports `"off"`. The option is validated first so a
 * typo throws whatever the quality.
 */
function reportedBloomFusion(quality: AuraQualityMode, path: RenderPathDecision["path"], legacyLdrRoute: boolean, snapshot: AuraSceneSnapshot, options: AuraCreateAppOptions, search: string | null, policy: UrlOptionPolicy): AuraBloomFusion | "off" {
  const mode = parseBloomFusionOption(options.renderer, search, policy);
  if (!bloomFusionAllowed(quality) || path !== "hdr-msaa" || legacyLdrRoute) return "off";
  const hasBloom = groups.flatten(snapshot.nodes).some((node) => node.kind === "effect" && node.effect === "bloom");
  return hasBloom ? mode : "off";
}

export interface AppRenderPath {
  readonly report: AuraRenderPathReport;
  /** Flags to hand the renderer; the app's own flags unchanged on the HDR path. */
  readonly flags: QrFlags;
  /**
   * True when this mount chose the direct path over the HDR one: the source then carries no
   * postprocess at all (no default tone-mapping chain), so the forward pass renders straight into
   * the canvas framebuffer and encodes in-shader.
   */
  readonly direct: boolean;
  /**
   * Warnings for `diagnostics().warnings`: ignored URL switches (RP-04, `QUALITY_URL_IGNORED:`) and what `safe-basic` does not
   * render (RP-06, `SAFE_BASIC_DROPS:`).
   */
  readonly warnings: readonly string[];
}

const directPathCanvases = new WeakSet<object>();

/** Record (per canvas, per mount) that the direct path was chosen; read by the render-input and clear-colour code. */
export function setDirectRenderPath(canvas: object, direct: boolean): void {
  if (direct) directPathCanvases.add(canvas);
  else directPathCanvases.delete(canvas);
}

const fusedBloomCanvases = new WeakSet<object>();

/** Record (per canvas, per mount) that look-neutral bloom pass fusion is allowed: quality `auto` or `cinematic`, never `production`. */
export function setFusedBloomPasses(canvas: object, enabled: boolean): void {
  if (enabled) fusedBloomCanvases.add(canvas);
  else fusedBloomCanvases.delete(canvas);
}

export function isFusedBloomPasses(canvas: object | undefined): boolean {
  return canvas !== undefined && fusedBloomCanvases.has(canvas);
}

/** Record this mount's route on the canvas: whether it is direct, and whether bloom pass fusion is allowed (one predicate: `bloomFusionAllowed`). */
export function applyRenderPathToCanvas(canvas: object, renderPath: Pick<AppRenderPath, "direct" | "report">): void {
  setDirectRenderPath(canvas, renderPath.direct);
  setFusedBloomPasses(canvas, bloomFusionAllowed(renderPath.report.quality));
}

/** The device fields the fused bloom pyramid reads. */
export interface BloomFusionDevice {
  bloomFusedPasses?: boolean;
  bloomFusion?: BloomFusionConfig;
}

/**
 * Configure a freshly created render device for this canvas's route: fused bloom passes plus the selected mode when the mount
 * allowed fusion (`auto` / `cinematic`), nothing at all otherwise so `production` keeps the original pass sequence.
 */
export function configureBloomFusionDevice(device: BloomFusionDevice, canvas: object | undefined, rendererOptions: AuraCreateAppOptions["renderer"]): void {
  if (!isFusedBloomPasses(canvas)) return;
  device.bloomFusedPasses = true;
  device.bloomFusion = resolveBloomFusionConfig(parseBloomFusionOption(rendererOptions));
}

export function isDirectRenderPath(canvas: object | undefined): boolean {
  return canvas !== undefined && directPathCanvases.has(canvas);
}

/*
 * RP-01 / RP-03: reasons, found after the path was chosen, why this canvas must leave the direct path. The direct-path decision
 * reads the authored snapshot, so it cannot see a GLB's own BLEND or transmission materials (known only once decoded) or a custom
 * post pass registered after mount. Each mount on the canvas reads these as extra blockers, so the re-mount takes the HDR target.
 */
const directPathVetoes = new WeakMap<object, Map<string, number>>();

/** Add a reason that keeps `canvas` off the direct path; returns a release function (reference counted per reason). */
export function vetoDirectPath(canvas: object, reason: string): () => void {
  let reasons = directPathVetoes.get(canvas);
  if (!reasons) directPathVetoes.set(canvas, (reasons = new Map()));
  reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (reasons!.get(reason) ?? 1) - 1;
    if (count > 0) reasons!.set(reason, count);
    else reasons!.delete(reason);
  };
}

export function directPathVetoReasons(canvas: object | undefined): string[] {
  return canvas === undefined ? [] : [...(directPathVetoes.get(canvas)?.keys() ?? [])];
}

/** RP-01: decoded-material blockers of a mounted scene's GLB actors (their render items at the default placement). */
export function decodedModelDirectPathBlockers(actors: readonly { readonly actor: { collectRenderItems(): readonly DirectPathItemLike[] } }[]): string[] {
  if (actors.length === 0) return [];
  const items: DirectPathItemLike[] = [];
  for (const entry of actors) {
    try {
      items.push(...entry.actor.collectRenderItems());
    } catch {
      // An actor that cannot collect here is not evidence either way; the frame loop reports its own errors.
    }
  }
  return directPathItemBlockers(items);
}

const decodedBlockers = new WeakMap<object, readonly string[]>();

/** Called by the mount once its GLBs are decoded (direct path only); read once by the frame loop through {@link takeDecodedDirectPathBlockers}. */
export function recordDecodedDirectPathBlockers(canvas: object, blockers: readonly string[]): void {
  if (blockers.length > 0) decodedBlockers.set(canvas, blockers);
  else decodedBlockers.delete(canvas);
}

export function takeDecodedDirectPathBlockers(canvas: object): readonly string[] {
  const blockers = decodedBlockers.get(canvas) ?? [];
  decodedBlockers.delete(canvas);
  return blockers;
}

/** Effects the forward pass draws itself; every other effect is a post pass or a frame contributor that reads the HDR target. */
const FORWARD_ONLY_EFFECTS: ReadonlySet<string> = new Set(["fog"]);
const DIRECT_SAFE_NODE_KINDS: ReadonlySet<string> = new Set(["model", "primitive", "group", "light", "environment", "interaction", "label"]);

/** Reasons this scene needs the HDR target. Conservative: anything not known to render identically on the direct path is listed. */
export function renderPathBlockers(snapshot: AuraSceneSnapshot, options: AuraCreateAppOptions): string[] {
  const blockers: string[] = [];
  if (options.output !== undefined || options.renderer?.output !== undefined) blockers.push("output options (tone mapping, exposure, dithering) are authored");
  if (options.renderer?.backend !== undefined && options.renderer.backend !== "webgl2") blockers.push(`backend ${String(options.renderer.backend)}`);
  if (typeof location !== "undefined" && /[?&](aura3d-tonemap|tm|aura3d-exp|exp)=/.test(location.search)) blockers.push("URL tone-mapping or exposure override");
  if (snapshot.backgroundToneMapped === false) blockers.push("background opts out of tone mapping");
  // RP-02: the background-image shader encodes with its own ACES fit (Narkowicz), not the r185 curve the direct path's forward
  // shader uses, so on the direct path the backdrop and the scene would be tone-mapped differently (linear 0.18 grey: 141 vs 127).
  if (snapshot.backgroundImage !== undefined) blockers.push("background image");
  for (const reason of nodeDirectPathBlockers(snapshot.nodes)) blockers.push(reason);
  return blockers;
}

/**
 * The node-level part of {@link renderPathBlockers}: effects other than fog, node kinds the direct path does not draw, HDRI
 * environments, and custom, transmissive or transparent materials (authored, from the asset manifest, or overrides). Also used for
 * nodes added at runtime (RP-03).
 */
export function nodeDirectPathBlockers(nodes: AuraSceneSnapshot["nodes"]): string[] {
  const blockers: string[] = [];
  const seen = new Set<string>();
  const note = (message: string): void => {
    if (seen.has(message)) return;
    seen.add(message);
    blockers.push(message);
  };
  for (const node of groups.flatten(nodes)) {
    if (node.kind === "effect") {
      if (!FORWARD_ONLY_EFFECTS.has(node.effect)) note(`effect "${node.effect}"`);
      continue;
    }
    if (!DIRECT_SAFE_NODE_KINDS.has(node.kind)) {
      note(`${node.kind} node`);
      continue;
    }
    // A visible HDRI background is encoded by the environment-background shader's own (different) filmic curve.
    if (node.kind === "environment" && node.environment === "hdri") note("hdri environment");
    if (node.kind !== "model" && node.kind !== "primitive") continue;
    if (node.kind === "model") for (const reason of modelAssetBlockers(node)) note(reason);
    const material = node.material;
    if (!material) continue;
    if (material.kind !== undefined) note(`${material.kind} material`);
    if (material.shader !== undefined) note(`shader material "${material.shader}"`);
    if (typeof material.transmission === "number" && material.transmission > 0) note("transmission material");
    // Blending happens after the in-shader encode on the direct path (display space) but before it on the HDR path (linear).
    if (material.alphaMode === "blend" || material.blend !== undefined || (typeof material.opacity === "number" && material.opacity < 1)) note("transparent material");
  }
  return blockers;
}

/**
 * RP-01: material facts the asset manifest records for a typed GLB (`metadata.materialMetadata`, written by `aura3d assets add`
 * and `assets typegen`), plus `materialOverrides` opacity. A BLEND or partly transparent material blends after the in-shader encode
 * on the direct path. Transmission is not in the manifest; the mount catches it after decode (`decodedModelDirectPathBlockers`).
 */
function modelAssetBlockers(node: AuraModelNode): string[] {
  const reasons: string[] = [];
  const facts = (node.asset?.metadata as { readonly materialMetadata?: unknown } | undefined)?.materialMetadata;
  if (Array.isArray(facts)) {
    const transparent = facts.some((fact: { alphaMode?: unknown; opacity?: unknown } | null) =>
      fact !== null && typeof fact === "object"
      // glTF ignores base-colour alpha on OPAQUE and MASK materials, so opacity counts only when no alpha mode was recorded.
      && (typeof fact.alphaMode === "string" ? fact.alphaMode.toUpperCase() === "BLEND" : typeof fact.opacity === "number" && fact.opacity < 1));
    if (transparent) reasons.push("model asset has a transparent (BLEND) material");
  }
  if (node.materialOverrides?.some((override) => typeof override.opacity === "number" && override.opacity < 1)) reasons.push("transparent material override");
  return reasons;
}

function requestedQuality(options: AuraCreateAppOptions, search: string | null, policy: UrlOptionPolicy): AuraQualityMode | undefined {
  let fromOptions: AuraQualityMode | undefined;
  if (options.quality !== undefined) {
    if (!isQualityMode(options.quality)) {
      throw new Error(`QUALITY_OPTION_INVALID:quality=${String(options.quality)} (expected auto|production|safe-basic|cinematic)`);
    }
    fromOptions = options.quality;
  }
  // `?aura3d-render=<mode>` wins over the option (like `?aura3d-quality=`): compare a page's two render paths without a rebuild.
  // RP-04: a typo there warns and keeps the code option (strict apps still throw).
  const fromUrl = search ? new URLSearchParams(search).get("aura3d-render") : null;
  if (fromUrl !== null) {
    if (isQualityMode(fromUrl)) return fromUrl;
    ignoreInvalidUrlValue(`?aura3d-render=${fromUrl} (expected auto|production|safe-basic|cinematic); using "${fromOptions ?? "auto"}"`, policy);
  }
  // `renderer.qualityProfile` is a deprecated pixel-ratio/draw-budget preset, not a pipeline request.
  return fromOptions;
}

export interface ResolveAppRenderPathContext {
  /** URL query to read the debug switches from; defaults to `location.search`. */
  readonly search?: string | null;
  /** Reasons found after mount that keep this canvas off the direct path (see {@link vetoDirectPath}). */
  readonly extraBlockers?: readonly string[];
}

export function resolveAppRenderPath(snapshot: AuraSceneSnapshot, options: AuraCreateAppOptions, flags: QrFlags, context: ResolveAppRenderPathContext = {}): AppRenderPath {
  const search = context.search !== undefined ? context.search : typeof location !== "undefined" ? location.search : null;
  const warnings: string[] = [];
  const policy: UrlOptionPolicy = { strict: options.strict ?? flags.on("A3D_QR_STRICT"), warnings };
  const quality = requestedQuality(options, search, policy) ?? "auto";
  if (!qrCoreOutputOn(flags)) {
    const explicit = flags.values.A3D_QR_CORE_OUTPUT !== undefined;
    return {
      report: { path: "direct", quality, reason: explicit ? "A3D_QR_CORE_OUTPUT is off: legacy LDR route" : "A3D_QR_CORE is off: legacy LDR route (its own post chain is kept)", bloomFusion: reportedBloomFusion(quality, "direct", true, snapshot, options, search, policy) },
      flags,
      direct: false,
      warnings
    };
  }
  if (flags.values.A3D_QR_CORE_OUTPUT !== undefined) {
    return { report: { path: "hdr-msaa", quality, reason: "A3D_QR_CORE_OUTPUT is set explicitly", bloomFusion: reportedBloomFusion(quality, "hdr-msaa", false, snapshot, options, search, policy) }, flags, direct: false, warnings };
  }
  // RP-06: blockers are computed for safe-basic too, so what it does not render is named instead of dropped silently.
  const blockers = quality === "auto" || quality === "safe-basic"
    ? [...new Set([...renderPathBlockers(snapshot, options), ...(context.extraBlockers ?? [])])]
    : [];
  const decision = resolveRenderPath({ quality, blockers });
  if (quality === "safe-basic" && blockers.length > 0) {
    warnings.push(`SAFE_BASIC_DROPS: quality "safe-basic" renders on the direct path, which has no post chain or HDR target, so these are not rendered: ${blockers.join("; ")}. Use quality "auto" or "production" to keep them.`);
  }
  return {
    report: { path: decision.path, quality: decision.quality, reason: decision.reason, bloomFusion: reportedBloomFusion(decision.quality, decision.path, false, snapshot, options, search, policy) },
    flags: decision.path === "direct" ? withDirectPath(flags) : flags,
    direct: decision.path === "direct",
    warnings
  };
}

/**
 * Whether the WebGL drawing buffer must survive presentation: capture and
 * evidence runs read the canvas after the frame was presented. An explicit
 * `preserveDrawingBuffer` option wins; otherwise `?capture=1` / `?qa=1`.
 */
export function wantsPreservedDrawingBuffer(
  options: Pick<AuraCreateAppOptions, "preserveDrawingBuffer">,
  search: string | null = typeof location !== "undefined" ? location.search : null
): boolean {
  if (typeof options.preserveDrawingBuffer === "boolean") return options.preserveDrawingBuffer;
  if (!search) return false;
  const params = new URLSearchParams(search);
  const on = (key: string): boolean => {
    const raw = params.get(key);
    return raw !== null && raw !== "0" && raw.toLowerCase() !== "false";
  };
  return on("capture") || on("qa");
}
