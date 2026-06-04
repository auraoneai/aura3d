import type { AuraCanonicalAsset } from "../CanonicalAsset.js";
import { normalizeLicense } from "../CanonicalAsset.js";
import type {
  AdapterContext,
  ResolveQuery,
  SourceAdapter,
} from "../SourceAdapter.js";

/**
 * Khronos glTF-Sample-Assets adapter.
 *
 * Verified index shape (Models/model-index.json), each entry:
 *   { label, name, screenshot, tags: string[], variants: Record<string,string> }
 *
 * The index carries NO license field, so every record is marked UNVERIFIED and
 * is not auto-pullable until a verification pass resolves the per-model license
 * from its source page. This is intentional: we never assert a license we have
 * not read.
 */

const REPO = "KhronosGroup/glTF-Sample-Assets";
const BRANCH = "main";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/Models`;
const PAGE_BASE = `https://github.com/${REPO}/tree/${BRANCH}/Models`;
const INDEX_URL = `${RAW_BASE}/model-index.json`;

interface KhronosEntry {
  readonly label?: string;
  readonly name: string;
  readonly screenshot?: string;
  readonly tags?: readonly string[];
  readonly variants?: Record<string, string>;
}

function tokenize(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2") // split camelCase identifiers
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function toCanonical(entry: KhronosEntry): AuraCanonicalAsset | null {
  const variants = entry.variants ?? {};
  const glbFile = variants["glTF-Binary"];
  if (!glbFile) {
    // Only index entries that ship a single-file .glb binary variant.
    return null;
  }
  const sourcePage = `${PAGE_BASE}/${entry.name}`;
  const title = entry.label ?? entry.name;
  const tags = Array.from(
    new Set([...(entry.tags ?? []), ...tokenize(title), ...tokenize(entry.name)]),
  );
  return {
    id: `khronos:${entry.name}`,
    source: "khronos",
    title,
    url: `${RAW_BASE}/${entry.name}/glTF-Binary/${glbFile}`,
    access: "direct-download",
    format: "glb",
    license: normalizeLicense(undefined, sourcePage),
    thumbnailUrl: entry.screenshot
      ? `${RAW_BASE}/${entry.name}/${entry.screenshot}`
      : undefined,
    tags,
    sourcePage,
  };
}

export function createKhronosAdapter(): SourceAdapter {
  let cache: readonly AuraCanonicalAsset[] | null = null;

  async function load(ctx: AdapterContext): Promise<readonly AuraCanonicalAsset[]> {
    if (cache) return cache;
    const raw = await ctx.fetchJson(INDEX_URL);
    if (!Array.isArray(raw)) {
      throw new Error("khronos model-index.json was not an array");
    }
    const assets: AuraCanonicalAsset[] = [];
    for (const entry of raw as KhronosEntry[]) {
      if (entry && typeof entry.name === "string") {
        const canonical = toCanonical(entry);
        if (canonical) assets.push(canonical);
      }
    }
    cache = assets;
    return assets;
  }

  return {
    id: "khronos",
    label: "Khronos glTF Sample Assets",
    async search(_query: ResolveQuery, ctx: AdapterContext) {
      return load(ctx);
    },
  };
}
