import { expect, test } from "@playwright/test";

type AuraClashArenaProof = {
  status: string;
  error: string | null;
  totalHits: number;
  player: { x: number };
  rival: { health: number };
  fighterAssets?: {
    player: { url: string };
    rival: { url: string };
  };
  audio?: {
    assetUrls: readonly string[];
    typedAssetCount: number;
    oscillatorFallback: false;
  };
};

const deployedOrigin = process.env.AURA_CLASH_DEPLOYED_ORIGIN?.replace(/\/$/, "");

test("Aura Clash deployed-compatible route returns 200, loads assets, and responds to controls", async ({ page, request, baseURL }) => {
  const origin = deployedOrigin ?? baseURL ?? "http://127.0.0.1:5187";
  const playableUrl = new URL("/playable/", origin).toString();
  const response = await request.get(playableUrl);
  expect(response.status()).toBe(200);

  const failedRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on("requestfailed", (requestEvent) => failedRequests.push(requestEvent.url()));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(playableUrl, { waitUntil: "networkidle" });
  await page.locator(".aca").focus();
  await page.waitForFunction(() => Boolean((window as Window & { __AURA_CLASH_ARENA_PROOF__?: unknown }).__AURA_CLASH_ARENA_PROOF__));

  const bootProof = await readProof(page);
  expect(bootProof.status).toBe("running");
  expect(bootProof.error).toBeNull();

  const chunkUrls = await page.evaluate(() => {
    const urls = new Set<string>();
    for (const script of Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))) {
      urls.add(script.src);
    }
    for (const stylesheet of Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]'))) {
      urls.add(stylesheet.href);
    }
    return Array.from(urls);
  });
  expect(chunkUrls.length, "playable route should expose script or stylesheet resources").toBeGreaterThan(0);
  for (const chunkUrl of chunkUrls) {
    const chunkResponse = await request.get(chunkUrl);
    expect(chunkResponse.status(), `${chunkUrl} should return 200`).toBe(200);
    expect((await chunkResponse.body()).byteLength, `${chunkUrl} should not be empty`).toBeGreaterThan(0);
  }

  const assetUrls = [bootProof.fighterAssets?.player.url, bootProof.fighterAssets?.rival.url].filter(Boolean) as string[];
  for (const assetUrl of assetUrls) {
    const assetResponse = await request.get(new URL(assetUrl, origin).toString());
    expect(assetResponse.status(), `${assetUrl} should return 200`).toBe(200);
    expect((await assetResponse.body()).byteLength, `${assetUrl} should not be empty`).toBeGreaterThan(0);
  }
  expect(bootProof.audio?.oscillatorFallback).toBe(false);
  expect(bootProof.audio?.typedAssetCount).toBeGreaterThanOrEqual(10);
  for (const audioUrl of bootProof.audio?.assetUrls ?? []) {
    const audioResponse = await request.get(new URL(audioUrl, origin).toString());
    expect(audioResponse.status(), `${audioUrl} should return 200`).toBe(200);
    expect(audioResponse.headers()["content-type"] ?? "", `${audioUrl} should be served as audio`).toMatch(/audio|ogg|octet-stream/i);
    expect((await audioResponse.body()).byteLength, `${audioUrl} should not be empty`).toBeGreaterThan(0);
  }

  const before = bootProof.player.x;
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(500);
  await page.keyboard.up("KeyD");
  const afterMove = await readProof(page);
  expect(afterMove.player.x).toBeGreaterThan(before + 0.04);

  await page.keyboard.down("KeyJ");
  await page.waitForTimeout(180);
  await page.keyboard.up("KeyJ");
  const afterAttack = await readProof(page);
  expect(afterAttack.status).not.toBe("error");

  expect(failedRequests.filter((url) => /\.(js|css|glb|gltf|png|jpg|jpeg|webp|ktx2|ogg|mp3|wav)(\?|$)/i.test(url))).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

async function readProof(page: import("@playwright/test").Page): Promise<AuraClashArenaProof> {
  const proof = await page.evaluate(() => {
    return (window as Window & { __AURA_CLASH_ARENA_PROOF__?: AuraClashArenaProof }).__AURA_CLASH_ARENA_PROOF__;
  });
  expect(proof).toBeTruthy();
  return proof!;
}
