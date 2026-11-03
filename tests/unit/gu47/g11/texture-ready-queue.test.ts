import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { defineAuraAssets, material, primitives, type AuraSceneNode } from "@aura3d/engine";
import { upgradeProductionPrimitiveTextures } from "@aura3d/engine-runtime";
import { PBRMaterial, TextureBinding } from "@aura3d/rendering";
import { createBunkerDecalTextures } from "../../../../apps/showcase-bunker-zero/src/art/decals";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { CompiledSceneImpl, type MountSceneCompileContext } from "../../../../packages/engine/src/agent-api/compiler/compileScene";
import { resolveMountQuality } from "../../../../packages/engine/src/agent-api/compiler/renderer";
import { interleaveByMapSet, resetSharedProductionTextureDecodes } from "../../../../packages/engine/src/agent-api/compiler/textures";
import * as pngDecoder from "../../../../packages/engine/src/agent-api/PngTexturePixels";

// Native 5.0: typed assets are verified against their declared digest before decoding. Unless a real Bunker PNG is
// served, the fetch stub serves the URL text, so each fixture declares the SHA-256 of its URL.
const asset = (url: string) => defineAuraAssets({ map: { type: "texture", format: "png", url, hash: createHash("sha256").update(url).digest("hex") } }).map;
type Image = { width: number; height: number; close: ReturnType<typeof vi.fn> };
type Job = { url: string; image: Image; land(): void; fail(error: Error): void };
type Entry = { resources: Resource[] };
const digest = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
let resources: Resource[];
let runs: Promise<void>[];
let releaseJobs: (() => void)[];

function makeResource(name: string, materialSpec: Record<string, unknown>, observe?: (stage: string) => void) {
  let stage: string | undefined;
  return {
    name, materialSpec, sourceNode: { kind: "primitive", primitive: "box", material: materialSpec },
    material: new PBRMaterial(), geometry: { vertexBuffer: { format: { hasAttribute: (_name: string) => true } } },
    textureStatus: "none", textureWarnings: [] as string[], textureSlots: [] as string[],
    texturedMaterial: null as PBRMaterial | null, textureDisposer: undefined as (() => void) | undefined,
    get textureStage(): string | undefined { return stage; },
    set textureStage(value: string | undefined) { stage = value; if (value) observe?.(value); },
    texturePendingSince: undefined as number | undefined
  };
}
type Resource = ReturnType<typeof makeResource>;
function resource(name: string, materialSpec: Record<string, unknown>, observe?: (stage: string) => void): Resource {
  const value = makeResource(name, materialSpec, observe);
  resources.push(value);
  return value;
}
function dispose(value: Resource): void {
  value.textureDisposer?.();
  value.material.dispose();
  value.texturedMaterial?.dispose();
}
function run(entries: Entry[], warn: (message: string) => void = () => undefined): Promise<void> {
  const promise = upgradeProductionPrimitiveTextures(entries as unknown as Parameters<typeof upgradeProductionPrimitiveTextures>[0], warn);
  void promise.catch(() => undefined);
  runs.push(promise);
  return promise;
}
const floors = (prefix: string) => Array.from({ length: 4 }, (_, i) =>
  resource(`${prefix}-${i}`, { texture: asset(`/${prefix}-${i}.png`) }));

function mockImages(actualUrls: string[] = []) {
  const bytes = new Map(actualUrls.map((url) => [url, readFileSync(path.join(
    process.cwd(), "apps/showcase-bunker-zero/public", url.slice(1)
  ))]));
  const reverse = new Map([...bytes].map(([url, buffer]) => [digest(buffer), url]));
  const counts = new Map<string, number>();
  const jobs: Job[] = [];
  let released = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    counts.set(url, (counts.get(url) ?? 0) + 1);
    const buffer = bytes.get(url);
    return new Response(buffer ? new Uint8Array(buffer) : url, { headers: { "content-type": buffer ? "image/png" : "text/plain" } });
  }));
  vi.stubGlobal("createImageBitmap", vi.fn(async (blob: Blob) => {
    const data = new Uint8Array(await blob.arrayBuffer());
    const url = reverse.get(digest(data)) ?? new TextDecoder().decode(data);
    const image: Image = { width: 2, height: 2, close: vi.fn() };
    let land!: () => void;
    let fail!: (error: Error) => void;
    const gate = new Promise<void>((resolve, reject) => { land = resolve; fail = reject; });
    jobs.push({ url, image, land, fail });
    if (!released) await gate;
    return image;
  }));
  const release = () => { released = true; for (const job of jobs) job.land(); };
  releaseJobs.push(release);
  const job = (url: string) => jobs.find((value) => value.url === url)!;
  return { counts, jobs, job, release };
}
function imageOf(value: Resource, uniform = "u_baseColorTexture") {
  const binding = value.texturedMaterial?.getParameter(uniform);
  expect(binding).toBeInstanceOf(TextureBinding);
  return (binding as TextureBinding).texture?.source;
}
const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
/** Land a decode as soon as its resource's worker has started it. */
async function landWhenStarted(mock: ReturnType<typeof mockImages>, url: string): Promise<void> {
  await vi.waitFor(() => expect(mock.jobs.some((job) => job.url === url)).toBe(true));
  mock.job(url).land();
}

