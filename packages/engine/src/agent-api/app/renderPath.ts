// beat-three.js L-P1: pick the render path for one mount (direct canvas MSAA vs HDR multisampled target).

import { isQualityMode, qrCoreOutputOn, resolveRenderPath, withDirectPath, type AuraQualityMode, type RenderPathDecision } from "@aura3d/rendering";
import type { AuraBloomFusion, QrFlags } from "@aura3d/rendering/contracts";
import type { AuraCreateAppOptions, AuraSceneSnapshot } from "../nodes/types.js";
import { groups } from "../nodes/groups.js";
import { parseBloomFusionOption } from "./rendererOptions.js";

/** What `app.diagnostics().renderPath` reports. */
export interface AuraRenderPathReport {
  readonly path: RenderPathDecision["path"];
  readonly quality: AuraQualityMode;
  readonly reason: string;
  /** Bloom pass fusion in effect: the selected mode under quality `auto`/`cinematic`, `"off"` otherwise (`production` never fuses). */
  readonly bloomFusion: AuraBloomFusion | "off";
}

/** Fusion is allowed only under quality `auto` or `cinematic`; this is the single predicate the mount and the report share. */
export function bloomFusionAllowed(quality: AuraQualityMode): boolean {
  return quality === "auto" || quality === "cinematic";
}

function reportedBloomFusion(quality: AuraQualityMode, options: AuraCreateAppOptions): AuraBloomFusion | "off" {
  const mode = parseBloomFusionOption(options.renderer);
  return bloomFusionAllowed(quality) ? mode : "off";
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

export function isDirectRenderPath(canvas: object | undefined): boolean {
  return canvas !== undefined && directPathCanvases.has(canvas);
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
  const seen = new Set<string>();
  const note = (message: string): void => {
    if (seen.has(message)) return;
    seen.add(message);
    blockers.push(message);
  };
  for (const node of groups.flatten(snapshot.nodes)) {
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

function requestedQuality(options: AuraCreateAppOptions): AuraQualityMode | undefined {
  // `?aura3d-render=<mode>` wins over the option (like `?aura3d-quality=`): compare a page's two render paths without a rebuild.
  const fromUrl = typeof location !== "undefined" ? new URLSearchParams(location.search).get("aura3d-render") : null;
  if (fromUrl !== null) {
    if (!isQualityMode(fromUrl)) throw new Error(`QUALITY_OPTION_INVALID:?aura3d-render=${fromUrl} (expected auto|production|safe-basic|cinematic)`);
    return fromUrl;
  }
  if (options.quality !== undefined) {
    if (!isQualityMode(options.quality)) {
      throw new Error(`QUALITY_OPTION_INVALID:quality=${String(options.quality)} (expected auto|production|safe-basic|cinematic)`);
    }
    return options.quality;
  }
  // `renderer.qualityProfile` is a deprecated pixel-ratio/draw-budget preset, not a pipeline request.
  return undefined;
}

export function resolveAppRenderPath(snapshot: AuraSceneSnapshot, options: AuraCreateAppOptions, flags: QrFlags): AppRenderPath {
  const quality = requestedQuality(options) ?? "auto";
  if (!qrCoreOutputOn(flags)) {
    const explicit = flags.values.A3D_QR_CORE_OUTPUT !== undefined;
    return {
      report: { path: "direct", quality, reason: explicit ? "A3D_QR_CORE_OUTPUT is off: legacy LDR route" : "A3D_QR_CORE is off: legacy LDR route (its own post chain is kept)", bloomFusion: reportedBloomFusion(quality, options) },
      flags,
      direct: false
    };
  }
  if (flags.values.A3D_QR_CORE_OUTPUT !== undefined) {
    return { report: { path: "hdr-msaa", quality, reason: "A3D_QR_CORE_OUTPUT is set explicitly", bloomFusion: reportedBloomFusion(quality, options) }, flags, direct: false };
  }
  const decision = resolveRenderPath({ quality, blockers: quality === "auto" ? renderPathBlockers(snapshot, options) : [] });
  return {
    report: { path: decision.path, quality: decision.quality, reason: decision.reason, bloomFusion: reportedBloomFusion(decision.quality, options) },
    flags: decision.path === "direct" ? withDirectPath(flags) : flags,
    direct: decision.path === "direct"
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
