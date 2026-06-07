import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadAuraClashArena } from "./helpers/auraClashArenaHarness";

type AuraAssetManifest = {
  assets?: Array<{
    id: string;
    url?: string;
    file?: string;
    hash?: string;
    license?: string;
    source?: string;
    metadata?: Record<string, unknown>;
    clips?: readonly unknown[];
    skeleton?: unknown;
    bounds?: unknown;
  }>;
};

const manifestPath = resolve(process.cwd(), "aura.assets.json");

test("Aura Clash final fighter assets are distinct, licensed, animated, and fetchable", async ({ page }) => {
  const proof = await loadAuraClashArena(page);
  expect(proof.fighterAssets?.distinct).toBe(true);
  expect(proof.fighterAssets?.releaseReady).toBe(true);
  expect(proof.fighterAssets?.player.id).toBe("auraClashPlayerRig");
  expect(proof.fighterAssets?.rival.id).toBe("auraClashRivalRig");
  expect(proof.fighterAssets?.player.hash).not.toBe(proof.fighterAssets?.rival.hash);

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as AuraAssetManifest;
  for (const key of ["auraClashPlayerRig", "auraClashRivalRig"] as const) {
    const entry = manifest.assets?.find((asset) => asset.id === key);
    expect(entry, `${key} must exist in aura.assets.json`).toBeTruthy();
    expect(entry?.hash, `${key} must include a stable content hash`).toBeTruthy();
    expect(JSON.stringify(entry).toLowerCase(), `${key} must include license/provenance metadata`).toMatch(/cc0|creative commons|quaternius|license|provenance/);
    expect(JSON.stringify(entry).toLowerCase(), `${key} must include animation metadata`).toMatch(/clip|animation|skeleton|skin/);
    expect(JSON.stringify(entry).toLowerCase(), `${key} must include bounds metadata`).toMatch(/bounds|radius|height|center/);
  }

  const statuses = await page.evaluate(async (urls) => Promise.all(urls.map(async (url) => {
    const response = await fetch(url);
    return { url, status: response.status, bytes: Number(response.headers.get("content-length") ?? 0) };
  })), [proof.fighterAssets?.player.url, proof.fighterAssets?.rival.url].filter(Boolean));
  expect(statuses.every((item) => item.status === 200)).toBe(true);
});
