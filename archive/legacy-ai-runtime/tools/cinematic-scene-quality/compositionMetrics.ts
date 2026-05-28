import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CinematicPngStats } from "./pngStats";

export interface CinematicCompositionGate {
  readonly id: string;
  readonly pass: boolean;
  readonly actual: number | string | boolean;
  readonly threshold?: number | string | boolean;
  readonly detail: string;
}

export interface CinematicSourceEvidence {
  readonly routePath: string;
  readonly providerMode: "fixture" | "mock" | "live" | "local";
  readonly backend: string;
  readonly domOverlayCount: number;
  readonly cssOverlaySelectors: readonly string[];
  readonly rendererOwnedHeroProps: readonly string[];
  readonly rendererOwnedEnvironment: readonly string[];
  readonly rendererOwnedVfx: readonly string[];
  readonly realAssets: readonly string[];
  readonly placeholderAssets: readonly string[];
  readonly productTurntableSignals: readonly string[];
}

export function evaluateCinematicCompositionMetrics(
  stats: CinematicPngStats,
  source: CinematicSourceEvidence
): readonly CinematicCompositionGate[] {
  return [
    minGate("hero-subject-coverage", stats.largestForegroundComponentCoverage, 0.035, "Hero subject is visibly present."),
    minGate("center-composition", stats.centerForegroundCoverage, 0.025, "Subject/story beat is readable in the central frame."),
    minGate("environment-coverage", stats.foregroundBoundsCoverage, 0.18, "Frame includes readable environment/set coverage."),
    boolGate("real-rendered-asset", source.realAssets.length > 0, "At least one real renderer asset is present."),
    boolGate("renderer-owned-story-prop", source.rendererOwnedHeroProps.length > 0, "Required story prop is renderer-owned, not DOM/CSS."),
    boolGate("renderer-owned-environment", source.rendererOwnedEnvironment.length > 0, "Required environment/set geometry is renderer-owned, not DOM/CSS."),
    boolGate("renderer-owned-vfx", source.rendererOwnedVfx.length > 0, "Rain/fog/glow evidence is renderer-owned, not DOM/CSS."),
    boolGate("not-placeholder-only", source.realAssets.length > 0 && source.placeholderAssets.length === 0, "Public cinematic route is not placeholder-only."),
    boolGate("not-dom-css-only", source.domOverlayCount === 0 || source.rendererOwnedVfx.length + source.rendererOwnedHeroProps.length + source.rendererOwnedEnvironment.length >= 3, "DOM/CSS overlays cannot satisfy cinematic VFX, prop, or environment evidence."),
    boolGate("not-product-turntable", source.productTurntableSignals.length === 0, "North-star cinematic route cannot use product-turntable orbit framing as the shot.")
  ];
}

