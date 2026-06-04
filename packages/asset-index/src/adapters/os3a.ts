import type { AuraCanonicalAsset, AuraAssetFormat } from "../CanonicalAsset.js";
import { normalizeLicense } from "../CanonicalAsset.js";
import type {
  AdapterContext,
  ResolveQuery,
  SourceAdapter,
} from "../SourceAdapter.js";

/**
 * Open Source 3D Assets (OS3A) adapter — ToxSam/open-source-3D-assets.
 *
 * Verified two-level shape:
 *   data/projects.json        -> [{ id, name, creator_id, license, asset_data_file, ... }]
 *   data/assets/<file>.json   -> [{ id, name, model_file_url, format, thumbnail_url,
 *                                   is_public, is_draft, metadata: { file_size, attributes } }]
 *
 * License lives at the PROJECT level (e.g. "CC0"); each asset inherits it. These
 * are genuine, verified, redistributable CC0 records and are auto-pullable.
 */

const REPO = "ToxSam/open-source-3D-assets";
const BRANCH = "main";
const DATA_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/data`;
const PROJECTS_URL = `${DATA_BASE}/projects.json`;

interface OS3AProject {
  readonly id: string;
  readonly name?: string;
  readonly creator_id?: string;
  readonly description?: string;
  readonly is_public?: boolean;
  readonly license?: string;
  readonly github_url?: string;
  readonly asset_data_file?: string;
}

interface OS3AAsset {
  readonly id: string;
  readonly name?: string;
  readonly project_id?: string;
  readonly description?: string;
  readonly model_file_url?: string;
  readonly format?: string;
  readonly is_public?: boolean;
  readonly is_draft?: boolean;
  readonly updated_at?: string;
  readonly thumbnail_url?: string;
  readonly metadata?: {
    readonly file_size?: number;
    readonly attributes?: readonly unknown[];
  };
}

function tokenize(text: string): string[] {
  return text
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/** Pull human-readable string values out of the loosely-typed attributes array. */
function attributeTags(attributes: readonly unknown[] | undefined): string[] {
  if (!attributes) return [];
  const out: string[] = [];
  for (const attr of attributes) {
    if (attr && typeof attr === "object") {
      for (const value of Object.values(attr as Record<string, unknown>)) {
        if (typeof value === "string") out.push(...tokenize(value));
      }
    }
  }
  return out;
}

function normalizeFormat(raw: string | undefined): AuraAssetFormat {
  return (raw ?? "").toLowerCase() === "gltf" ? "gltf" : "glb";
}

function toCanonical(
  asset: OS3AAsset,
  project: OS3AProject,
): AuraCanonicalAsset | null {
  if (!asset.model_file_url || asset.is_draft || asset.is_public === false) {
    return null;
  }
  const title = asset.name ?? asset.id;
  const tags = Array.from(
    new Set([
      ...tokenize(title),
      ...tokenize(project.name ?? ""),
      ...attributeTags(asset.metadata?.attributes),
    ]),
  );
  return {
    id: `os3a:${asset.id}`,
    source: "os3a",
    title,
    description: asset.description,
    url: asset.model_file_url,
    access: "direct-download",
    format: normalizeFormat(asset.format),
    license: normalizeLicense(project.license, project.github_url),
    thumbnailUrl: asset.thumbnail_url,
    fileSizeBytes: asset.metadata?.file_size,
    tags,
    sourcePage: project.github_url,
    attribution: project.creator_id,
  };
}

async function loadAll(ctx: AdapterContext): Promise<AuraCanonicalAsset[]> {
  const projectsRaw = await ctx.fetchJson(PROJECTS_URL);
  if (!Array.isArray(projectsRaw)) {
    throw new Error("os3a projects.json was not an array");
  }
  const projects = (projectsRaw as OS3AProject[]).filter(
    (p) => p && typeof p.id === "string" && p.is_public !== false && p.asset_data_file,
  );

  const perProject = await Promise.all(
    projects.map(async (project) => {
      try {
        const assetsRaw = await ctx.fetchJson(`${DATA_BASE}/${project.asset_data_file}`);
        if (!Array.isArray(assetsRaw)) return [];
        const out: AuraCanonicalAsset[] = [];
        for (const asset of assetsRaw as OS3AAsset[]) {
          if (asset && typeof asset.id === "string") {
            const canonical = toCanonical(asset, project);
            if (canonical) out.push(canonical);
          }
        }
        return out;
      } catch {
        // A single bad collection must not sink the whole source.
        return [];
      }
    }),
  );

  return perProject.flat();
}

export function createOS3AAdapter(): SourceAdapter {
  let cache: AuraCanonicalAsset[] | null = null;

  return {
    id: "os3a",
    label: "Open Source 3D Assets (CC0)",
    async search(_query: ResolveQuery, ctx: AdapterContext) {
      if (!cache) cache = await loadAll(ctx);
      return cache;
    },
    // NOTE: OS3A assets carry `updated_at`, so an incremental `fetchSince` for
    // the cron index can diff on the max timestamp. Added in the cron phase.
  };
}
