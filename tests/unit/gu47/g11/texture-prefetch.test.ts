import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { defineAuraAssets, upgradeProductionPrimitiveTextures } from "@aura3d/engine";
import { PBRMaterial, TextureBinding } from "@aura3d/rendering";
import * as pngDecoder from "../../../../packages/engine/src/agent-api/PngTexturePixels";
import { resetSharedProductionTextureDecodes, texturePendingMs } from "../../../../packages/engine/src/agent-api/compiler/textures";

// Native 5.0: typed assets are verified against their declared digest. The default fetch stub serves the URL text, so
// each fixture declares the real SHA-256 of that text (pass `bytes` when a test serves something else).
const sha256 = (data: Uint8Array | string): string => createHash("sha256").update(data).digest("hex");
const asset = (url: string, bytes: Uint8Array | string = url) => defineAuraAssets({
  map: { type: "texture", format: "png", url, hash: sha256(bytes) }
}).map;

// Declared explicitly: deriving this from `resource`'s return type is circular because `resource` pushes into `resources`.
type Resource = {
  name: string;
  materialSpec: Record<string, unknown>;
  sourceNode: { kind: string; primitive: string; material: Record<string, unknown> };
  material: PBRMaterial;
  geometry: { vertexBuffer: { format: { hasAttribute: (name: string) => boolean } } };
  textureStatus: string;
  textureWarnings: string[];
  textureSlots: string[];
  texturedMaterial: PBRMaterial | null;
  textureDisposer: (() => void) | undefined;
  textureStage: string | undefined;
  texturePendingSince: number | undefined;
};

function resource(name: string, materialSpec: Record<string, unknown>): Resource {
  const value: Resource = {
    name, materialSpec, sourceNode: { kind: "primitive", primitive: "box", material: materialSpec },
    material: new PBRMaterial(), geometry: { vertexBuffer: { format: { hasAttribute: (_name: string) => true } } },
    textureStatus: "none", textureWarnings: [], textureSlots: [],
    texturedMaterial: null, textureDisposer: undefined,
    textureStage: undefined, texturePendingSince: undefined
  };
  resources.push(value);
  return value;
}
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
const floor = (prefix: string, count = 4): Resource[] =>
  Array.from({ length: count }, (_, index) => resource(`${prefix}-${index}`, { texture: asset(`/${prefix}-${index}.png`) }));

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
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
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

/*
 * Native 5.0: the 4.7.x look-ahead prefetch (822f9d071) and cache-only ready assembly (4e4a24a5e) bypassed the request
 * policy and are not restored. Every test below is retargeted to the native queue's observable equivalent: at most
 * PRIMITIVE_TEXTURE_UPGRADE_CONCURRENCY (4) resources work at once, every queued resource reads pending ("queued"),
 * all maps of a started resource load together, a map shared by several resources decodes once, and disposal or
 * failure releases exactly the leases a resource took. "Floors" are blocked resources that occupy workers; where a
 * 4.7.x test relied on prefetch starting work behind four blocked floors, it now uses three, so one worker is free.
 */
