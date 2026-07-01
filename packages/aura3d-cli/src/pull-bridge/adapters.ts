import * as assetIndex from "@aura3d/asset-index";
import type { SourceAdapter } from "@aura3d/asset-index";

const { defaultAdapters } = assetIndex;

type AdapterFactory = () => SourceAdapter;

function optionalFactory(name: string): AdapterFactory | undefined {
  const candidate = (assetIndex as Record<string, unknown>)[name];
  return typeof candidate === "function" ? (candidate as AdapterFactory) : undefined;
}

function hasEnv(name: string, env: NodeJS.ProcessEnv): boolean {
  const value = env[name];
  return typeof value === "string" && value.trim().length > 0;
}

export function buildSearchAdapters(
  env: NodeJS.ProcessEnv = process.env,
): SourceAdapter[] {
  const starterPack = optionalFactory("createAnimationStarterPackAdapter");
  const starterAdapters = starterPack ? [starterPack()] : [];

  const auraIndex = optionalFactory("createAuraIndexAdapter");
  if (auraIndex) return [...starterAdapters, auraIndex()];

  const adapters: SourceAdapter[] = [...starterAdapters, ...defaultAdapters()];

  const polyHaven = optionalFactory("createPolyHavenAdapter");
  if (polyHaven && !adapters.some((a) => a.id === "polyhaven")) {
    adapters.push(polyHaven());
  }

  if (hasEnv("SKETCHFAB_API_TOKEN", env) || hasEnv("SKETCHFAB_TOKEN", env)) {
    const sketchfab = optionalFactory("createSketchfabAdapter");
    if (sketchfab) adapters.push(sketchfab());
  }
  if (hasEnv("POLY_PIZZA_API_KEY", env) || hasEnv("POLYPIZZA_API_KEY", env)) {
    const polyPizza = optionalFactory("createPolyPizzaAdapter");
    if (polyPizza) adapters.push(polyPizza());
  }

  return adapters;
}

export function buildDeepLinkAdapter(): SourceAdapter | undefined {
  const factory = optionalFactory("createMarketplaceDeepLinkAdapter");
  return factory ? factory() : undefined;
}