export function collectCinematicSourceEvidence(root: string, routePath = "apps/cinematic-prompt-to-scene"): CinematicSourceEvidence {
  const indexPath = join(root, routePath, "index.html");
  const mainPath = join(root, routePath, "src", "main.ts");
  const stylesPath = join(root, routePath, "src", "styles.css");
  const fixturePath = join(root, routePath, "src", "cinematic-demo-fixtures.ts");
  const index = readOptional(indexPath);
  const main = readOptional(mainPath);
  const styles = readOptional(stylesPath);
  const fixtureSource = readOptional(fixturePath);
  const routeSource = `${index}\n${main}\n${styles}\n${fixtureSource}`;
  const fixture = parseFixture(index);
  const assets = Array.isArray(fixture?.assets) ? fixture.assets as readonly Record<string, unknown>[] : [];
  const providerMode = normalizeProviderMode(String(fixture?.providerMode ?? (routeSource.includes('providerMode: "fixture"') ? "fixture" : "fixture")));
  const backend = String(fixture?.backend ?? (routeSource.includes('backend: "webgpu"') ? "webgpu" : routeSource.includes('backend: "webgl2"') ? "webgl2" : "unknown"));
  const cssOverlaySelectors = [
    ...findSelector(styles, "rain"),
    ...findSelector(styles, "fog"),
    ...findSelector(styles, "neon"),
    ...findSelector(styles, "story-flower"),
    ...findSelector(styles, "alley-wall")
  ];
  const domOverlayCount = (index.match(/class="(?:[^"]*\s)?(?:cinematic-atmosphere|rain|fog|neon-tube|story-flower|alley-wall)\b/g) ?? []).length;
  const realAssets = assets
    .filter((asset) => isRendererOwnedAsset(asset))
    .map((asset) => String(asset.id ?? asset.source ?? "asset"))
    .concat([...routeSource.matchAll(/source:\s*"([^"]+\.(?:glb|gltf|hdr|ktx2|png|jpg|jpeg|webp))"/gi)].map((match) => match[1] ?? "asset"));
  const placeholderAssets = assets
    .filter((asset) => /placeholder|primitive|cube|sphere/i.test(`${String(asset.id ?? "")} ${String(asset.role ?? "")} ${String(asset.source ?? "")}`))
    .map((asset) => String(asset.id ?? asset.source ?? "placeholder"));
  const rendererOwnedHeroProps = assets
    .filter((asset) => /prop|flower|story/i.test(String(asset.role ?? asset.id ?? "")) && isRendererOwnedAsset(asset))
    .map((asset) => String(asset.id ?? "prop"));
  const rendererOwnedEnvironment = assets
    .filter((asset) => /environment|set|alley|street|world/i.test(String(asset.role ?? asset.id ?? "")) && isRendererOwnedAsset(asset))
    .map((asset) => String(asset.id ?? "environment"));
  const rendererOwnedVfx = [
    ...assets
      .filter((asset) => /vfx|rain|fog|glow|particle|bloom|neon/i.test(`${String(asset.role ?? "")} ${String(asset.id ?? "")}`) && isRendererOwnedAsset(asset))
      .map((asset) => String(asset.id ?? "vfx")),
    ...(/rendererOwnedVfx|renderItems.*vfx|RainParticleSystem|FogVolumeSystem|GlowCardSystem|CinematicPostProcess/.test(routeSource)
      ? ["source-renderer-owned-vfx"]
      : [])
  ];
  const productTurntableSignals = [
    ...(main.includes("startWowShowcase") ? ["wow-showcase-product-viewer"] : []),
    ...(/orbitSpeed|viewer\.orbit|cameraOrbit/i.test(main) && !/dolly|timeline|shotRuntime/i.test(main) ? ["orbit-camera-turntable"] : [])
  ];
  return {
    routePath,
    providerMode,
    backend,
    domOverlayCount,
    cssOverlaySelectors,
    rendererOwnedHeroProps,
    rendererOwnedEnvironment,
    rendererOwnedVfx,
    realAssets,
    placeholderAssets,
    productTurntableSignals
  };
}

function minGate(id: string, actual: number, threshold: number, detail: string): CinematicCompositionGate {
  return {
    id,
    pass: actual >= threshold,
    actual: Number(actual.toFixed(6)),
    threshold,
    detail
  };
}

function boolGate(id: string, pass: boolean, detail: string): CinematicCompositionGate {
  return { id, pass, actual: pass, threshold: true, detail };
}

function findSelector(css: string, token: string): readonly string[] {
  return css.includes(token) ? [token] : [];
}

function readOptional(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function parseFixture(index: string): Record<string, unknown> | undefined {
  const match = index.match(/<script id="cinematic-scene-fixture" type="application\/json">\s*([\s\S]*?)\s*<\/script>/);
  if (!match?.[1]) return undefined;
  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function normalizeProviderMode(value: string): CinematicSourceEvidence["providerMode"] {
  if (value === "live" || value === "local" || value === "mock") return value;
  return "fixture";
}

function isRendererOwnedAsset(asset: Record<string, unknown>): boolean {
  const source = String(asset.source ?? "");
  return (
    /^renderer:(?:procedural|scene|vfx|material)\//i.test(source)
    || /\.(?:glb|gltf|hdr|ktx2|png|jpg|jpeg|webp)$/i.test(source)
  ) && !/overlay|dom|css|html/i.test(source);
}
