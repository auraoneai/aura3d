import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { defineAuraAssets, material, primitives, upgradeProductionPrimitiveTextures, type AuraSceneNode } from "@aura3d/engine";
import { PBRMaterial, TextureBinding } from "@aura3d/rendering";
import { createBunkerDecalTextures } from "../../../../apps/showcase-bunker-zero/src/art/decals";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { CompiledSceneImpl, type MountSceneCompileContext } from "../../../../packages/engine/src/agent-api/compiler/compileScene";
import { resolveMountQuality } from "../../../../packages/engine/src/agent-api/compiler/renderer";
import { interleaveByMapSet, resetSharedProductionTextureDecodes } from "../../../../packages/engine/src/agent-api/compiler/textures";
import * as pngDecoder from "../../../../packages/engine/src/agent-api/PngTexturePixels";

const asset = (url: string) => defineAuraAssets({ map: { type: "texture", format: "png", url, hash: "test" } }).map;
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

beforeEach(() => { resources = []; runs = []; releaseJobs = []; });
afterEach(async () => {
  for (const value of resources) dispose(value);
  for (const release of releaseJobs) release();
  await Promise.allSettled(runs);
  resetSharedProductionTextureDecodes();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("real Bunker PNGs assemble serially in deterministic interleaved order without unblocking four floors", async () => {
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
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(8));
  expect(floor.map((value) => value.textureStage)).toEqual(floor.map((_, i) => `decode /bounded-floor-${i}.png`));
  // Complete out of order: the queue head must not be overtaken.
  for (const url of urls.slice(1)) mock.job(url).land();
  await turn();
  expect(order).toEqual([]);
  mock.job(urls[0]!).land();
  await vi.waitFor(() => expect(ready.every((value) => value.textureStatus === "textured")).toBe(true));
  expect(order).toEqual(["0-0", "1-0", "2-0", "3-0", "0-1", "1-1", "2-1", "3-1", "0-2", "1-2", "2-2", "3-2"]);
  expect(completed).toEqual(order);
  expect(peak).toBe(1);
  expect(floor.every((value) => value.textureStatus === "pending")).toBe(true);
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

test("all maps must be ready; unready and scalar PNG maps cannot be overtaken or trigger CPU readback", async () => {
  const mock = mockImages();
  const floor = floors("maps-floor");
  const multi = resource("multi", { texture: asset("/color.png"), normal: asset("/normal.png") });
  const scalar = resource("scalar", { roughnessMap: asset("/color.png") });
  const after = resource("after", { texture: asset("/after.png") });
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels");
  const done = run([{ resources: [...floor, multi, scalar, after] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(7));
  mock.job("/color.png").land();
  mock.job("/after.png").land();
  await vi.waitFor(() => expect(mock.jobs.some((job) => job.url === "/normal.png")).toBe(true));
  await turn();
  expect([multi.textureStage, scalar.textureStage, after.textureStage]).toEqual(["queued", "queued", "queued"]);
  mock.job("/normal.png").land();
  await vi.waitFor(() => expect(multi.textureStatus).toBe("textured"));
  expect(imageOf(multi)).toBe(mock.job("/color.png").image);
  expect(imageOf(multi, "u_normalTexture")).toBe(mock.job("/normal.png").image);
  expect([scalar.textureStage, after.textureStage]).toEqual(["queued", "queued"]);
  expect(decode).not.toHaveBeenCalled();
  expect([...mock.counts.values()]).toEqual(Array(7).fill(1));
  mock.release();
  await done;
});

test("a malformed input is not eligible even when every image in its map set is cached", async () => {
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
  const done = run([{ resources: [...floor, multi, later] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(6));
  await turn();
  expect([multi.textureStage, later.textureStage]).toEqual(["queued", "queued"]);
  expect(mock.counts.get("/valid.png")).toBe(1);
  expect(mock.counts.get("/invalid-ref.png")).toBe(1);
  mock.job("/eligibility-floor-0.png").land();
  await vi.waitFor(() => expect([multi.textureStatus, later.textureStatus]).toEqual(["textured", "textured"]));
  expect(imageOf(multi, "u_normalTexture")).toBe(mock.job("/invalid-ref.png").image);
  expect(mock.counts.get("/invalid-ref.png")).toBe(1);
  mock.release();
  await done;
});

test("a cached URL rejected by the prefetch protocol guard is left for a normal worker", async () => {
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
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(6));
  mock.job("/protocol-safe.png").land();
  await turn();
  expect([queued.textureStage, later.textureStage]).toEqual(["queued", "queued"]);
  expect(mock.counts.get(unsafe.url)).toBe(1);
  mock.job("/protocol-floor-0.png").land();
  await vi.waitFor(() => expect([queued.textureStatus, later.textureStatus]).toEqual(["textured", "textured"]));
  expect(mock.counts.get(unsafe.url)).toBe(1);
  mock.release();
  await done;
});

test("a normal worker taking an ineligible head wakes the already-ready successor", async () => {
  const mock = mockImages();
  const floor = floors("expose-floor");
  const malformed = { kind: "aura-asset-ref", type: "texture", format: "png", url: "/unprefetchable.png" };
  const head = resource("head", { texture: malformed });
  const next = resource("next", { texture: asset("/cached-next.png") });
  const done = run([{ resources: [...floor, head, next] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(5));
  mock.job("/cached-next.png").land();
  await turn();
  expect(next.textureStage).toBe("queued");
  expect(mock.counts.has("/unprefetchable.png")).toBe(false);
  mock.job("/expose-floor-0.png").land();
  await vi.waitFor(() => expect(head.textureStage).toBe("decode /unprefetchable.png"));
  await vi.waitFor(() => expect(next.textureStatus).toBe("textured"));
  expect(head.textureStatus).toBe("pending");
  expect(mock.counts.get("/unprefetchable.png")).toBe(1);
  expect(floor.slice(1).every((value) => value.textureStatus === "pending")).toBe(true);
  mock.release();
  await done;
});

test("a failed prefetch waits for its normal turn, retries only once, and warns once on failure", async () => {
  const mock = mockImages();
  const floor = floors("fail-floor");
  const failing = resource("failing", { texture: asset("/fail.png") });
  const after = resource("after", { texture: asset("/after-fail.png") });
  const warn = vi.fn();
  const done = run([{ resources: [...floor, failing, after] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(6));
  mock.job("/after-fail.png").land();
  mock.job("/fail.png").fail(new Error("speculative failure"));
  await turn();
  expect(mock.counts.get("/fail.png")).toBe(1);
  expect([failing.textureStage, after.textureStage]).toEqual(["queued", "queued"]);
  expect(warn).not.toHaveBeenCalled();
  mock.job("/fail-floor-0.png").land();
  await vi.waitFor(() => expect(mock.jobs.filter((job) => job.url === "/fail.png")).toHaveLength(2));
  mock.jobs.filter((job) => job.url === "/fail.png")[1]!.fail(new Error("real failure"));
  await vi.waitFor(() => expect(failing.textureStatus).toBe("fallback"));
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0]![0]).toContain("real failure");
  expect(mock.counts.get("/fail.png")).toBe(2);
  mock.release();
  await done;
  expect(mock.counts.get("/fail.png")).toBe(2);
});

test("removing a pending owner closes its late image and lets a later ready resource proceed", async () => {
  const mock = mockImages();
  const floor = floors("cancel-floor");
  const removed = resource("removed", { texture: asset("/removed.png") });
  const next = resource("next", { texture: asset("/next.png") });
  const warn = vi.fn();
  const entries = [{ resources: [...floor, removed, next] }];
  const done = run(entries, warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(6));
  mock.job("/next.png").land();
  for (let i = 0; i < 3; i += 1) await turn();
  expect(next.textureStage).toBe("queued");
  expect(mock.counts.get("/removed.png")).toBe(1);
  expect(warn).not.toHaveBeenCalled();
  entries[0]!.resources.splice(entries[0]!.resources.indexOf(removed), 1);
  dispose(removed);
  await vi.waitFor(() => expect(next.textureStatus).toBe("textured"));
  expect(removed.textureStage).toBe("cancelled");
  mock.job("/removed.png").land();
  await vi.waitFor(() => expect(mock.job("/removed.png").image.close).toHaveBeenCalledTimes(1));
  expect(floor.every((value) => value.textureStatus === "pending")).toBe(true);
  expect(warn).not.toHaveBeenCalled();
  mock.release();
  await done;
});

test("disposing a non-owning duplicate wakes its ready successor without releasing another holder", async () => {
  const mock = mockImages();
  const primary = resource("primary", { texture: asset("/shared-wait.png") });
  const primaryDone = run([{ resources: [primary] }]);
  const floor = floors("duplicate-floor");
  const duplicate = resource("duplicate", { texture: asset("/shared-wait.png") });
  const next = resource("next", { texture: asset("/duplicate-next.png") });
  const done = run([{ resources: [...floor, duplicate, next] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(6));
  mock.job("/duplicate-next.png").land();
  await turn();
  expect(next.textureStage).toBe("queued");
  dispose(duplicate);
  await vi.waitFor(() => expect(next.textureStatus).toBe("textured"));
  expect(duplicate.textureStage).toBe("cancelled");
  expect(primary.textureStatus).toBe("pending");
  expect(mock.job("/shared-wait.png").image.close).not.toHaveBeenCalled();
  expect(mock.counts.get("/shared-wait.png")).toBe(1);
  mock.release();
  await Promise.all([done, primaryDone]);
  expect(imageOf(primary)).toBe(mock.job("/shared-wait.png").image);
  expect(mock.job("/shared-wait.png").image.close).not.toHaveBeenCalled();
  dispose(primary);
  expect(mock.job("/shared-wait.png").image.close).toHaveBeenCalledTimes(1);
});

test("disposal re-entering at ready handoff cannot close the pinned image early or fetch again", async () => {
  const mock = mockImages();
  const floor = floors("handoff-floor");
  let target!: Resource;
  let closedAtHandoff = -1;
  target = resource("handoff", { texture: asset("/handoff.png") }, (stage) => {
    if (stage !== "start") return;
    dispose(target);
    closedAtHandoff = mock.job("/handoff.png").image.close.mock.calls.length;
  });
  const warn = vi.fn();
  const done = run([{ resources: [...floor, target] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(5));
  mock.job("/handoff.png").land();
  await vi.waitFor(() => expect(target.textureStage).toBe("cancelled"));
  expect(closedAtHandoff).toBe(0);
  expect(mock.job("/handoff.png").image.close).toHaveBeenCalledTimes(1);
  expect(mock.counts.get("/handoff.png")).toBe(1);
  expect(target.texturedMaterial).toBeNull();
  expect(warn).not.toHaveBeenCalled();
  mock.release();
  await done;
});

test("runtime-added entries in separate sweeps share one bounded lane and one URL lease", async () => {
  const mock = mockImages();
  const firstFloor = floors("first-floor");
  const secondFloor = floors("second-floor");
  const starts: string[] = [];
  let inAssembly = 0;
  let peak = 0;
  const observe = (name: string) => (stage: string) => {
    if (stage === "start") { starts.push(name); inAssembly += 1; peak = Math.max(peak, inAssembly); }
    if (stage === "done") inAssembly -= 1;
  };
  const first = resource("first", { texture: asset("/runtime.png") }, observe("first"));
  const later = resource("later", { texture: asset("/runtime.png") }, observe("later"));
  const done = run([{ resources: [...firstFloor, first] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(5));
  const laterDone = run([{ resources: [...secondFloor, later] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(9));
  mock.job("/runtime.png").land();
  await vi.waitFor(() => expect([first.textureStatus, later.textureStatus]).toEqual(["textured", "textured"]));
  expect(starts).toEqual(["first", "later"]);
  expect(peak).toBe(1);
  expect([...firstFloor, ...secondFloor].every((value) => value.textureStatus === "pending")).toBe(true);
  expect(mock.counts.get("/runtime.png")).toBe(1);
  dispose(first);
  expect(mock.job("/runtime.png").image.close).not.toHaveBeenCalled();
  dispose(later);
  expect(mock.job("/runtime.png").image.close).toHaveBeenCalledTimes(1);
  mock.release();
  await Promise.all([done, laterDone]);
});

test("a failure after image handoff releases it once, warns once, and advances the next ready resource", async () => {
  const mock = mockImages();
  const floor = floors("assembly-fail-floor");
  const broken = resource("broken-after-handoff", { texture: asset("/assembly-fail.png") }, (stage) => {
    if (stage === "decoded") throw new Error("assembly failed");
  });
  const next = resource("next", { texture: asset("/assembly-next.png") });
  const warn = vi.fn();
  const done = run([{ resources: [...floor, broken, next] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(6));
  mock.job("/assembly-next.png").land();
  mock.job("/assembly-fail.png").land();
  await vi.waitFor(() => expect([broken.textureStatus, next.textureStatus]).toEqual(["fallback", "textured"]));
  expect(broken.textureStage).toBe("failed");
  expect(broken.textureWarnings).toHaveLength(1);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0]![0]).toContain("assembly failed");
  expect(mock.job("/assembly-fail.png").image.close).toHaveBeenCalledTimes(1);
  expect(mock.counts.get("/assembly-fail.png")).toBe(1);
  expect(floor.every((value) => value.textureStatus === "pending")).toBe(true);
  mock.release();
  await done;
  expect(mock.job("/assembly-fail.png").image.close).toHaveBeenCalledTimes(1);
});

test("worker rejection releases still-queued leases even with a never-settling head", async () => {
  const mock = mockImages();
  const floor = floors("cleanup-floor");
  const head = resource("head", { roughnessMap: asset("/never-settled.png") });
  const queued = resource("queued", { texture: asset("/cleanup-queued.png") });
  const warn = vi.fn(() => { throw new Error("warning sink failed"); });
  const done = run([{ resources: [...floor, head, queued] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(6));
  mock.job("/cleanup-queued.png").land();
  for (let i = 0; i < 3; i += 1) await turn();
  expect([head.textureStage, queued.textureStage]).toEqual(["queued", "queued"]);
  expect(mock.counts.get("/never-settled.png")).toBe(1);
  expect(mock.counts.get("/cleanup-queued.png")).toBe(1);
  mock.job("/cleanup-floor-0.png").fail(new Error("floor failed"));
  await expect(done).rejects.toThrow("warning sink failed");
  expect(warn).toHaveBeenCalledTimes(1);
  expect(mock.job("/cleanup-queued.png").image.close).toHaveBeenCalledTimes(1);
  expect(queued.textureDisposer).toBeUndefined();
  expect(mock.job("/never-settled.png").image.close).not.toHaveBeenCalled();
  for (const value of [...floor, head, queued]) dispose(value);
  mock.job("/never-settled.png").land();
  await vi.waitFor(() => expect(mock.job("/never-settled.png").image.close).toHaveBeenCalledTimes(1));
  mock.release();
});

test("a ready assembly failure reports fallback and a throwing warning sink rejects without leaking its pin", async () => {
  const mock = mockImages();
  const floor = floors("warning-floor");
  const broken = resource("broken", { texture: asset("/broken.png") });
  Object.defineProperty(broken.sourceNode, "material", { get: () => { throw new Error("material failed"); } });
  const warn = vi.fn(() => { throw new Error("warning failed"); });
  const done = run([{ resources: [...floor, broken] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(5));
  mock.job("/broken.png").land();
  await expect(done).rejects.toThrow("warning failed");
  expect(broken.textureStatus).toBe("fallback");
  expect(broken.textureWarnings).toHaveLength(1);
  expect(broken.textureWarnings[0]).toContain("material failed");
  expect(warn).toHaveBeenCalledTimes(1);
  expect(mock.job("/broken.png").image.close).toHaveBeenCalledTimes(1);
  expect(mock.counts.get("/broken.png")).toBe(1);
  expect(floor.every((value) => value.textureStatus === "pending")).toBe(true);
  mock.release();
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
  const mock = mockImages();
  const floor = floors("malformed-floor");
  const malformed = resource("malformed", spec());
  const valid = resource("valid-after-malformed", { texture: asset("/after-malformed.png") });
  const warn = vi.fn();
  const ordered = interleaveByMapSet([malformed, valid] as never, false);
  expect(ordered.map((value) => value.name)).toEqual(["malformed", "valid-after-malformed"]);
  const done = run([{ resources: [...floor, malformed, valid] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(5));
  expect(malformed.textureStage).toBe("queued");
  expect(mock.counts.has(invalidUrl)).toBe(false);
  mock.job("/after-malformed.png").land();
  await turn();
  expect(valid.textureStage).toBe("queued");
  expect(warn).not.toHaveBeenCalled();

  mock.job("/malformed-floor-0.png").land();
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

test("a malformed map-set discovered during interleaving is isolated by the real worker", async () => {
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
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(5));
  expect(reads).toBeGreaterThanOrEqual(2);
  expect(mock.counts.has("/ignored-base.png")).toBe(false);
  expect(mock.counts.has("/first-coat.png")).toBe(false);
  mock.job("/late-valid.png").land();
  mock.job("/late-malformed-floor-0.png").land();
  await vi.waitFor(() => expect([malformed.textureStatus, valid.textureStatus]).toEqual(["fallback", "textured"]));
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("clearcoatMap requires a typed texture asset reference"));
  expect(floor.slice(1).every((value) => value.textureStatus === "pending")).toBe(true);
  mock.release();
  await done;
});

test("a malformed queued spec can be repaired before its worker takes ownership", async () => {
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
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(5));
  mock.job("/repair-next.png").land();
  await turn();
  expect([repaired.textureStage, next.textureStage]).toEqual(["queued", "queued"]);
  expect(mock.counts.has("/repair-base.png")).toBe(false);
  spec.clearcoatMap = asset("/repair-coat.png");
  mock.job("/repair-floor-0.png").land();
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(7));
  mock.job("/repair-base.png").land();
  mock.job("/repair-coat.png").land();
  await vi.waitFor(() => expect([repaired.textureStatus, next.textureStatus]).toEqual(["textured", "textured"]));
  expect(mock.counts.get("/repair-base.png")).toBe(1);
  expect(mock.counts.get("/repair-coat.png")).toBe(1);
  expect(mock.counts.get("/repair-next.png")).toBe(1);
  expect(warn).not.toHaveBeenCalled();
  expect(floor.slice(1).every((value) => value.textureStatus === "pending")).toBe(true);
  mock.release();
  await done;
});

test("disposing a malformed queued resource cancels it without a warning and wakes a ready successor", async () => {
  const mock = mockImages();
  const floor = floors("malformed-cancel-floor");
  const malformed = resource("malformed-cancel", { clearcoatMap: { kind: "invalid" } });
  const next = resource("next", { texture: asset("/malformed-cancel-next.png") });
  const warn = vi.fn();
  const done = run([{ resources: [...floor, malformed, next] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(5));
  mock.job("/malformed-cancel-next.png").land();
  await turn();
  expect(next.textureStage).toBe("queued");
  dispose(malformed);
  await vi.waitFor(() => expect(next.textureStatus).toBe("textured"));
  expect(malformed.textureStatus).toBe("none");
  expect(malformed.textureStage).toBe("cancelled");
  expect(malformed.textureWarnings).toEqual([]);
  expect(warn).not.toHaveBeenCalled();
  expect(mock.counts.get("/malformed-cancel-next.png")).toBe(1);
  expect(floor.every((value) => value.textureStatus === "pending")).toBe(true);
  mock.release();
  await done;
});

test("a throwing warning for a malformed resource rejects and releases other queued leases", async () => {
  const mock = mockImages();
  const floor = floors("malformed-warning-floor");
  const malformed = resource("malformed-warning", { clearcoatMap: { kind: "invalid" } });
  const barrier = resource("barrier", { roughnessMap: asset("/malformed-warning-barrier.png") });
  const queued = resource("queued", { texture: asset("/malformed-warning-queued.png") });
  const warn = vi.fn(() => { throw new Error("malformed warning sink failed"); });
  const done = run([{ resources: [...floor, malformed, barrier, queued] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(6));
  mock.job("/malformed-warning-queued.png").land();
  await turn();
  expect(queued.textureStage).toBe("queued");
  mock.job("/malformed-warning-floor-0.png").land();
  await expect(done).rejects.toThrow("malformed warning sink failed");
  expect(malformed.textureStatus).toBe("fallback");
  expect(malformed.textureWarnings).toHaveLength(1);
  expect(malformed.textureWarnings[0]).toContain("clearcoatMap requires a typed texture asset reference");
  expect(warn).toHaveBeenCalledTimes(1);
  expect(mock.job("/malformed-warning-queued.png").image.close).toHaveBeenCalledTimes(1);
  expect(queued.textureDisposer).toBeUndefined();
  expect(floor.slice(1).every((value) => value.textureStatus === "pending")).toBe(true);
  for (const value of [...floor, malformed, barrier, queued]) dispose(value);
  mock.job("/malformed-warning-barrier.png").land();
  await vi.waitFor(() => expect(mock.job("/malformed-warning-barrier.png").image.close).toHaveBeenCalledTimes(1));
  mock.release();
});

test("a late final map makes the queue head ready and wakes its already-ready successor", async () => {
  const mock = mockImages();
  const floor = floors("late-head-floor");
  const order: string[] = [];
  const head = resource("head", { texture: asset("/late-head-color.png"), normal: asset("/late-head-normal.png") },
    (stage) => { if (stage === "start") order.push("head"); });
  const next = resource("next", { texture: asset("/late-head-next.png") },
    (stage) => { if (stage === "start") order.push("next"); });
  const done = run([{ resources: [...floor, head, next] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(7));
  mock.job("/late-head-color.png").land();
  mock.job("/late-head-next.png").land();
  await turn();
  expect([head.textureStage, next.textureStage]).toEqual(["queued", "queued"]);
  expect(order).toEqual([]);
  mock.job("/late-head-normal.png").land();
  await vi.waitFor(() => expect([head.textureStatus, next.textureStatus]).toEqual(["textured", "textured"]));
  expect(order).toEqual(["head", "next"]);
  expect(imageOf(head)).toBe(mock.job("/late-head-color.png").image);
  expect(imageOf(head, "u_normalTexture")).toBe(mock.job("/late-head-normal.png").image);
  expect(imageOf(next)).toBe(mock.job("/late-head-next.png").image);
  expect(floor.every((value) => value.textureStatus === "pending")).toBe(true);
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
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(5));
  const second = run([{ resources: [...secondFloor, shared] }], warn);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(9));
  mock.job("/shared-object.png").land();
  await vi.waitFor(() => expect(shared.textureStatus).toBe("textured"));
  expect(starts).toBe(1);
  expect(mock.counts.get("/shared-object.png")).toBe(1);
  expect(imageOf(shared)).toBe(mock.job("/shared-object.png").image);
  expect([...firstFloor, ...secondFloor].every((value) => value.textureStatus === "pending")).toBe(true);
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
  for (let i = 0; i < 4; i += 1) append(`scene-floor-${i}`, `/scene-floor-${i}.png`);
  append("removed", "/scene-ready.png");
  const warn = vi.fn();
  const done = upgradeProductionPrimitiveTextures(scene.primitiveEntries, warn);
  void done.catch(() => undefined);
  runs.push(done);
  try {
    await vi.waitFor(() => expect(mock.jobs).toHaveLength(5));
    const removed = scene.primitiveEntries.find((entry) => entry.node.name === "removed")!.resources[0]!;
    mock.job("/scene-ready.png").land();
    await vi.waitFor(() => expect(removed.textureStatus).toBe("textured"));
    const old = mock.job("/scene-ready.png").image;
    expect(scene.primitiveEntries.slice(0, 4).every((entry) => entry.resources[0]!.textureStatus === "pending")).toBe(true);
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

test("occlusion-only and emissive-only cached maps assemble while four floors remain blocked", async () => {
  const mock = mockImages();
  const floor = floors("slot-only-floor");
  const occlusion = resource("occlusion-only", { occlusionMap: asset("/only-occlusion.png") });
  const emissive = resource("emissive-only", { emissiveMap: asset("/only-emissive.png") });
  const done = run([{ resources: [...floor, occlusion, emissive] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(6));
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

test("an img-fallback winner advances the ready lane and releases both winning and late-loser images", async () => {
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
  const floor = floors("img-floor");
  const ready = resource("img-fallback", { texture: asset("/img-fallback.png") });
  const done = run([{ resources: [...floor, ready] }]);
  await vi.waitFor(() => expect(mock.jobs).toHaveLength(5));
  await vi.waitFor(() => expect(ready.textureStatus).toBe("textured"), { timeout: 6000 });
  await vi.waitFor(() => expect(waiters).toHaveLength(4));
  const winningImage = imageOf(ready) as FakeImage;
  expect(images).toContain(winningImage);
  expect(floor.every((value) => value.textureStatus === "pending")).toBe(true);
  expect(mock.counts.get("/img-fallback.png")).toBe(1);
  expect(createObjectURL).toHaveBeenCalledTimes(5);
  dispose(ready);
  expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  expect(revokeObjectURL).toHaveBeenCalledWith(winningImage.src);

  mock.release();
  await done;
  await vi.waitFor(() => expect(mock.job("/img-fallback.png").image.close).toHaveBeenCalledTimes(1));
  for (const release of waiters) release();
  await vi.waitFor(() => expect(revokeObjectURL).toHaveBeenCalledTimes(5));
  expect(mock.job("/img-fallback.png").image.close).toHaveBeenCalledTimes(1);
}, 10000);
