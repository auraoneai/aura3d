import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { defineAuraAssets, upgradeProductionPrimitiveTextures } from "@aura3d/engine";
import { PBRMaterial, TextureBinding } from "@aura3d/rendering";
import * as pngDecoder from "../../../../packages/engine/src/agent-api/PngTexturePixels";
import { resetSharedProductionTextureDecodes, texturePendingMs } from "../../../../packages/engine/src/agent-api/compiler/textures";

const asset = (url: string) => defineAuraAssets({
  map: { type: "texture", format: "png", url, hash: "fixture" }
}).map;

function resource(name: string, materialSpec: Record<string, unknown>) {
  const value = {
    name, materialSpec, sourceNode: { kind: "primitive", primitive: "box", material: materialSpec },
    material: new PBRMaterial(), geometry: { vertexBuffer: { format: { hasAttribute: (_name: string) => true } } },
    textureStatus: "none", textureWarnings: [] as string[], textureSlots: [] as string[],
    texturedMaterial: null as PBRMaterial | null, textureDisposer: undefined as (() => void) | undefined,
    textureStage: undefined as string | undefined, texturePendingSince: undefined as number | undefined
  };
  resources.push(value);
  return value;
}
type Resource = ReturnType<typeof resource>;
type Entry = { resources: Resource[] };
type FakeImage = { width: number; height: number; closed: boolean; close: ReturnType<typeof vi.fn> };
type Decode = { url: string; image: FakeImage; land(): void; fail(error: Error): void };

let resources: Resource[];
let runs: Promise<void>[];
let unblockers: (() => void)[];

