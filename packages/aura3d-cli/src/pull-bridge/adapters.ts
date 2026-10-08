import * as assetIndex from "@aura3d/asset-index";
import type { SourceAdapter } from "@aura3d/asset-index";
import { readAuraLibrary } from "../library-manifest.js";

const { defaultAdapters, createAuraLibraryAdapter } = assetIndex;

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
  projectDir: string = process.cwd(),
): SourceAdapter[] {
  const starterPack = optionalFactory("createAnimationStarterPackAdapter");
  const starterAdapters = starterPack ? [starterPack()] : [];

  // §6.6: the curated library is always the first source — its entries resolve
  // first in ranking via library/lookDevApproved/artDirection terms and pull
  // via local copy in runResolve.
  const library = readAuraLibrary(projectDir);
  const libraryAdapters = library && typeof createAuraLibraryAdapter === "function"
    ? [createAuraLibraryAdapter({ manifest: library })]
    : [];

  const auraIndex = optionalFactory("createAuraIndexAdapter");
  if (auraIndex) return [...libraryAdapters, ...starterAdapters, auraIndex()];

  const adapters: SourceAdapter[] = [...libraryAdapters, ...starterAdapters, ...defaultAdapters()];

  const polyHaven = optionalFactory("createPolyHavenAdapter");
  if (polyHaven && !adapters.some((a) => a.id === "polyhaven")) {
    adapters.push(polyHaven());
  }
  if (!adapters.some((a) => a.id === "ambientcg")) {
    const ambientcg = optionalFactory("createAmbientCgAdapter");
    if (ambientcg) adapters.push(ambientcg());
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