test("four blocked floors hold the four workers; queued decals read pending, then share one decode per map", async () => {
  const mock = browser();
  const floors = floor("floor");
  const urls = ["/scorch.png", "/crack.png", "/hazard.png", "/bullet.png"];
  const decals = urls.flatMap((url, group) =>
    Array.from({ length: [8, 4, 7, 12][group]! }, (_, index) => resource(`${group}-${index}`, { texture: asset(url) }))
  );
  const warn = vi.fn();
  const done = run([...floors, ...decals], warn);
  await vi.waitFor(() => expect(mock.starts.map(({ url }) => url).sort()).toEqual(floors.map((_, i) => `/floor-${i}.png`)));
  await turn();
  expect(mock.fetchMock).toHaveBeenCalledTimes(4);
  expect(floors.map((value) => value.textureStage)).toEqual(floors.map((_, i) => `decode /floor-${i}.png`));
  expect(decals.every((value) => value.textureStatus === "pending" && value.textureStage === "queued")).toBe(true);
  expect(decals.every((value) => texturePendingMs(value) !== undefined)).toBe(true);

  // Freed workers take the decal sets round-robin, so the four distinct decal maps start together.
  for (const started of mock.starts.filter(({ url }) => url.startsWith("/floor-"))) started.land();
  await vi.waitFor(() => expect(new Set(mock.starts.map(({ url }) => url))).toEqual(new Set([
    ...floors.map((_, i) => `/floor-${i}.png`), ...urls
  ])));
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

test.each(["fetch", "body", "decode"] as const)("a worker stalled at %s holds only its own slot; queued resources use the rest", async (phase) => {
  const releaseGates: (() => void)[] = [];
  unblockers.push(() => { for (const release of releaseGates) release(); });
  const mock = browser({
    response: (url) => {
      if (!url.startsWith("/phase-floor-")) return new Response(url);
      if (phase === "fetch") return new Promise<Response>((resolve) => { releaseGates.push(() => resolve(new Response(url))); });
      if (phase === "body") {
        // The policy transport streams the body: the stall is a body that delivered its first byte and then stops.
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        releaseGates.push(release);
        const bytes = new TextEncoder().encode(url);
        let pulls = 0;
        return new Response(new ReadableStream<Uint8Array>({
          async pull(controller) {
            if (pulls++ === 0) { controller.enqueue(bytes.slice(0, 1)); return; }
            await gate;
            controller.enqueue(bytes.slice(1));
            controller.close();
          }
        }));
      }
      return new Response(url);
    },
    hold: (url) => phase === "decode" && url.startsWith("/phase-floor-")
  });
  const floors = floor("phase-floor", 3);
  const decals = Array.from({ length: 4 }, (_, i) => resource(`decal-${i}`, { texture: asset(`/phase-decal-${i}.png`) }));
  const done = run([...floors, ...decals]);
  await vi.waitFor(() => expect(floors.map((value) => value.textureStage)).toEqual(floors.map((_, i) => `${phase} /phase-floor-${i}.png`)));
  await vi.waitFor(() => expect(decals.every((value) => value.textureStatus === "textured" && value.textureStage === "done")).toBe(true));
  expect(floors.every((value) => value.textureStatus === "pending")).toBe(true);
  for (const release of releaseGates) release();
  mock.unblock();
  await done;
  expect([...floors, ...decals].every((value) => value.textureStatus === "textured")).toBe(true);
});

test("work is capped at four workers and a queued resource disposed before its turn never fetches", async () => {
  const mock = browser();
  const firstFloors = floor("first-floor");
  const firstQueued = Array.from({ length: 20 }, (_, i) => resource(`first-${i}`, {
    texture: asset(`/first-${i}.png`), ...(i === 0 ? { normal: asset("/first-extra.png") } : {})
  }));
  const done = run([...firstFloors, ...firstQueued]);
  await vi.waitFor(() => expect(mock.starts).toHaveLength(4));
  await turn();
  expect(mock.fetchMock).toHaveBeenCalledTimes(4); // four workers, no speculative fetches
  expect(firstQueued.every((value) => value.textureStatus === "pending" && value.textureStage === "queued")).toBe(true);
  expect(firstQueued.every((_, i) => !mock.counts.has(`/first-${i}.png`))).toBe(true);
  dispose(firstQueued[0]!);
  mock.unblock();
  await done;
  expect(mock.counts.has("/first-0.png")).toBe(false);
  expect(mock.counts.has("/first-extra.png")).toBe(false);
  expect(firstQueued[0]!.textureStage).toBe("cancelled");
  expect(firstQueued.slice(1).every((value, i) => value.textureStatus === "textured" && mock.counts.get(`/first-${i + 1}.png`) === 1)).toBe(true);
  expect(mock.fetchMock).toHaveBeenCalledTimes(23);
  for (const value of resources) dispose(value);
  expect(mock.starts.every(({ image }) => image.close.mock.calls.length === 1)).toBe(true);
});

test("a started resource loads its base and extension maps together; a bad geometry check fails only its resource", async () => {
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
  const warn = vi.fn();
  const done = run([first, broken, second], warn);
  // Every map of both started resources is in flight before any decode lands.
  await vi.waitFor(() => expect(mock.starts).toHaveLength(5));
  expect(mock.fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([
    "/first-coat.png", "/first-normal.png", "/first.png", "/second-glow.png", "/second.png"
  ]);
  expect(first.textureStage?.split("; ")).toHaveLength(3);
  expect(second.textureStage?.split("; ")).toHaveLength(2);
  expect(firstUvCheck).toHaveBeenCalledTimes(1);
  expect(brokenUvCheck).toHaveBeenCalledTimes(1);
  expect(secondUvCheck).toHaveBeenCalledTimes(1);
  mock.unblock();
  await done;
  expect([first.textureStatus, broken.textureStatus, second.textureStatus]).toEqual(["textured", "fallback", "textured"]);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("bad geometry"));
  expect(mock.counts.has("/bad-check.png")).toBe(false);
  for (const value of [first, broken, second]) dispose(value);
  expect(mock.starts.every(({ image }) => image.close.mock.calls.length === 1)).toBe(true);
});

test("a resource disposed while its maps load gives every started map back and never installs", async () => {
  const victim = resource("victim", {
    texture: asset("/before-disposal.png"), normal: asset("/after-disposal.png")
  });
  const mock = browser({
    response: (url) => {
      if (url === "/dispose-trigger.png") dispose(victim);
      return new Response(url);
    }
  });
  const floors = floor("round-floor", 2);
  const trigger = resource("trigger", { texture: asset("/dispose-trigger.png") });
  const values = [...floors, victim, trigger];
  const done = run(values);
  await vi.waitFor(() => expect(mock.counts.has("/dispose-trigger.png")).toBe(true));
  // The victim's maps had no other holder, so disposal cancels their shared transports: both requests were started
  // together, both are aborted, and neither is ever decoded.
  const victimCalls = () => mock.fetchMock.mock.calls.filter(([url]) => url.endsWith("-disposal.png"));
  await vi.waitFor(() => expect(victimCalls()).toHaveLength(2));
  await vi.waitFor(() => expect(victimCalls().every(([, init]) => init?.signal?.aborted)).toBe(true));
  await turn();
  expect(mock.starts.filter(({ url }) => url.endsWith("-disposal.png"))).toHaveLength(0);
  expect(victim.texturedMaterial).toBeNull();
  expect(floors.every((value) => value.textureStatus === "pending")).toBe(true);
  for (const value of values) dispose(value);
  mock.unblock();
  await done;
  expect(mock.starts.every(({ image }) => image.close.mock.calls.length === 1)).toBe(true);
});

test("nothing scans queued invalid refs, URLs, procedural inputs, live handles, or unusable geometry ahead of a worker", async () => {
  // Native 5.0: with all four workers blocked, no queued input is touched speculatively (4.7.x look-ahead skipped
  // these inputs; native never looks ahead). Disposal before any worker frees keeps every one of them unfetched.
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
  noUv1.geometry.vertexBuffer.format.hasAttribute = (name: string) => name !== "uv1";
  const good = resource("valid", { texture: asset("/valid.png") });
  const done = run([...floors, ...invalid, noUv, noUv1, good]);
  await vi.waitFor(() => expect(mock.starts).toHaveLength(4));
  await turn();
  expect([...mock.counts.keys()].sort()).toEqual(["/blocked-0.png", "/blocked-1.png", "/blocked-2.png", "/blocked-3.png"]);
  expect(good.textureStage).toBe("queued");
  for (const value of [...floors, ...invalid, noUv, noUv1, good]) dispose(value);
  mock.unblock();
  await done;
  expect([...mock.counts.keys()].sort()).toEqual(["/blocked-0.png", "/blocked-1.png", "/blocked-2.png", "/blocked-3.png"]);
  expect(mock.starts.every(({ image }) => image.close.mock.calls.length === 1)).toBe(true);
});

test("a failed map load fails only its resource, warns once, and a later resource retries", async () => {
  const mock = browser({
    response: (url, attempt) => {
      if (url === "/failure.png" && attempt === 1) return new Response("failure", { status: 404 });
      return new Response(url);
    },
    hold: () => false
  });
  const healthy = resource("healthy", { texture: asset("/healthy.png") });
  const failure = resource("failure", { texture: asset("/failure.png") });
  const warn = vi.fn();
  await run([healthy, failure], warn);
  expect(healthy.textureStatus).toBe("textured");
  expect(mock.counts.get("/failure.png")).toBe(1);
  expect(failure.textureStatus).toBe("fallback");
  expect(failure.textureStage).toBe("failed");
  expect(warn).toHaveBeenCalledTimes(1);
  // Transport errors are redacted on the policy path (they can carry signed URLs); the resource is still named.
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('textured upgrade failed for "failure"'));
  expect(failure.textureWarnings).toEqual([warn.mock.calls[0]![0]]);

  const later = resource("later-retry", { texture: asset("/failure.png") });
  await run([later], warn);
  expect(later.textureStatus).toBe("textured");
  expect(mock.counts.get("/failure.png")).toBe(2);
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

test("disposing a ready owner immediately closes its decoded image while other workers remain blocked", async () => {
  const mock = browser();
  const floors = floor("dispose-floor", 3);
  const owner = resource("owner", { texture: asset("/disposed.png") });
  const previousDisposer = vi.fn();
  owner.textureDisposer = previousDisposer;
  const done = run([...floors, owner]);
  await vi.waitFor(() => expect(mock.starts).toHaveLength(4));
  const image = mock.starts.find(({ url }) => url === "/disposed.png")!.image;
  mock.starts.find(({ url }) => url === "/disposed.png")!.land();
  await vi.waitFor(() => expect(owner.textureStatus).toBe("textured"));
  expect(image.close).not.toHaveBeenCalled();
  dispose(owner);
  expect(image.close).toHaveBeenCalledTimes(1);
  expect(previousDisposer).toHaveBeenCalledTimes(1);
  expect(floors.every((value) => value.textureStatus === "pending")).toBe(true);
  mock.unblock();
  await done;
  expect(owner.textureStage).toBe("done");
  expect(image.close).toHaveBeenCalledTimes(1);
});

test("a queued resource joins an in-flight shared decode without a second fetch and reports its decode stage", async () => {
  const mock = browser();
  const floors = floor("transfer-floor", 3);
  const leader = resource("leader", { texture: asset("/transfer.png") });
  const queued = resource("queued", { texture: asset("/transfer.png") });
  const done = run([...floors, leader, queued]);
  await vi.waitFor(() => expect(mock.starts).toHaveLength(4));
  expect(queued.textureStage).toBe("queued");
  const inFlight = mock.starts.find(({ url }) => url === "/transfer.png")!;
  mock.starts.find(({ url }) => url === "/transfer-floor-0.png")!.land();
  await vi.waitFor(() => expect(queued.textureStage).toBe("decode /transfer.png"));
  expect(mock.counts.get("/transfer.png")).toBe(1);
  inFlight.land();
  await vi.waitFor(() => expect(queued.textureStatus).toBe("textured"));
  expect(source(queued).source).toBe(inFlight.image);
  expect(source(leader).source).toBe(inFlight.image);
  dispose(leader);
  expect(inFlight.image.close).not.toHaveBeenCalled();
  dispose(queued);
  expect(inFlight.image.close).toHaveBeenCalledTimes(1);
  expect(floors.slice(1).every((value) => value.textureStatus === "pending")).toBe(true);
  mock.unblock();
  await done;
  expect(inFlight.image.close).toHaveBeenCalledTimes(1);
});

test("a worker rejection preserves a completed ready material's image ownership", async () => {
  const mock = browser();
  const floors = floor("exception-floor", 3);
  const queued = resource("queued", { texture: asset("/queued.png") });
  const done = run([...floors, queued], () => { throw new Error("warning sink failed"); });
  await vi.waitFor(() => expect(mock.starts).toHaveLength(4));
  const ready = mock.starts.find(({ url }) => url === "/queued.png")!;
  ready.land();
  await vi.waitFor(() => expect(queued.textureStatus).toBe("textured"));
  expect(ready.image.close).not.toHaveBeenCalled();
  mock.starts.find(({ url }) => url === "/exception-floor-0.png")!.fail(new Error("decode failure"));
  // Native 5.0: the pass settles once its in-flight workers settle, so the rejection is observed after they finish.
  let rejected: unknown;
  void done.catch((error: unknown) => { rejected = error; });
  await vi.waitFor(() => expect(floors[0]!.textureStatus).toBe("fallback"));
  expect(queued.textureStatus).toBe("textured");
  expect(ready.image.close).not.toHaveBeenCalled();
  expect(queued.textureDisposer).toBeDefined();
  expect(floors.slice(1).every((value) => value.textureStatus === "pending")).toBe(true);
  for (const value of [...floors, queued]) dispose(value);
  expect(ready.image.close).toHaveBeenCalledTimes(1);
  mock.unblock();
  await vi.waitFor(() => expect(floors.slice(1).every((value) => value.textureStage === "cancelled")).toBe(true));
  await vi.waitFor(() => expect(rejected).toBeInstanceOf(Error));
  expect((rejected as Error).message).toContain("warning sink failed");
});

test("a cancelled pending decode closes on arrival and a replacement never reuses it", async () => {
  const mock = browser();
  const floors = floor("late-floor", 3);
  const owner = resource("owner", { texture: asset("/late.png") });
  const remaining = resource("remaining", { texture: asset("/late.png") });
  const warn = vi.fn();
  const done = run([...floors, owner, remaining], warn);
  await vi.waitFor(() => expect(mock.starts.filter(({ url }) => url === "/late.png")).toHaveLength(1));
  expect(remaining.textureStage).toBe("queued");
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
  // The queued sibling starts once a worker frees and joins the live replacement decode, never the cancelled one.
  mock.unblock();
  await done;
  expect(remaining.textureStatus).toBe("textured");
  expect(source(remaining).source).toBe(fresh.image);
  expect(mock.starts.filter(({ url }) => url === "/late.png")).toHaveLength(2);
  dispose(replacement);
  expect(fresh.image.closed).toBe(false);
  expect(warn).not.toHaveBeenCalled();
  dispose(remaining);
  expect(fresh.image.close).toHaveBeenCalledTimes(1);
  expect(old.image.close).toHaveBeenCalledTimes(1);
});

test("a cancelled decode can reject later without warning or an unhandled rejection", async () => {
  const mock = browser();
  const floors = floor("reject-floor", 3);
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

test("disposal re-entering from fetch still releases the not-yet-returned decode lease", async () => {
  let owner!: Resource;
  const mock = browser({
    response: (url) => {
      if (url === "/reentrant.png") dispose(owner);
      return new Response(url);
    }
  });
  const floors = floor("reentrant-floor", 3);
  owner = resource("reentrant", { texture: asset("/reentrant.png") });
  const warn = vi.fn();
  const done = run([...floors, owner], warn);
  // Native 5.0: the last holder left during fetch, so the shared transport is cancelled and never decodes.
  await vi.waitFor(() => expect(mock.fetchMock.mock.calls.find(([url]) => url === "/reentrant.png")?.[1]?.signal?.aborted).toBe(true));
  await turn();
  expect(mock.starts.filter(({ url }) => url === "/reentrant.png")).toHaveLength(0);
  expect(floors.every((value) => value.textureStatus === "pending")).toBe(true);
  mock.unblock();
  await done;
  expect(warn).not.toHaveBeenCalled();
  expect(owner.texturedMaterial).toBeNull();
});

test("disposing one owner releases only its lease when another resource shares the decode", async () => {
  const mock = browser();
  const floors = floor("shared-floor", 3);
  const owner = resource("queued-owner", { texture: asset("/shared.png") });
  const done = run([...floors, owner]);
  await vi.waitFor(() => expect(mock.starts.filter(({ url }) => url === "/shared.png")).toHaveLength(1));
  const active = resource("active", { texture: asset("/shared.png") });
  const activeDone = run([active]);
  await vi.waitFor(() => expect(active.textureStage).toBe("decode /shared.png"));
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

test("runtime-added entries join the next sweep of the same pass and read queued until a worker frees", async () => {
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
  await vi.waitFor(() => expect(mock.starts).toHaveLength(8));
  expect(laterFloors.map((value) => value.textureStage)).toEqual(laterFloors.map((_, i) => `decode /added-floor-${i}.png`));
  expect(laterDecals.every((value) => value.textureStatus === "pending" && value.textureStage === "queued")).toBe(true);
  mock.unblock();
  await done;
  expect([...first, ...laterFloors, ...laterDecals].every((value) => value.textureStatus === "textured")).toBe(true);
});

test("shared PNGs stay lazy for GPU-only users and preserve exact transparent scalar pixels", async () => {
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
  const floors = floor("pixels-floor", 3);
  const color = resource("color", { texture: asset("/transparent.png", png) });
  const done = run([...floors, color]);
  await vi.waitFor(() => expect(color.textureStage).toBe("done"));
  await turn();
  // GPU-only use never starts the CPU PNG decoder.
  expect(decode).not.toHaveBeenCalled();
  const scalar = resource("scalar", { roughnessMap: asset("/transparent.png", png), metalnessMap: asset("/transparent.png", png) });
  await run([scalar]);
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
  mock.unblock();
  await done;
});
