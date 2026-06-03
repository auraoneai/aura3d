/**
 * Deep asset-index refresh for CI (GitHub Actions).
 *
 * Unlike the Cloudflare Worker cron (capped at 50 subrequests on the free plan),
 * this runs in Node with no subrequest limit, so it mirrors the enumerable CC0
 * sources AND sweeps Sketchfab/Poly Pizza across a large keyword set. It reads
 * and writes the same R2 index object via the Cloudflare REST API, so the
 * resolver/Worker read path is unchanged.
 *
 * Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, R2_BUCKET (default
 * aura3d-asset-index), INDEX_KEY (default asset-index.json), SKETCHFAB_API_TOKEN,
 * POLY_PIZZA_API_KEY.
 *
 * Run: pnpm exec tsx --tsconfig tsconfig.base.json tools/asset-index-refresh/index.ts
 */
import { request } from "node:https";
import { Buffer } from "node:buffer";
import {
  createPolyPizzaAdapter,
  createSketchfabAdapter,
  defaultAdapters,
  defaultFetchJson,
  refreshIndex,
  INDEX_STORE_SCHEMA,
  type AuraCanonicalAsset,
  type IndexStoreFile,
  type SourceAdapter,
  type WritableAssetIndex,
} from "@aura3d/asset-index";

const ACCOUNT = requireEnv("CLOUDFLARE_ACCOUNT_ID");
const TOKEN = requireEnv("CLOUDFLARE_API_TOKEN");
const BUCKET = process.env.R2_BUCKET ?? "aura3d-asset-index";
const KEY = process.env.INDEX_KEY ?? "asset-index.json";
const R2_OBJECT = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${KEY}`;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

function putBody(u: URL, payload: Buffer): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const req = request(
      {
        method: "PUT",
        hostname: u.hostname,
        path: `${u.pathname}${u.search}`,
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
          "content-length": payload.length,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode < 300) resolve();
          else reject(new Error(`R2 PUT ${res.statusCode}: ${body.slice(0, 200)}`));
        });
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

/** Curated category sweep for the keyword-search sources (no Worker cap here). */
const SWEEP_KEYWORDS = [
  "car", "truck", "bus", "motorcycle", "bicycle", "boat", "ship", "plane", "helicopter", "rocket",
  "chair", "table", "sofa", "bed", "lamp", "desk", "shelf", "cabinet", "door", "window",
  "tree", "plant", "flower", "rock", "bush", "grass", "mountain", "log", "mushroom", "cactus",
  "house", "building", "tower", "castle", "bridge", "fence", "wall", "roof", "stairs", "tent",
  "robot", "character", "human", "soldier", "knight", "wizard", "zombie", "skeleton", "alien", "monster",
  "dog", "cat", "horse", "cow", "bird", "fish", "dragon", "bear", "wolf", "snake",
  "sword", "gun", "axe", "shield", "bow", "hammer", "knife", "grenade", "cannon", "spear",
  "food", "fruit", "vegetable", "bottle", "cup", "plate", "barrel", "crate", "box", "bag",
  "computer", "phone", "tv", "camera", "radio", "clock", "book", "key", "coin", "chest",
  "wheel", "engine", "gear", "pipe", "ladder", "sign", "lantern", "torch", "flag", "statue",
  "apple", "banana", "bread", "cake", "pizza", "burger", "coffee", "wine", "egg", "cheese",
  "guitar", "piano", "drum", "violin", "trumpet", "microphone", "speaker", "headphone", "joystick", "dice",
  "ball", "trophy", "medal", "crown", "ring", "gem", "diamond", "potion", "scroll", "map",
  "pumpkin", "ghost", "spider", "bat", "candle", "coffin", "grave", "skull", "web", "moon",
  "spaceship", "satellite", "astronaut", "ufo", "planet", "star", "asteroid", "turret", "drone", "mech",
  "tractor", "forklift", "crane", "excavator", "ambulance", "police", "taxi", "van", "trailer", "wagon",
  "umbrella", "backpack", "wallet", "watch", "glasses", "hat", "shoe", "shirt", "glove", "mask",
  "anvil", "bucket", "broom", "shovel", "saw", "wrench", "screwdriver", "drill", "nail", "rope",
  "fountain", "well", "windmill", "lighthouse", "gate", "arch", "column", "pillar", "obelisk", "fence",
];

class CloudflareR2Store implements WritableAssetIndex {
  private readonly assets = new Map<string, AuraCanonicalAsset>();
  private readonly watermarks = new Map<string, string>();
  private updatedAt: string | null = null;

  static async load(): Promise<CloudflareR2Store> {
    const store = new CloudflareR2Store();
    const res = await fetch(R2_OBJECT, { headers: { authorization: `Bearer ${TOKEN}` } });
    if (res.status === 404) return store;
    if (!res.ok) throw new Error(`R2 GET failed ${res.status}`);
    const parsed = JSON.parse(await res.text()) as Partial<IndexStoreFile>;
    for (const a of parsed.assets ?? []) {
      if (a && typeof a.id === "string") store.assets.set(a.id, a);
    }
    for (const [s, w] of Object.entries(parsed.watermarks ?? {})) {
      if (typeof w === "string") store.watermarks.set(s, w);
    }
    store.updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : null;
    return store;
  }

  upsertMany(_source: string, assets: Iterable<AuraCanonicalAsset>): void {
    for (const a of assets) if (a && typeof a.id === "string") this.assets.set(a.id, a);
  }
  getWatermark(source: string): string | null {
    return this.watermarks.get(source) ?? null;
  }
  setWatermark(source: string, watermark: string): void {
    this.watermarks.set(source, watermark);
  }
  all(): AuraCanonicalAsset[] {
    return [...this.assets.values()];
  }
  async save(updatedAt?: string): Promise<void> {
    if (updatedAt !== undefined) this.updatedAt = updatedAt;
    const file: IndexStoreFile = {
      schema: INDEX_STORE_SCHEMA,
      updatedAt: this.updatedAt,
      watermarks: Object.fromEntries(this.watermarks),
      assets: this.all(),
    };
    // PUT via node:https with an explicit Content-Length and a few retries.
    // undici (fetch) and macOS LibreSSL curl both choke on multi-MB bodies to
    // this endpoint; a fixed-length native request is the reliable path.
    const payload = Buffer.from(JSON.stringify(file));
    const u = new URL(R2_OBJECT);
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        await putBody(u, payload);
        return;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
    throw new Error(`R2 PUT failed after retries: ${(lastErr as Error)?.message}`);
  }
}

function searchAdapters(): SourceAdapter[] {
  const adapters: SourceAdapter[] = [];
  if (process.env.SKETCHFAB_API_TOKEN) {
    adapters.push(createSketchfabAdapter({ token: process.env.SKETCHFAB_API_TOKEN }));
  }
  if (process.env.POLY_PIZZA_API_KEY) {
    adapters.push(createPolyPizzaAdapter({ apiKey: process.env.POLY_PIZZA_API_KEY }));
  }
  return adapters;
}

/** Retry transient failures (Sketchfab 408s on deep cursors, network blips). */
async function retryingFetchJson(url: string): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await defaultFetchJson(url);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, (attempt + 1) * 600));
    }
  }
  throw lastErr;
}

async function main(): Promise<void> {
  const updatedAt = new Date().toISOString();
  const ctx = { fetchJson: retryingFetchJson };
  const store = await CloudflareR2Store.load();

  // 1) enumerable CC0 sources (Khronos, OS3A, Poly Haven, jsDelivr mirror)
  const enumerable = await refreshIndex(defaultAdapters(), store, ctx, {});
  console.log("enumerable:", JSON.stringify(enumerable.perSource), "warnings:", enumerable.warnings.length);

  // 2) deep keyword sweep for the search-API sources (Poly Pizza caps at ~32 per
  //    keyword, so its breadth scales with the keyword list).
  const search = searchAdapters();
  const perSource: Record<string, number> = {};
  for (const a of search) perSource[a.id] = 0;
  for (const keyword of SWEEP_KEYWORDS) {
    for (const adapter of search) {
      try {
        const assets = await adapter.search({ text: keyword }, ctx);
        store.upsertMany(adapter.id, assets);
        perSource[adapter.id] += assets.length;
      } catch (err) {
        console.warn(`${adapter.id}[${keyword}]:`, (err as Error).message);
      }
    }
  }
  console.log("sweep:", JSON.stringify(perSource), "over", SWEEP_KEYWORDS.length, "keywords");

  // 3) DEEP enumeration of Sketchfab's whole downloadable CC0/CC-BY catalog via
  //    cursor pagination (the real volume path — not keyword sampling).
  if (process.env.SKETCHFAB_API_TOKEN) {
    const maxPages = Number(process.env.SKETCHFAB_MAX_PAGES ?? 150);
    const throttleMs = Number(process.env.SKETCHFAB_THROTTLE_MS ?? 350);
    const deep = createSketchfabAdapter({
      token: process.env.SKETCHFAB_API_TOKEN,
      maxPages,
      throttleMs,
    });
    for (const license of [["CC0"], ["CC-BY"]] as const) {
      try {
        const assets = await deep.search({ text: "", constraints: { license: [...license] } }, ctx);
        store.upsertMany("sketchfab", assets);
        console.log(`sketchfab enumerate ${license[0]}: +${assets.length} (<=${maxPages} pages)`);
      } catch (err) {
        console.warn(`sketchfab enumerate ${license[0]}:`, (err as Error).message);
      }
    }
  }

  await store.save(updatedAt);
  console.log(`saved: ${store.all().length} total assets at ${updatedAt}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
