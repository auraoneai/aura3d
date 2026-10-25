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

const NON_MESH_FORMATS = new Set(["texture-set", "hdr", "image"]);
const NON_MESH_QUERY = /\b(textures?|materials?|pbr|tiles?|tiling|tileable|hdri?|hdr|environment|skybox|sky|ground|floor|wall|surface|fabric|bricks?|concrete|asphalt|wood grain)\b/i;

/** True when the query is for a surface, texture or environment rather than a mesh. */
export function queryWantsNonMesh(query: string | undefined): boolean {
  return query !== undefined && NON_MESH_QUERY.test(query);
}

export function meshOnlyAdapter(adapter: SourceAdapter): SourceAdapter {
  return {
    ...adapter,
    async search(query, ctx) {
      const results = await adapter.search(query, ctx);
      return results.filter((asset) => !NON_MESH_FORMATS.has(asset.format));
    },
  };
}

/**
 * `query` narrows the sources for a model search: texture sets, HDRIs and images
 * (ambientCG, Poly Haven maps) only appear when the query asks for a surface,
 * texture or environment, so "sword" never returns "Bricks 105".
 */
export function buildSearchAdapters(
  env: NodeJS.ProcessEnv = process.env,
  projectDir: string = process.cwd(),
  query?: string,
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

  const adapters: SourceAdapter[] = [...libraryAdapters, ...starterAdapters];

  // Open, zero-auth, licence-clear sources: Khronos samples, Poly Haven,
  // ambientCG and the jsDelivr CC0 mirror. There is no hosted catalog.
  for (const fallback of defaultAdapters()) {
    if (!adapters.some((a) => a.id === fallback.id)) adapters.push(fallback);
  }

  const polyHaven = optionalFactory("createPolyHavenAdapter");
  if (polyHaven && !adapters.some((a) => a.id === "poly-haven")) {
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

  return query !== undefined && !queryWantsNonMesh(query) ? adapters.map(meshOnlyAdapter) : adapters;
}

export function buildDeepLinkAdapter(): SourceAdapter | undefined {
  const factory = optionalFactory("createMarketplaceDeepLinkAdapter");
  return factory ? factory() : undefined;
}
