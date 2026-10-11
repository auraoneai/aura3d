/**
 * dev-server-proxy.test.ts — 04-BOOT + P-35 regressions in the lane dev-server
 * proxy (`tests/qr/prd04/dev-server.ts`), found by GPU run 38117582189:
 *  - every prd04 page hung at "module-load": `@aura3d/engine/lanes` was served
 *    as a bare specifier (the shared map lacks that subpath);
 *  - the studio HDRI decoded as "scanline run exceeds width 1024": the proxy
 *    UTF-8 round-tripped `text/plain` binary bodies (1.5 MB in, 4.1 MB out).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { startPrd04DevServer, type ExampleDevServer } from "../dev-server";

let server: ExampleDevServer;

beforeAll(async () => {
  server = await startPrd04DevServer();
}, 60_000);

afterAll(async () => {
  await server?.close();
});

describe("prd04 dev-server proxy", () => {
  it("04-BOOT: rewrites @aura3d/engine/lanes to the engine lanes source", async () => {
    const res = await fetch(`${server.origin}/benchmarks/quality-rebuild/aura3d/scenes/prd04/common.ts`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toMatch(/["']@aura3d\/engine\/lanes["']/);
    expect(body).toContain("/packages/engine/src/lanes/index.ts");
  }, 60_000);

  it("P-35: serves binary text/plain bodies byte-exact (studio HDRI)", async () => {
    const path = "/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr";
    const res = await fetch(`${server.origin}${path}`);
    expect(res.status).toBe(200);
    const served = new Uint8Array(await res.arrayBuffer());
    const file = readFileSync(resolve(`.${path}`));
    expect(served.length).toBe(file.length);
    expect(Buffer.compare(Buffer.from(served), file)).toBe(0);
  }, 60_000);
});