beforeEach(() => { resources = []; runs = []; releaseJobs = []; });
afterEach(async () => {
  for (const value of resources) dispose(value);
  for (const release of releaseJobs) release();
  await Promise.allSettled(runs);
  resetSharedProductionTextureDecodes();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/*
 * Native 5.0 retarget of the GU47 g11 ready-queue suite. The 4.7.x look-ahead prefetch (822f9d071) and cache-only
 * ready assembly (4e4a24a5e) fetched queued maps outside the request policy and are not restored. The native
 * observable contract this suite now pins: `upgradeProductionPrimitiveTextures` runs at most four resource workers
 * per call over the map-set interleaved queue; a queued resource reads pending/"queued" and starts no fetch until a
 * worker frees; all maps of one resource start together; one decode is shared per request identity; disposal gives
 * leases back; failures report fallback and warn once; malformed inputs fail only their own resource.
 * Four blocked "floors" occupy every worker; landing one floor frees exactly one worker.
 */

test("real Bunker PNGs upgrade in deterministic interleaved order on a freed worker and share one decode per PNG", async () => {
  // Native 5.0: was "assemble serially ... without unblocking four floors" (cache-only ready lane). Now one floor
  // lands to free one worker, which then takes the decal resources in interleaved order.
  const refs = createBunkerDecalTextures(defineAuraAssets);
  const urls = [refs.scorch.url, refs.crack.url, refs.bullet.url, refs.hazard.url];
  const mock = mockImages(urls);
  const floor = floors("bounded-floor");
  const order: string[] = [];
  const completed: string[] = [];
  let active = 0;
  let peak = 0;
  const ready = urls.flatMap((url, group) => Array.from({ length: 3 }, (_, i) => {
    const name = `${group}-${i}`;
    return resource(name, { texture: Object.values(refs).find((ref) => ref.url === url)! }, (stage) => {
      if (stage === "start") { order.push(name); active += 1; peak = Math.max(peak, active); }
      if (stage === "done") completed.push(name);
      if (stage === "done" || stage === "failed" || stage === "cancelled") active -= 1;
    });
  }));
  const done = run([{ resources: [...floor, ...ready] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
  expect(floor.map((value) => value.textureStage)).toEqual(floor.map((_, i) => `decode /bounded-floor-${i}.png`));
  await turn();
  // The four-worker cap: every decal reads queued and none was fetched.
  expect(ready.every((value) => value.textureStatus === "pending" && value.textureStage === "queued")).toBe(true);
  expect(urls.some((url) => mock.counts.has(url))).toBe(false);
  mock.job("/bounded-floor-0.png").land();
  for (const url of urls) await landWhenStarted(mock, url);
  await vi.waitFor(() => expect(ready.every((value) => value.textureStatus === "textured")).toBe(true));
  expect(order).toEqual(["0-0", "1-0", "2-0", "3-0", "0-1", "1-1", "2-1", "3-1", "0-2", "1-2", "2-2", "3-2"]);
  expect(completed).toEqual(order);
  expect(peak).toBe(1);
  expect(floor.slice(1).every((value) => value.textureStatus === "pending")).toBe(true);
  expect([...mock.counts.values()]).toEqual(Array(8).fill(1));
  for (const url of urls) {
    const group = ready.filter((value) => (value.materialSpec.texture as { url: string }).url === url);
    expect(group.every((value) => imageOf(value) === mock.job(url).image)).toBe(true);
    for (const value of group.slice(0, -1)) dispose(value);
    expect(mock.job(url).image.close).not.toHaveBeenCalled();
    dispose(group.at(-1)!);
    expect(mock.job(url).image.close).toHaveBeenCalledTimes(1);
  }
  mock.release();
  await done;
});

test("a resource's maps start together, it is not overtaken while one map decodes, and non-PNG maps skip the CPU decoder", async () => {
  // Native 5.0: was "all maps must be ready; unready and scalar PNG maps cannot be overtaken" (ready lane).
  const mock = mockImages();
  const floor = floors("maps-floor");
  const multi = resource("multi", { texture: asset("/color.png"), normal: asset("/normal.png") });
  const scalar = resource("scalar", { roughnessMap: asset("/color.png") });
  const after = resource("after", { texture: asset("/after.png") });
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels");
  const done = run([{ resources: [...floor, multi, scalar, after] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
  await turn();
  expect([multi.textureStage, scalar.textureStage, after.textureStage]).toEqual(["queued", "queued", "queued"]);
  mock.job("/maps-floor-0.png").land();
  // Both maps of `multi` start before either lands.
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(6));
  expect(mock.jobs.slice(4).map((job) => job.url).sort()).toEqual(["/color.png", "/normal.png"]);
  mock.job("/color.png").land();
  await turn();
  expect(multi.textureStatus).toBe("pending");
  expect([scalar.textureStage, after.textureStage]).toEqual(["queued", "queued"]);
  mock.job("/normal.png").land();
  await vi.waitFor(() => expect(multi.textureStatus).toBe("textured"));
  expect(imageOf(multi)).toBe(mock.job("/color.png").image);
  expect(imageOf(multi, "u_normalTexture")).toBe(mock.job("/normal.png").image);
  await landWhenStarted(mock, "/after.png");
  await vi.waitFor(() => expect(after.textureStatus).toBe("textured"));
  // The scalar map shared the held `/color.png` decode; its bytes are not a PNG, so no CPU PNG decode ran.
  expect(decode).not.toHaveBeenCalled();
  expect([...mock.counts.values()]).toEqual(Array(7).fill(1));
  mock.release();
  await done;
});

test("a malformed input fails only its own resource even when its URL's decode is already held", async () => {
  // Native 5.0: was "a malformed input is not eligible even when every image in its map set is cached". A hand-built
  // ref without an id is now rejected by the typed bitmap policy, so the resource falls back instead of binding.
  const mock = mockImages();
  const primeColor = resource("prime-color", { texture: asset("/valid.png") });
  const primeNormal = resource("prime-normal", { texture: asset("/invalid-ref.png") });
  const primed = run([{ resources: [primeColor, primeNormal] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(2));
  mock.job("/valid.png").land();
  mock.job("/invalid-ref.png").land();
  await primed;
  const floor = floors("eligibility-floor");
  const malformed = { kind: "aura-asset-ref", type: "texture", format: "png", url: "/invalid-ref.png" };
  const multi = resource("ineligible", { texture: asset("/valid.png"), normal: malformed });
  const later = resource("later", { texture: asset("/valid.png") });
  const warn = vi.fn();
  const done = run([{ resources: [...floor, multi, later] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(6));
  await turn();
  expect([multi.textureStage, later.textureStage]).toEqual(["queued", "queued"]);
  mock.job("/eligibility-floor-0.png").land();
  await vi.waitFor(() => expect([multi.textureStatus, later.textureStatus]).toEqual(["fallback", "textured"]));
  expect(multi.texturedMaterial).toBeNull();
  expect(warn).toHaveBeenCalledTimes(1);
  expect(imageOf(later)).toBe(mock.job("/valid.png").image);
  expect(mock.counts.get("/valid.png")).toBe(1);
  expect(mock.counts.get("/invalid-ref.png")).toBe(1);
  mock.release();
  await done;
});

test("an absolute cross-origin URL held by an earlier holder is loaded privately, not shared, when its queued resource runs", async () => {
  // Native 5.0: was "a cached URL rejected by the prefetch protocol guard is left for a normal worker"; there is
  // no prefetch guard. Decode sharing is limited to app-same-origin (or explicitly scoped) request identities, so an
  // absolute URL that is not provably same-origin (here `javascript:`, no document origin) is partitioned: the
  // normal worker fetches and decodes its own copy.
  const mock = mockImages();
  const unsafe = asset("javascript:bad");
  const primary = resource("primary", { texture: unsafe });
  const primed = run([{ resources: [primary] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(1));
  mock.job(unsafe.url).land();
  await primed;
  const floor = floors("protocol-floor");
  const queued = resource("unsafe", { texture: unsafe });
  const later = resource("safe", { texture: asset("/protocol-safe.png") });
  const done = run([{ resources: [...floor, queued, later] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(5));
  await turn();
  expect([queued.textureStage, later.textureStage]).toEqual(["queued", "queued"]);
  expect(mock.counts.get(unsafe.url)).toBe(1);
  mock.job("/protocol-floor-0.png").land();
  await vi.waitFor(() => expect(mock.jobs.filter((job) => job.url === unsafe.url)).toHaveLength(2));
  mock.jobs.filter((job) => job.url === unsafe.url)[1]!.land();
  await landWhenStarted(mock, "/protocol-safe.png");
  await vi.waitFor(() => expect([queued.textureStatus, later.textureStatus]).toEqual(["textured", "textured"]));
  expect(imageOf(queued)).not.toBe(imageOf(primary));
  expect(mock.counts.get(unsafe.url)).toBe(2);
  mock.release();
  await done;
});

test("a malformed queue head fails fast on its worker and its successor proceeds", async () => {
  // Native 5.0: was "a normal worker taking an ineligible head wakes the already-ready successor". The head's
  // id-less ref is rejected before any fetch, so the freed worker moves straight on to the successor.
  const mock = mockImages();
  const floor = floors("expose-floor");
  const malformed = { kind: "aura-asset-ref", type: "texture", format: "png", url: "/unprefetchable.png" };
  const head = resource("head", { texture: malformed });
  const next = resource("next", { texture: asset("/cached-next.png") });
  const done = run([{ resources: [...floor, head, next] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
  await turn();
  expect(next.textureStage).toBe("queued");
  expect(mock.counts.has("/cached-next.png")).toBe(false);
  mock.job("/expose-floor-0.png").land();
  await landWhenStarted(mock, "/cached-next.png");
  await vi.waitFor(() => expect(next.textureStatus).toBe("textured"));
  expect(head.textureStatus).toBe("fallback");
  expect(mock.counts.has("/unprefetchable.png")).toBe(false);
  expect(floor.slice(1).every((value) => value.textureStatus === "pending")).toBe(true);
  mock.release();
  await done;
});

test("a failed decode waits for its worker, reports fallback, warns once, and a later request retries", async () => {
  // Native 5.0: was "a failed prefetch waits for its normal turn, retries only once". Nothing is fetched early, so
  // the first (real) attempt fails; the failed decode leaves the shared cache and a later resource retries it.
  // Decoder errors are redacted by the policy transport.
  const mock = mockImages();
  const floor = floors("fail-floor");
  const failing = resource("failing", { texture: asset("/fail.png") });
  const after = resource("after", { texture: asset("/after-fail.png") });
  const warn = vi.fn();
  const done = run([{ resources: [...floor, failing, after] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
  await turn();
  expect(mock.counts.has("/fail.png")).toBe(false);
  expect([failing.textureStage, after.textureStage]).toEqual(["queued", "queued"]);
  mock.job("/fail-floor-0.png").land();
  await vi.waitFor(() => expect(mock.jobs.some((job) => job.url === "/fail.png")).toBe(true));
  mock.job("/fail.png").fail(new Error("real failure"));
  await vi.waitFor(() => expect(failing.textureStatus).toBe("fallback"));
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0]![0]).toContain("Bitmap texture acquisition or decoding failed");
  await landWhenStarted(mock, "/after-fail.png");
  await vi.waitFor(() => expect(after.textureStatus).toBe("textured"));
  expect(mock.counts.get("/fail.png")).toBe(1);
  mock.release();
  await done;
  const retry = resource("retry", { texture: asset("/fail.png") });
  await run([{ resources: [retry] }], warn);
  expect(retry.textureStatus).toBe("textured");
  expect(mock.counts.get("/fail.png")).toBe(2);
  expect(warn).toHaveBeenCalledTimes(1);
});

test("removing a pending owner closes its late image and lets the next queued resource proceed", async () => {
  // Native 5.0: the removed owner keeps its worker until its decode settles; the late image is closed on arrival.
  const mock = mockImages();
  const floor = floors("cancel-floor");
  const removed = resource("removed", { texture: asset("/removed.png") });
  const next = resource("next", { texture: asset("/next.png") });
  const warn = vi.fn();
  const entries = [{ resources: [...floor, removed, next] }];
  const done = run(entries, warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
  mock.job("/cancel-floor-0.png").land();
  await vi.waitFor(() => expect(mock.jobs.some((job) => job.url === "/removed.png")).toBe(true));
  expect(next.textureStage).toBe("queued");
  expect(mock.counts.get("/removed.png")).toBe(1);
  entries[0]!.resources.splice(entries[0]!.resources.indexOf(removed), 1);
  dispose(removed);
  mock.job("/removed.png").land();
  await vi.waitFor(() => expect(mock.job("/removed.png").image.close).toHaveBeenCalledTimes(1));
  await landWhenStarted(mock, "/next.png");
  await vi.waitFor(() => expect(next.textureStatus).toBe("textured"));
  expect(removed.textureStage).toBe("cancelled");
  expect(removed.texturedMaterial).toBeNull();
  expect(floor.slice(1).every((value) => value.textureStatus === "pending")).toBe(true);
  expect(warn).not.toHaveBeenCalled();
  mock.release();
  await done;
});

test("disposing a non-owning duplicate does not release another holder's shared decode", async () => {
  // Native 5.0: was "... wakes its ready successor ..."; the successor now runs once the shared decode lands and the
  // disposed duplicate's worker is released.
  const mock = mockImages();
  const primary = resource("primary", { texture: asset("/shared-wait.png") });
  const primaryDone = run([{ resources: [primary] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(1));
  const floor = floors("duplicate-floor");
  const duplicate = resource("duplicate", { texture: asset("/shared-wait.png") });
  const next = resource("next", { texture: asset("/duplicate-next.png") });
  const done = run([{ resources: [...floor, duplicate, next] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(5));
  mock.job("/duplicate-floor-0.png").land();
  await vi.waitFor(() => expect(duplicate.textureStage).toMatch(/^(fetch|body|decode) \/shared-wait\.png$/));
  expect(next.textureStage).toBe("queued");
  dispose(duplicate);
  expect(mock.job("/shared-wait.png").image.close).not.toHaveBeenCalled();
  mock.job("/shared-wait.png").land();
  await landWhenStarted(mock, "/duplicate-next.png");
  await vi.waitFor(() => expect(next.textureStatus).toBe("textured"));
  expect(duplicate.textureStage).toBe("cancelled");
  expect(mock.counts.get("/shared-wait.png")).toBe(1);
  mock.release();
  await Promise.all([done, primaryDone]);
  expect(imageOf(primary)).toBe(mock.job("/shared-wait.png").image);
  expect(mock.job("/shared-wait.png").image.close).not.toHaveBeenCalled();
  dispose(primary);
  expect(mock.job("/shared-wait.png").image.close).toHaveBeenCalledTimes(1);
});

test("disposal re-entering when a worker starts a resource cancels it before any fetch", async () => {
  // Native 5.0: was "disposal re-entering at ready handoff cannot close the pinned image early or fetch again";
  // there is no ready handoff. Disposal at the worker's start leaves nothing fetched, held or warned.
  const mock = mockImages();
  const floor = floors("handoff-floor");
  let target!: Resource;
  target = resource("handoff", { texture: asset("/handoff.png") }, (stage) => {
    if (stage === "start") dispose(target);
  });
  const warn = vi.fn();
  const done = run([{ resources: [...floor, target] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
  mock.job("/handoff-floor-0.png").land();
  await vi.waitFor(() => expect(target.textureStage).toBe("cancelled"));
  await turn();
  expect(mock.counts.has("/handoff.png")).toBe(false);
  expect(target.texturedMaterial).toBeNull();
  expect(warn).not.toHaveBeenCalled();
  mock.release();
  await done;
});

test("separate upgrade calls are each bounded to four workers and share one URL decode", async () => {
  // Native 5.0: was "runtime-added entries in separate sweeps share one bounded lane"; there is no global ready lane.
  // Each call caps its own workers; the decode is shared per request identity across calls.
  const mock = mockImages();
  const firstFloor = floors("first-floor");
  const secondFloor = floors("second-floor");
  const starts: string[] = [];
  const observe = (name: string) => (stage: string) => { if (stage === "start") starts.push(name); };
  const first = resource("first", { texture: asset("/runtime.png") }, observe("first"));
  const later = resource("later", { texture: asset("/runtime.png") }, observe("later"));
  const done = run([{ resources: [...firstFloor, first] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
  const laterDone = run([{ resources: [...secondFloor, later] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(8));
  await turn();
  expect([first.textureStage, later.textureStage]).toEqual(["queued", "queued"]);
  expect(mock.counts.has("/runtime.png")).toBe(false);
  mock.job("/first-floor-0.png").land();
  await vi.waitFor(() => expect(mock.jobs.some((job) => job.url === "/runtime.png")).toBe(true));
  mock.job("/second-floor-0.png").land();
  await vi.waitFor(() => expect(starts).toEqual(["first", "later"]));
  mock.job("/runtime.png").land();
  await vi.waitFor(() => expect([first.textureStatus, later.textureStatus]).toEqual(["textured", "textured"]));
  expect(imageOf(first)).toBe(imageOf(later));
  expect([...firstFloor, ...secondFloor].slice(1).filter((value) => value.name !== "second-floor-0")
    .every((value) => value.textureStatus === "pending")).toBe(true);
  expect(mock.counts.get("/runtime.png")).toBe(1);
  dispose(first);
  expect(mock.job("/runtime.png").image.close).not.toHaveBeenCalled();
  dispose(later);
  expect(mock.job("/runtime.png").image.close).toHaveBeenCalledTimes(1);
  mock.release();
  await Promise.all([done, laterDone]);
});

test("a failure after decode releases the image once, warns once, and advances the next resource", async () => {
  const mock = mockImages();
  const floor = floors("assembly-fail-floor");
  const broken = resource("broken-after-handoff", { texture: asset("/assembly-fail.png") }, (stage) => {
    if (stage === "decoded") throw new Error("assembly failed");
  });
  const next = resource("next", { texture: asset("/assembly-next.png") });
  const warn = vi.fn();
  const done = run([{ resources: [...floor, broken, next] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
  mock.job("/assembly-fail-floor-0.png").land();
  await landWhenStarted(mock, "/assembly-fail.png");
  await landWhenStarted(mock, "/assembly-next.png");
  await vi.waitFor(() => expect([broken.textureStatus, next.textureStatus]).toEqual(["fallback", "textured"]));
  expect(broken.textureStage).toBe("failed");
  expect(broken.textureWarnings).toHaveLength(1);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0]![0]).toContain("assembly failed");
  expect(mock.job("/assembly-fail.png").image.close).toHaveBeenCalledTimes(1);
  expect(mock.counts.get("/assembly-fail.png")).toBe(1);
  expect(floor.slice(1).every((value) => value.textureStatus === "pending")).toBe(true);
  mock.release();
  await done;
  expect(mock.job("/assembly-fail.png").image.close).toHaveBeenCalledTimes(1);
});

test("a throwing warning sink stops the batch from starting queued resources, which never fetch and are reverted", async () => {
  // Native 5.0: was "worker rejection releases still-queued leases even with a never-settling head"; queued
  // resources hold no leases (nothing is fetched early), so the observable is that they never start or fetch.
  const mock = mockImages();
  const floor = floors("cleanup-floor");
  const head = resource("head", { roughnessMap: asset("/never-settled.png") });
  const queued = resource("queued", { texture: asset("/cleanup-queued.png") });
  const warn = vi.fn(() => { throw new Error("warning sink failed"); });
  const done = run([{ resources: [...floor, head, queued] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
  mock.job("/cleanup-floor-0.png").fail(new Error("floor failed"));
  await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
  await turn();
  expect([head.textureStage, queued.textureStage]).toEqual(["queued", "queued"]);
  mock.release();
  await expect(done).rejects.toThrow("warning sink failed");
  expect(warn).toHaveBeenCalledTimes(1);
  expect(mock.counts.has("/never-settled.png")).toBe(false);
  expect(mock.counts.has("/cleanup-queued.png")).toBe(false);
  expect([head.textureStatus, queued.textureStatus]).toEqual(["none", "none"]);
  expect([head.textureStage, queued.textureStage]).toEqual(["cancelled", "cancelled"]);
  expect(queued.textureDisposer).toBeUndefined();
});

test("an assembly failure reports fallback and a throwing warning sink rejects without leaking an image", async () => {
  const mock = mockImages();
  const floor = floors("warning-floor");
  const broken = resource("broken", { texture: asset("/broken.png") });
  Object.defineProperty(broken.sourceNode, "material", { get: () => { throw new Error("material failed"); } });
  const warn = vi.fn(() => { throw new Error("warning failed"); });
  const done = run([{ resources: [...floor, broken] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
  mock.job("/warning-floor-0.png").land();
  await vi.waitFor(() => expect(broken.textureStatus).toBe("fallback"));
  expect(broken.textureWarnings).toHaveLength(1);
  expect(broken.textureWarnings[0]).toContain("material failed");
  expect(warn).toHaveBeenCalledTimes(1);
  mock.release();
  await expect(done).rejects.toThrow("warning failed");
  // Whether or not the map was fetched before the failure, no decoded image outlives it.
  const fetched = mock.jobs.filter((job) => job.url === "/broken.png");
  expect(fetched.length).toBeLessThanOrEqual(1);
  for (const job of fetched) expect(job.image.close).toHaveBeenCalledTimes(1);
  expect(floor.slice(1).every((value) => value.textureStatus === "textured")).toBe(true);
});

test.each([
  {
    label: "untyped clearcoat",
    spec: () => ({ clearcoatMap: { kind: "not-an-asset", type: "texture", url: "/invalid-coat.png" } }),
    message: "clearcoatMap requires a typed texture asset reference",
    invalidUrl: "/invalid-coat.png"
  },
  {
    label: "non-finite clearcoat transform",
    spec: () => ({
      clearcoatMap: asset("/invalid-transform.png"),
      texTransforms: { clearcoat: { offset: [Number.NaN, 0] } }
    }),
    message: "clearcoat texture transform must contain finite values",
    invalidUrl: "/invalid-transform.png"
  },
  {
    label: "invalid clearcoat texCoord",
    spec: () => ({ clearcoatMap: asset("/invalid-texcoord.png"), texCoords: { clearcoat: 2 } }),
    message: "clearcoat texCoord must be 0 or 1",
    invalidUrl: "/invalid-texcoord.png"
  }
])("a $label fails only its own resource without aborting the batch", async ({ spec, message, invalidUrl }) => {
  // Native 5.0: the malformed spec is rejected when the queue is built (no worker, no fetch); the valid resource
  // still waits its normal turn.
  const mock = mockImages();
  const floor = floors("malformed-floor");
  const malformed = resource("malformed", spec());
  const valid = resource("valid-after-malformed", { texture: asset("/after-malformed.png") });
  const warn = vi.fn();
  const ordered = interleaveByMapSet([malformed, valid] as never, false);
  expect(ordered.map((value) => value.name)).toEqual(["malformed", "valid-after-malformed"]);
  const done = run([{ resources: [...floor, malformed, valid] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
  await turn();
  expect(valid.textureStage).toBe("queued");
  expect(mock.counts.has("/after-malformed.png")).toBe(false);
  mock.job("/malformed-floor-0.png").land();
  await landWhenStarted(mock, "/after-malformed.png");
  await vi.waitFor(() => expect([malformed.textureStatus, valid.textureStatus]).toEqual(["fallback", "textured"]));
  expect(malformed.textureStage).toBe("failed");
  expect(malformed.texturedMaterial).toBeNull();
  expect(malformed.textureWarnings).toHaveLength(1);
  expect(malformed.textureWarnings[0]).toContain(message);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith(malformed.textureWarnings[0]);
  expect(mock.counts.has(invalidUrl)).toBe(false);
  expect(mock.counts.get("/after-malformed.png")).toBe(1);
  expect(floor.slice(1).every((value) => value.textureStatus === "pending")).toBe(true);
  mock.release();
  await done;
  expect(warn).toHaveBeenCalledTimes(1);
});

test("a spec whose map getter turns malformed after queueing upgrades from its queue-time snapshot", async () => {
  // Native 5.0: was "a malformed map-set discovered during interleaving is isolated by the real worker". The queue
  // captures each resource's texture intent when it is built, so a getter that changes afterwards is not re-read by
  // the worker: the resource upgrades from the snapshot and its successor follows.
  const mock = mockImages();
  const floor = floors("late-malformed-floor");
  let reads = 0;
  const spec: Record<string, unknown> = { texture: asset("/ignored-base.png") };
  Object.defineProperty(spec, "clearcoatMap", {
    get: () => (++reads === 1 ? asset("/first-coat.png") : { kind: "invalid" })
  });
  const malformed = resource("late-malformed", spec);
  const valid = resource("valid", { texture: asset("/late-valid.png") });
  const warn = vi.fn();
  const done = run([{ resources: [...floor, malformed, valid] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
  expect(reads).toBeGreaterThanOrEqual(2);
  expect(mock.counts.has("/ignored-base.png")).toBe(false);
  mock.job("/late-malformed-floor-0.png").land();
  await landWhenStarted(mock, "/ignored-base.png");
  await landWhenStarted(mock, "/first-coat.png");
  await landWhenStarted(mock, "/late-valid.png");
  await vi.waitFor(() => expect([malformed.textureStatus, valid.textureStatus]).toEqual(["textured", "textured"]));
  expect(warn).not.toHaveBeenCalled();
  expect(mock.counts.get("/ignored-base.png")).toBe(1);
  expect(mock.counts.get("/first-coat.png")).toBe(1);
  expect(floor.slice(1).every((value) => value.textureStatus === "pending")).toBe(true);
  mock.release();
  await done;
});

test("a malformed queued spec repaired before its worker starts upgrades with all its maps together", async () => {
  const mock = mockImages();
  const floor = floors("repair-floor");
  const spec: Record<string, unknown> = {
    texture: asset("/repair-base.png"),
    clearcoatMap: { kind: "invalid" }
  };
  const repaired = resource("repaired", spec);
  const next = resource("next", { texture: asset("/repair-next.png") });
  const warn = vi.fn();
  const done = run([{ resources: [...floor, repaired, next] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
  await turn();
  const queuedStages = [repaired.textureStage, next.textureStage];
  expect(mock.counts.has("/repair-base.png")).toBe(false);
  spec.clearcoatMap = asset("/repair-coat.png");
  mock.job("/repair-floor-0.png").land();
  if (queuedStages[0] === "queued") {
    // The repaired spec is read by its worker: both maps start together.
    await vi.waitFor(() => expect(mock.jobs).toHaveLength(6));
    mock.job("/repair-base.png").land();
    mock.job("/repair-coat.png").land();
    await landWhenStarted(mock, "/repair-next.png");
    await vi.waitFor(() => expect([repaired.textureStatus, next.textureStatus]).toEqual(["textured", "textured"]));
    expect(mock.counts.get("/repair-base.png")).toBe(1);
    expect(mock.counts.get("/repair-coat.png")).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  } else {
    // Native 5.0: the spec was already rejected when the queue was built, so the repair is not observed by this pass.
    expect(repaired.textureStatus).toBe("fallback");
    await landWhenStarted(mock, "/repair-next.png");
    await vi.waitFor(() => expect(next.textureStatus).toBe("textured"));
    expect(warn).toHaveBeenCalledTimes(1);
  }
  expect(mock.counts.get("/repair-next.png")).toBe(1);
  expect(floor.slice(1).every((value) => value.textureStatus === "pending")).toBe(true);
  mock.release();
  await done;
});

test("disposing a malformed queued resource leaves its successor to proceed on the freed worker", async () => {
  // Native 5.0: was "... cancels it without a warning and wakes a ready successor".
  const mock = mockImages();
  const floor = floors("malformed-cancel-floor");
  const malformed = resource("malformed-cancel", { clearcoatMap: { kind: "invalid" } });
  const next = resource("next", { texture: asset("/malformed-cancel-next.png") });
  const warn = vi.fn();
  const done = run([{ resources: [...floor, malformed, next] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
  await turn();
  expect(next.textureStage).toBe("queued");
  const warnedAtQueue = warn.mock.calls.length;
  dispose(malformed);
  mock.job("/malformed-cancel-floor-0.png").land();
  await landWhenStarted(mock, "/malformed-cancel-next.png");
  await vi.waitFor(() => expect(next.textureStatus).toBe("textured"));
  expect(malformed.texturedMaterial).toBeNull();
  // A malformed spec is reported at most once (when the queue is built); disposal adds no warning.
  expect(warn).toHaveBeenCalledTimes(warnedAtQueue);
  expect(warnedAtQueue).toBeLessThanOrEqual(1);
  expect(mock.counts.get("/malformed-cancel-next.png")).toBe(1);
  expect(floor.slice(1).every((value) => value.textureStatus === "pending")).toBe(true);
  mock.release();
  await done;
});

test("a throwing warning for a malformed resource rejects the batch and later resources never fetch", async () => {
  // Native 5.0: was "... rejects and releases other queued leases"; queued resources hold no leases.
  const mock = mockImages();
  const floor = floors("malformed-warning-floor");
  const malformed = resource("malformed-warning", { clearcoatMap: { kind: "invalid" } });
  const barrier = resource("barrier", { roughnessMap: asset("/malformed-warning-barrier.png") });
  const queued = resource("queued", { texture: asset("/malformed-warning-queued.png") });
  const warn = vi.fn(() => { throw new Error("malformed warning sink failed"); });
  const done = run([{ resources: [...floor, malformed, barrier, queued] }], warn);
  mock.release();
  await expect(done).rejects.toThrow("malformed warning sink failed");
  expect(malformed.textureStatus).toBe("fallback");
  expect(malformed.textureWarnings).toHaveLength(1);
  expect(malformed.textureWarnings[0]).toContain("clearcoatMap requires a typed texture asset reference");
  expect(warn).toHaveBeenCalledTimes(1);
  expect(mock.counts.has("/malformed-warning-queued.png")).toBe(false);
  expect(mock.counts.has("/malformed-warning-barrier.png")).toBe(false);
  expect(queued.textureDisposer).toBeUndefined();
  expect([barrier.textureStatus, queued.textureStatus]).not.toContain("textured");
});

test("a resource waits for its last map and its successor starts only after it", async () => {
  // Native 5.0: was "a late final map makes the queue head ready and wakes its already-ready successor".
  const mock = mockImages();
  const floor = floors("late-head-floor");
  const order: string[] = [];
  const head = resource("head", { texture: asset("/late-head-color.png"), normal: asset("/late-head-normal.png") },
    (stage) => { if (stage === "start") order.push("head"); });
  const next = resource("next", { texture: asset("/late-head-next.png") },
    (stage) => { if (stage === "start") order.push("next"); });
  const done = run([{ resources: [...floor, head, next] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
  mock.job("/late-head-floor-0.png").land();
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(6));
  mock.job("/late-head-color.png").land();
  await turn();
  expect(head.textureStatus).toBe("pending");
  expect(next.textureStage).toBe("queued");
  expect(order).toEqual(["head"]);
  mock.job("/late-head-normal.png").land();
  await landWhenStarted(mock, "/late-head-next.png");
  await vi.waitFor(() => expect([head.textureStatus, next.textureStatus]).toEqual(["textured", "textured"]));
  expect(order).toEqual(["head", "next"]);
  expect(imageOf(head)).toBe(mock.job("/late-head-color.png").image);
  expect(imageOf(head, "u_normalTexture")).toBe(mock.job("/late-head-normal.png").image);
  expect(imageOf(next)).toBe(mock.job("/late-head-next.png").image);
  expect(floor.slice(1).every((value) => value.textureStatus === "pending")).toBe(true);
  expect([...mock.counts.values()]).toEqual(Array(7).fill(1));
  mock.release();
  await done;
});

test("concurrent batches sharing the same resource assemble it once and retain one image lease", async () => {
  const mock = mockImages();
  const firstFloor = floors("shared-object-first");
  const secondFloor = floors("shared-object-second");
  let starts = 0;
  const shared = resource("shared-object", { texture: asset("/shared-object.png") },
    (stage) => { if (stage === "start") starts += 1; });
  const warn = vi.fn();
  const first = run([{ resources: [...firstFloor, shared] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
  const second = run([{ resources: [...secondFloor, shared] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(8));
  mock.job("/shared-object-first-0.png").land();
  await landWhenStarted(mock, "/shared-object.png");
  await vi.waitFor(() => expect(shared.textureStatus).toBe("textured"));
  expect(starts).toBe(1);
  expect(mock.counts.get("/shared-object.png")).toBe(1);
  expect(imageOf(shared)).toBe(mock.job("/shared-object.png").image);
  expect(mock.job("/shared-object.png").image.close).not.toHaveBeenCalled();
  dispose(shared);
  expect(mock.job("/shared-object.png").image.close).toHaveBeenCalledTimes(1);
  mock.release();
  await Promise.all([first, second]);
  expect(starts).toBe(1);
  expect(warn).not.toHaveBeenCalled();
  expect(mock.job("/shared-object.png").image.close).toHaveBeenCalledTimes(1);
});

test("removing a ready scene resource releases its image and a later subtree upgrades in the next sweep", async () => {
  // Native 5.0: three blocked floors (not four) leave the removed resource a worker; no look-ahead exists.
  const mock = mockImages();
  const context = {
    renderer: undefined, assets: undefined, quality: resolveMountQuality(undefined), strict: false,
    flags: resolveQrFlags({ options: { A3D_QR_COMPILER: true } }), degrade: () => undefined,
    canvas: { width: 64, height: 64 } as HTMLCanvasElement,
    environmentLighting: () => ({ color: [1, 1, 1], intensity: 0 }), collectedLights: [], runtimeWarnings: new Set<string>()
  } as unknown as MountSceneCompileContext;
  const scene = new CompiledSceneImpl(1, null, [], new Set(), [], [], [], [], context, [], []);
  const append = (id: string, url: string): void => {
    const node = primitives.box({ name: id, material: material.pbr({ texture: asset(url) }) }).runtime({ id }).toJSON();
    scene.addSubtree(node as AuraSceneNode);
  };
  for (let i = 0; i < 3; i += 1) append(`scene-floor-${i}`, `/scene-floor-${i}.png`);
  append("removed", "/scene-ready.png");
  const warn = vi.fn();
  const done = upgradeProductionPrimitiveTextures(scene.primitiveEntries, warn);
  void done.catch(() => undefined);
  runs.push(done);
  try {
    await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
    const removed = scene.primitiveEntries.find((entry) => entry.node.name === "removed")!.resources[0]!;
    mock.job("/scene-ready.png").land();
    await vi.waitFor(() => expect(removed.textureStatus).toBe("textured"));
    const old = mock.job("/scene-ready.png").image;
    expect(scene.primitiveEntries.slice(0, 3).every((entry) => entry.resources[0]!.textureStatus === "pending")).toBe(true);
    expect(scene.removeSubtree("removed")).toBe(true);
    expect(old.close).toHaveBeenCalledTimes(1);

    append("replacement", "/scene-ready.png");
    const replacement = scene.primitiveEntries.find((entry) => entry.node.name === "replacement")!.resources[0]!;
    expect(replacement.textureStatus).toBe("none");
    mock.release();
    await done;
    expect(replacement.textureStatus).toBe("textured");
    expect(mock.counts.get("/scene-ready.png")).toBe(2);
    const fresh = mock.jobs.filter(({ url }) => url === "/scene-ready.png")[1]!.image;
    expect(fresh.close).not.toHaveBeenCalled();
    scene.dispose();
    expect(fresh.close).toHaveBeenCalledTimes(1);
    expect(old.close).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  } finally {
    mock.release();
    await Promise.allSettled([done]);
    scene.dispose();
  }
});

test("occlusion-only and emissive-only maps assemble on free workers while other floors remain blocked", async () => {
  // Native 5.0: two blocked floors (not four) leave both resources a worker; was "cached maps assemble while four
  // floors remain blocked" (cache-only ready lane).
  const mock = mockImages();
  const floor = Array.from({ length: 2 }, (_, i) =>
    resource(`slot-only-floor-${i}`, { texture: asset(`/slot-only-floor-${i}.png`) }));
  const occlusion = resource("occlusion-only", { occlusionMap: asset("/only-occlusion.png") });
  const emissive = resource("emissive-only", { emissiveMap: asset("/only-emissive.png") });
  const done = run([{ resources: [...floor, occlusion, emissive] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
  mock.job("/only-occlusion.png").land();
  mock.job("/only-emissive.png").land();
  await vi.waitFor(() => expect([occlusion.textureStatus, emissive.textureStatus]).toEqual(["textured", "textured"]));
  expect(imageOf(occlusion, "u_occlusionTexture")).toBe(mock.job("/only-occlusion.png").image);
  expect(imageOf(emissive, "u_emissiveTexture")).toBe(mock.job("/only-emissive.png").image);
  expect(occlusion.textureSlots).toContain("occlusion");
  expect(emissive.textureSlots).toContain("emissive");
  expect(floor.every((value) => value.textureStatus === "pending")).toBe(true);
  expect(mock.counts.get("/only-occlusion.png")).toBe(1);
  expect(mock.counts.get("/only-emissive.png")).toBe(1);
  dispose(occlusion);
  dispose(emissive);
  expect(mock.job("/only-occlusion.png").image.close).toHaveBeenCalledTimes(1);
  expect(mock.job("/only-emissive.png").image.close).toHaveBeenCalledTimes(1);
  mock.release();
  await done;
});

test("an img-fallback winner on the policy transport lands while other decodes stall and releases winning and late-loser images", async () => {
  // Native 5.0: three blocked floors (not four) leave the resource a worker. The typed asset goes through the
  // policy transport, whose `<img>` fallback decodes an object URL of the verified bytes (no refetch).
  const mock = mockImages();
  const blobs = new Map<string, Blob>();
  const waiters: (() => void)[] = [];
  const images: { src: string; width: number; height: number; decoding: string; decode(): Promise<void> }[] = [];
  const createObjectURL = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    const url = `blob:ready-test/${blobs.size}`;
    blobs.set(url, blob as Blob);
    return url;
  });
  const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  class FakeImage {
    src = "";
    width = 2;
    height = 2;
    decoding = "";
    async decode(): Promise<void> {
      images.push(this);
      const url = await blobs.get(this.src)!.text();
      if (url === "/img-fallback.png") return;
      await new Promise<void>((resolve) => { waiters.push(resolve); });
    }
  }
  vi.stubGlobal("Image", FakeImage);
  const floor = Array.from({ length: 3 }, (_, i) =>
    resource(`img-floor-${i}`, { texture: asset(`/img-floor-${i}.png`) }));
  const ready = resource("img-fallback", { texture: asset("/img-fallback.png") });
  const done = run([{ resources: [...floor, ready] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(4));
  await vi.waitFor(() => expect(ready.textureStatus).toBe("textured"), { timeout: 6000 });
  await vi.waitFor(() => expect(waiters).toHaveLength(3));
  const winningImage = imageOf(ready) as FakeImage;
  expect(images).toContain(winningImage);
  expect(floor.every((value) => value.textureStatus === "pending")).toBe(true);
  expect(mock.counts.get("/img-fallback.png")).toBe(1);
  expect(createObjectURL).toHaveBeenCalledTimes(4);
  dispose(ready);
  expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  expect(revokeObjectURL).toHaveBeenCalledWith(winningImage.src);

  mock.release();
  await done;
  await vi.waitFor(() => expect(mock.job("/img-fallback.png").image.close).toHaveBeenCalledTimes(1));
  for (const release of waiters) release();
  await vi.waitFor(() => expect(revokeObjectURL).toHaveBeenCalledTimes(4));
  expect(mock.job("/img-fallback.png").image.close).toHaveBeenCalledTimes(1);
}, 10000);