beforeEach(() => { resources = []; runs = []; unblockers = []; });
afterEach(async () => {
  for (const value of resources) dispose(value);
  for (const unblock of unblockers) unblock();
  await Promise.allSettled(runs);
  resetSharedProductionTextureDecodes();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function dispose(value: Resource): void {
  value.textureDisposer?.();
  value.material.dispose();
  value.texturedMaterial?.dispose();
}

function runEntries(entries: Entry[], warn: (message: string) => void = () => undefined): Promise<void> {
  const pending = upgradeProductionPrimitiveTextures(entries as unknown as Parameters<typeof upgradeProductionPrimitiveTextures>[0], warn);
  runs.push(pending);
  return pending;
}
const run = (values: Resource[], warn?: (message: string) => void): Promise<void> => runEntries([{ resources: values }], warn);
const floor = (prefix: string): Resource[] =>
  Array.from({ length: 4 }, (_, index) => resource(`${prefix}-${index}`, { texture: asset(`/${prefix}-${index}.png`) }));

function source(value: Resource, uniform = "u_baseColorTexture") {
  const binding = value.texturedMaterial?.getParameter(uniform);
  expect(binding).toBeInstanceOf(TextureBinding);
  return (binding as TextureBinding).texture!;
}

function browser(options: {
  response?: (url: string, attempt: number) => Response | Promise<Response>;
  blobUrl?: (blob: Blob) => Promise<string>;
  hold?: (url: string) => boolean;
} = {}) {
  const counts = new Map<string, number>();
  const starts: Decode[] = [];
  let unblocked = false;
  const fetchMock = vi.fn(async (url: string) => {
    const attempt = (counts.get(url) ?? 0) + 1;
    counts.set(url, attempt);
    return options.response?.(url, attempt) ?? new Response(url);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("createImageBitmap", vi.fn(async (blob: Blob) => {
    const url = options.blobUrl ? await options.blobUrl(blob) : await blob.text();
    const image: FakeImage = { width: 2, height: 2, closed: false, close: vi.fn() };
    image.close.mockImplementation(() => {
      if (image.closed) throw new Error(`double close: ${url}`);
      image.closed = true;
    });
    let land!: () => void;
    let fail!: (error: Error) => void;
    const gate = new Promise<void>((resolve, reject) => { land = resolve; fail = reject; });
    starts.push({ url, image, land, fail });
    if (!unblocked && (options.hold?.(url) ?? true)) await gate;
    return image;
  }));
  const unblock = (): void => { unblocked = true; for (const started of starts) started.land(); };
  unblockers.push(unblock);
  return { fetchMock, counts, starts, unblock };
}

const turn = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

test("four blocked floor map sets do not prevent all four shared decal decodes from starting", async () => {
  const mock = browser();
  const floors = floor("floor");
  const urls = ["/scorch.png", "/crack.png", "/hazard.png", "/bullet.png"];
  const decals = urls.flatMap((url, group) =>
    Array.from({ length: [8, 4, 7, 12][group]! }, (_, index) => resource(`${group}-${index}`, { texture: asset(url) }))
  );
  const warn = vi.fn();
  const done = run([...floors, ...decals], warn);
  await vi.waitFor(() => expect(new Set(mock.starts.map(({ url }) => url))).toEqual(new Set([
    "/floor-0.png", "/floor-1.png", "/floor-2.png", "/floor-3.png", ...urls
  ])));
  expect(mock.fetchMock).toHaveBeenCalledTimes(8);
  expect(floors.map((value) => value.textureStage)).toEqual(floors.map((_, i) => `decode /floor-${i}.png`));
  expect(decals.every((value) => value.textureStatus === "pending" && value.textureStage === "queued")).toBe(true);
  expect(decals.every((value) => texturePendingMs(value) !== undefined)).toBe(true);

  for (const started of mock.starts.filter(({ url }) => urls.includes(url))) started.land();
  await turn();
  expect(decals.every((value) => value.textureStatus === "pending" && value.textureStage === "queued")).toBe(true);
  expect(floors.every((value) => value.textureStatus === "pending")).toBe(true);
  mock.unblock();
  await done;
  expect(warn).not.toHaveBeenCalled();
  expect([...floors, ...decals].every((value) => value.textureStatus === "textured" && value.textureStage === "done")).toBe(true);
  expect(mock.fetchMock).toHaveBeenCalledTimes(8);

  for (const url of urls) {
    const group = decals.filter((value) => (value.materialSpec.texture as { url: string }).url === url);
    const image = mock.starts.find((started) => started.url === url)!.image;
    expect(new Set(group.map((value) => source(value))).size).toBe(group.length);
    expect(group.every((value) => source(value).source === image)).toBe(true);
    for (const value of group.slice(0, -1)) dispose(value);
    expect(image.close).not.toHaveBeenCalled();
    dispose(group.at(-1)!);
    expect(image.close).toHaveBeenCalledTimes(1);
  }
  for (const value of floors) dispose(value);
  expect(mock.starts.every(({ image }) => image.close.mock.calls.length === 1)).toBe(true);
});

test.each(["fetch", "body", "decode"] as const)("look-ahead runs while the four workers are stalled at %s", async (phase) => {
  const releaseGates: (() => void)[] = [];
  unblockers.push(() => { for (const release of releaseGates) release(); });
  const mock = browser({
    response: (url) => {
      const response = new Response(url);
      if (!url.startsWith("/phase-floor-")) return response;
      if (phase === "fetch") return new Promise<Response>((resolve) => { releaseGates.push(() => resolve(response)); });
      if (phase === "body") {
        const read = response.arrayBuffer.bind(response);
        response.arrayBuffer = async () => {
          await new Promise<void>((resolve) => { releaseGates.push(resolve); });
          return read();
        };
      }
      return response;
    },
    hold: (url) => phase === "decode" && url.startsWith("/phase-floor-")
  });
  const floors = floor("phase-floor");
  const decals = Array.from({ length: 4 }, (_, i) => resource(`decal-${i}`, { texture: asset(`/phase-decal-${i}.png`) }));
  const done = run([...floors, ...decals]);
  await vi.waitFor(() => {
    expect(decals.every((_, i) => mock.starts.some(({ url }) => url === `/phase-decal-${i}.png`))).toBe(true);
    expect(floors.map((value) => value.textureStage)).toEqual(floors.map((_, i) => `${phase} /phase-floor-${i}.png`));
  });
  expect(decals.every((value) => value.textureStatus === "pending" && value.textureStage === "queued")).toBe(true);
  for (const release of releaseGates) release();
  mock.unblock();
  await done;
  expect([...floors, ...decals].every((value) => value.textureStatus === "textured")).toBe(true);
});

test("look-ahead is globally capped, map-set diverse, and counts abandoned unsettled work", async () => {
  const mock = browser();
  const firstFloors = floor("first-floor");
  const firstQueued = Array.from({ length: 20 }, (_, i) => resource(`first-${i}`, {
    texture: asset(`/first-${i}.png`), ...(i === 0 ? { normal: asset("/first-extra.png") } : {})
  }));
  run([...firstFloors, ...firstQueued]);
  await vi.waitFor(() => expect(mock.starts).toHaveLength(20));
  expect(mock.fetchMock).toHaveBeenCalledTimes(20); // four actual workers + sixteen speculative URLs
  expect(firstQueued.slice(0, 16).every((_, i) => mock.counts.get(`/first-${i}.png`) === 1)).toBe(true);
  expect(mock.counts.has("/first-extra.png")).toBe(false);
  for (let i = 1; i < 16; i += 1) mock.starts.find(({ url }) => url === `/first-${i}.png`)!.land();
  await turn(); // Completed images still consume the bounded speculative budget while held.

  const second = [...floor("second-floor"), resource("second-waiting", { texture: asset("/second-waiting.png") })];
  run(second);
  expect(mock.fetchMock).toHaveBeenCalledTimes(24);
  expect(mock.counts.has("/second-waiting.png")).toBe(false);
  const abandoned = mock.starts.find(({ url }) => url === "/first-0.png")!;
  dispose(firstQueued[0]!);

  const third = [...floor("third-floor"), resource("third-waiting", { texture: asset("/third-waiting.png") })];
  run(third);
  expect(mock.fetchMock).toHaveBeenCalledTimes(28);
  expect(mock.counts.has("/third-waiting.png")).toBe(false);
  abandoned.land();
  await vi.waitFor(() => expect(abandoned.image.close).toHaveBeenCalledTimes(1));
  await turn();

  const fourth = [...floor("fourth-floor"), resource("fourth-waiting", { texture: asset("/fourth-waiting.png") })];
  run(fourth);
  expect(mock.counts.get("/fourth-waiting.png")).toBe(1);
  expect(mock.fetchMock).toHaveBeenCalledTimes(33);
  for (const value of resources) dispose(value);
  mock.unblock();
  await Promise.all(runs);
  expect(mock.starts.every(({ image }) => image.close.mock.calls.length === 1)).toBe(true);
});

test("extra base and extension maps start after the first map from each queued set", async () => {
  const mock = browser();
  const first = resource("first", {
    texture: asset("/first.png"), normal: asset("/first-normal.png"), clearcoatMap: asset("/first-coat.png")
  });
  const broken = resource("broken", { texture: asset("/bad-check.png") });
  const second = resource("second", { texture: asset("/second.png"), emissiveMap: asset("/second-glow.png") });
  const firstUvCheck = vi.fn((_name: string) => true);
  const brokenUvCheck = vi.fn((_name: string) => { throw new Error("bad geometry"); });
  const secondUvCheck = vi.fn((_name: string) => true);
  first.geometry.vertexBuffer.format.hasAttribute = firstUvCheck;
  broken.geometry.vertexBuffer.format.hasAttribute = brokenUvCheck;
  second.geometry.vertexBuffer.format.hasAttribute = secondUvCheck;
  const values = [...floor("slot-floor"), first, broken, second];
  const done = run(values);
  expect(mock.fetchMock.mock.calls.map(([url]) => url).slice(4)).toEqual([
    "/first.png", "/second.png", "/first-normal.png", "/second-glow.png", "/first-coat.png"
  ]);
  expect(firstUvCheck).toHaveBeenCalledTimes(1);
  expect(brokenUvCheck).toHaveBeenCalledTimes(1);
  expect(secondUvCheck).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(mock.starts).toHaveLength(9));
  for (const value of values) dispose(value);
  mock.unblock();
  await done;
  expect(mock.starts.every(({ image }) => image.close.mock.calls.length === 1)).toBe(true);
});

test("a resource disposed between prefetch rounds cannot use its cached later URLs", async () => {
  const victim = resource("victim", {
    texture: asset("/before-disposal.png"), normal: asset("/after-disposal.png")
  });
  const mock = browser({
    response: (url) => {
      if (url === "/dispose-trigger.png") dispose(victim);
      return new Response(url);
    }
  });
  const floors = floor("round-floor");
  const trigger = resource("trigger", { texture: asset("/dispose-trigger.png") });
  const values = [...floors, victim, trigger];
  const done = run(values);
  expect(mock.fetchMock.mock.calls.map(([url]) => url).slice(4)).toEqual([
    "/before-disposal.png", "/dispose-trigger.png"
  ]);
  expect(mock.counts.has("/after-disposal.png")).toBe(false);
  await vi.waitFor(() => expect(mock.starts).toHaveLength(6));
  const abandoned = mock.starts.find(({ url }) => url === "/before-disposal.png")!;
  abandoned.land();
  await vi.waitFor(() => expect(abandoned.image.close).toHaveBeenCalledTimes(1));
  expect(floors.every((value) => value.textureStatus === "pending")).toBe(true);
  for (const value of values) dispose(value);
  mock.unblock();
  await done;
  expect(mock.starts.every(({ image }) => image.close.mock.calls.length === 1)).toBe(true);
});

test("look-ahead ignores invalid refs, URLs, procedural inputs, live handles, and unusable geometry", async () => {
  const mock = browser();
  const floors = floor("blocked");
  const badRef = (url: unknown, extra: Record<string, unknown> = {}) => ({
    kind: "aura-asset-ref", type: "texture", format: "png", id: "bad", url, ...extra
  });
  const invalid = [
    resource("missing", { texture: badRef("") }),
    resource("not-a-string", { texture: badRef(12) }),
    resource("whitespace", { texture: badRef("  ") }),
    resource("malformed", { texture: badRef("https://[broken") }),
    resource("unsupported-scheme", { texture: badRef("javascript:alert(1)") }),
    resource("wrong-type", { texture: badRef("/model.png", { type: "model" }) }),
    resource("wrong-format", { texture: badRef("/wrong.svg", { format: "svg" }) }),
    resource("no-id", { texture: badRef("/no-id.png", { id: undefined }) }),
    resource("procedural", { normal: { kind: "aura-procedural-texture", texture: "noise", url: "/procedural.png" } }),
    resource("live", { normal: { kind: "aura-texture-ref", id: "live", url: "/live.png" } })
  ];
  const noUv = resource("no-uv", { texture: asset("/no-uv.png") });
  noUv.geometry.vertexBuffer.format.hasAttribute = () => false;
  const noUv1 = resource("no-uv1", {
    texture: asset("/no-uv1-base.png"), clearcoatMap: asset("/no-uv1-coat.png"), texCoords: { clearcoat: 1 }
  });
  noUv1.geometry.vertexBuffer.format.hasAttribute = (name) => name !== "uv1";
  const good = resource("valid", { texture: asset("/valid.png") });
  const done = run([...floors, ...invalid, noUv, noUv1, good]);
  await vi.waitFor(() => expect(mock.starts).toHaveLength(5));
  expect([...mock.counts.keys()].sort()).toEqual([
    "/blocked-0.png", "/blocked-1.png", "/blocked-2.png", "/blocked-3.png", "/valid.png"
  ]);
  for (const value of [...floors, ...invalid, noUv, noUv1, good]) dispose(value);
  mock.unblock();
  await done;
  expect(mock.starts.every(({ image }) => image.close.mock.calls.length === 1)).toBe(true);
});

test("a failed prefetch retries when its resource starts and reports the real failure", async () => {
  const mock = browser({
    response: (url, attempt) => {
      if (url === "/retry.png" && attempt === 1) return new Response("prefetch", { status: 503 });
      if (url === "/failure.png" && attempt < 3) return new Response("failure", { status: attempt === 1 ? 503 : 404 });
      return new Response(url);
    },
    hold: (url) => url.startsWith("/failure-floor-")
  });
  const floors = floor("failure-floor");
  const retry = resource("retry", { texture: asset("/retry.png") });
  const failure = resource("failure", { texture: asset("/failure.png") });
  const warn = vi.fn();
  const done = run([...floors, retry, failure], warn);
  await vi.waitFor(() => expect(mock.starts).toHaveLength(4));
  await turn();
  expect(mock.counts.get("/retry.png")).toBe(1);
  expect(mock.counts.get("/failure.png")).toBe(1);
  expect(warn).not.toHaveBeenCalled();
  expect([retry.textureStage, failure.textureStage]).toEqual(["queued", "queued"]);
  expect([retry.textureDisposer, failure.textureDisposer]).toEqual([undefined, undefined]);
  mock.unblock();
  await done;
  expect(mock.counts.get("/retry.png")).toBe(2);
  expect(retry.textureStatus).toBe("textured");
  expect(mock.counts.get("/failure.png")).toBe(2);
  expect(failure.textureStatus).toBe("fallback");
  expect(failure.textureStage).toBe("failed");
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("status 404 for /failure.png"));
  expect(failure.textureWarnings).toEqual([warn.mock.calls[0]![0]]);

  const later = resource("later-retry", { texture: asset("/failure.png") });
  await run([later], warn);
  expect(later.textureStatus).toBe("textured");
  expect(mock.counts.get("/failure.png")).toBe(3);
  expect(warn).toHaveBeenCalledTimes(1);
});

test("a bad queued geometry check is reported by its real worker, not by speculative scanning", async () => {
  const mock = browser();
  const floors = floor("geometry-floor");
  const broken = resource("broken", { texture: asset("/broken.png") });
  broken.geometry.vertexBuffer.format.hasAttribute = () => { throw new Error("bad geometry"); };
  const warn = vi.fn();
  const done = run([...floors, broken], warn);
  await vi.waitFor(() => expect(mock.starts).toHaveLength(4));
  expect(mock.counts.has("/broken.png")).toBe(false);
  expect(warn).not.toHaveBeenCalled();
  mock.unblock();
  await done;
  expect(broken.textureStatus).toBe("fallback");
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("bad geometry"));
  expect(mock.counts.has("/broken.png")).toBe(false);
});

test("disposing a queued owner immediately closes its decoded prefetch while workers remain blocked", async () => {
  const mock = browser();
  const floors = floor("dispose-floor");
  const owner = resource("owner", { texture: asset("/disposed.png") });
  const previousDisposer = vi.fn();
  owner.textureDisposer = previousDisposer;
  const done = run([...floors, owner]);
  await vi.waitFor(() => expect(mock.starts).toHaveLength(5));
  const image = mock.starts.find(({ url }) => url === "/disposed.png")!.image;
  mock.starts.find(({ url }) => url === "/disposed.png")!.land();
  await turn();
  expect(image.close).not.toHaveBeenCalled();
  dispose(owner);
  expect(image.close).toHaveBeenCalledTimes(1);
  expect(previousDisposer).toHaveBeenCalledTimes(1);
  expect(floors.every((value) => value.textureStatus === "pending")).toBe(true);
  mock.unblock();
  await done;
  expect(owner.textureStage).toBe("cancelled");
  expect(image.close).toHaveBeenCalledTimes(1);
});

test("an active worker takes ownership of an in-flight prefetch and reports its real decode stage", async () => {
  const mock = browser();
  const floors = floor("transfer-floor");
  const queued = resource("queued", { texture: asset("/transfer.png") });
  const done = run([...floors, queued]);
  await vi.waitFor(() => expect(mock.starts).toHaveLength(5));
  const prefetched = mock.starts.find(({ url }) => url === "/transfer.png")!;
  mock.starts.find(({ url }) => url === "/transfer-floor-0.png")!.land();
  await vi.waitFor(() => expect(queued.textureStage).toBe("decode /transfer.png"));
  expect(mock.counts.get("/transfer.png")).toBe(1);
  prefetched.land();
  await vi.waitFor(() => expect(queued.textureStatus).toBe("textured"));
  expect(source(queued).source).toBe(prefetched.image);
  expect(prefetched.image.close).not.toHaveBeenCalled();
  dispose(queued);
  expect(prefetched.image.close).toHaveBeenCalledTimes(1);
  expect(floors.slice(1).every((value) => value.textureStatus === "pending")).toBe(true);
  mock.unblock();
  await done;
  expect(prefetched.image.close).toHaveBeenCalledTimes(1);
});

test("sweep cleanup releases queued prefetches if a worker unexpectedly rejects", async () => {
  const mock = browser();
  const floors = floor("exception-floor");
  const queued = resource("queued", { texture: asset("/queued.png") });
  const done = run([...floors, queued], () => { throw new Error("warning sink failed"); });
  await vi.waitFor(() => expect(mock.starts).toHaveLength(5));
  const prefetched = mock.starts.find(({ url }) => url === "/queued.png")!;
  prefetched.land();
  await turn();
  expect(prefetched.image.close).not.toHaveBeenCalled();
  mock.starts.find(({ url }) => url === "/exception-floor-0.png")!.fail(new Error("decode failure"));
  await expect(done).rejects.toThrow("warning sink failed");
  expect(prefetched.image.close).toHaveBeenCalledTimes(1);
  expect(queued.textureDisposer).toBeUndefined();
  expect(floors.slice(1).every((value) => value.textureStatus === "pending")).toBe(true);
  for (const value of [...floors, queued]) dispose(value);
  mock.unblock();
  await vi.waitFor(() => expect([...floors.slice(1), queued].every((value) => value.textureStage === "cancelled")).toBe(true));
});

test("a cancelled pending prefetch closes on arrival and a replacement never reuses it", async () => {
  const mock = browser();
  const floors = floor("late-floor");
  const owner = resource("owner", { texture: asset("/late.png") });
  const remaining = resource("remaining", { texture: asset("/late.png") });
  const warn = vi.fn();
  const done = run([...floors, owner, remaining], warn);
  await vi.waitFor(() => expect(mock.starts.filter(({ url }) => url === "/late.png")).toHaveLength(1));
  const old = mock.starts.find(({ url }) => url === "/late.png")!;
  dispose(owner);
  expect(old.image.close).not.toHaveBeenCalled();
  const replacement = resource("replacement", { texture: asset("/late.png") });
  const replacementDone = run([replacement], warn);
  await vi.waitFor(() => expect(mock.starts.filter(({ url }) => url === "/late.png")).toHaveLength(2));
  const fresh = mock.starts.filter(({ url }) => url === "/late.png")[1]!;
  old.land();
  await vi.waitFor(() => expect(old.image.close).toHaveBeenCalledTimes(1));
  fresh.land();
  await replacementDone;
  expect(source(replacement).source).toBe(fresh.image);
  expect(fresh.image.close).not.toHaveBeenCalled();
  dispose(replacement);
  expect(fresh.image.close).toHaveBeenCalledTimes(1);
  mock.unblock();
  await done;
  const last = mock.starts.filter(({ url }) => url === "/late.png")[2]!;
  expect(source(remaining).source).toBe(last.image);
  expect(last.image.closed).toBe(false);
  expect(warn).not.toHaveBeenCalled();
  dispose(remaining);
  expect(last.image.close).toHaveBeenCalledTimes(1);
  expect(old.image.close).toHaveBeenCalledTimes(1);
});

test("a cancelled prefetch can reject later without warning or an unhandled rejection", async () => {
  const mock = browser();
  const floors = floor("reject-floor");
  const owner = resource("cancelled", { texture: asset("/reject.png") });
  const warn = vi.fn();
  const done = run([...floors, owner], warn);
  await vi.waitFor(() => expect(mock.starts.filter(({ url }) => url === "/reject.png")).toHaveLength(1));
  const rejected = mock.starts.find(({ url }) => url === "/reject.png")!;
  dispose(owner);
  rejected.fail(new Error("late decode failure"));
  await turn(); // Vitest also detects unhandled rejections after this event-loop turn.
  expect(warn).not.toHaveBeenCalled();
  mock.unblock();
  await done;
  expect(owner.textureStage).toBe("cancelled");
  expect(warn).not.toHaveBeenCalled();
});

test("disposal re-entering from fetch still releases the not-yet-returned prefetch lease", async () => {
  let owner!: Resource;
  const mock = browser({
    response: (url) => {
      if (url === "/reentrant.png") dispose(owner);
      return new Response(url);
    }
  });
  const floors = floor("reentrant-floor");
  owner = resource("reentrant", { texture: asset("/reentrant.png") });
  const warn = vi.fn();
  const done = run([...floors, owner], warn);
  await vi.waitFor(() => expect(mock.starts.filter(({ url }) => url === "/reentrant.png")).toHaveLength(1));
  const late = mock.starts.find(({ url }) => url === "/reentrant.png")!;
  late.land();
  await vi.waitFor(() => expect(late.image.close).toHaveBeenCalledTimes(1));
  expect(floors.every((value) => value.textureStatus === "pending")).toBe(true);
  mock.unblock();
  await done;
  expect(warn).not.toHaveBeenCalled();
  expect(late.image.close).toHaveBeenCalledTimes(1);
});

test("disposing a prefetch owner releases only its lease when another resource shares the decode", async () => {
  const mock = browser();
  const floors = floor("shared-floor");
  const owner = resource("queued-owner", { texture: asset("/shared.png") });
  const done = run([...floors, owner]);
  await vi.waitFor(() => expect(mock.starts.filter(({ url }) => url === "/shared.png")).toHaveLength(1));
  const active = resource("active", { texture: asset("/shared.png") });
  const activeDone = run([active]);
  expect(mock.counts.get("/shared.png")).toBe(1);
  const image = mock.starts.find(({ url }) => url === "/shared.png")!;
  image.land();
  await activeDone;
  dispose(owner);
  expect(image.image.close).not.toHaveBeenCalled();
  dispose(active);
  expect(image.image.close).toHaveBeenCalledTimes(1);
  expect(floors.every((value) => value.textureStatus === "pending")).toBe(true);
  mock.unblock();
  await done;
  expect(image.image.close).toHaveBeenCalledTimes(1);
});

test("runtime-added entries receive their own look-ahead in the next sweep", async () => {
  const mock = browser();
  const first = floor("initial");
  const entries: Entry[] = [{ resources: first }];
  const done = runEntries(entries);
  await vi.waitFor(() => expect(mock.starts).toHaveLength(4));
  const laterFloors = floor("added-floor");
  const laterDecals = Array.from({ length: 4 }, (_, i) =>
    resource(`added-decal-${i}`, { texture: asset(`/added-decal-${i}.png`) })
  );
  entries.push({ resources: [...laterFloors, ...laterDecals] });
  expect(laterDecals.every((value) => value.textureStatus === "none")).toBe(true);
  for (const started of mock.starts.filter(({ url }) => url.startsWith("/initial-"))) started.land();
  await vi.waitFor(() => expect(mock.starts).toHaveLength(12));
  expect(laterFloors.map((value) => value.textureStage)).toEqual(laterFloors.map((_, i) => `decode /added-floor-${i}.png`));
  expect(laterDecals.every((value) => value.textureStatus === "pending" && value.textureStage === "queued")).toBe(true);
  mock.unblock();
  await done;
  expect([...first, ...laterFloors, ...laterDecals].every((value) => value.textureStatus === "textured")).toBe(true);
});

test("prefetched PNGs stay lazy and preserve exact transparent scalar pixels", async () => {
  const png = Uint8Array.from(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAG0lEQVR4nGP4IBjNwHOCnZHhnuLJercJe/8DADUDBxKxTfM3AAAAAElFTkSuQmCC",
    "base64"
  ));
  const mock = browser({
    response: (url) => url === "/transparent.png"
      ? new Response(png.slice(), { headers: { "content-type": "image/png" } }) : new Response(url),
    blobUrl: async (blob) => blob.type === "image/png" ? "/transparent.png" : blob.text(),
    hold: (url) => url.startsWith("/pixels-floor-")
  });
  const decode = vi.spyOn(pngDecoder, "decodePngTexturePixels");
  const floors = floor("pixels-floor");
  const color = resource("color", { texture: asset("/transparent.png") });
  const scalar = resource("scalar", { roughnessMap: asset("/transparent.png"), metalnessMap: asset("/transparent.png") });
  const done = run([...floors, color, scalar]);
  await vi.waitFor(() => expect(mock.starts).toHaveLength(5));
  await turn();
  expect(decode).not.toHaveBeenCalled();
  expect([color.textureStage, scalar.textureStage]).toEqual(["queued", "queued"]);
  mock.unblock();
  await done;
  expect(mock.counts.get("/transparent.png")).toBe(1);
  expect(decode).toHaveBeenCalledTimes(1);
  expect([...source(scalar, "u_metallicRoughnessTexture").data!]).toEqual([
    255, 17, 91, 255, 255, 200, 7, 255,
    255, 33, 201, 255, 255, 144, 189, 255
  ]);
  const image = mock.starts.find(({ url }) => url === "/transparent.png")!.image;
  expect(source(color).source).toBe(image);
  dispose(color);
  expect(image.close).not.toHaveBeenCalled();
  dispose(scalar);
  expect(image.close).toHaveBeenCalledTimes(1);
});
