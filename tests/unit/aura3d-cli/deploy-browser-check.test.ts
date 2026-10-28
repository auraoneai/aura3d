import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  evaluateRouteReport,
  loadChromium,
  runBrowserDeployCheck,
  startStaticServer,
  type BrowserDriver,
  type BrowserRouteReport
} from "../../../packages/aura3d-cli/src/deploy-browser-check";

function makeDist(files: Record<string, string>): string {
  const dist = join(mkdtempSync(join(tmpdir(), "aura3d-browser-check-")), "dist");
  for (const [name, body] of Object.entries(files)) {
    const path = join(dist, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, body);
  }
  return dist;
}

const clean = (route: string): BrowserRouteReport => ({ route, status: 200, consoleErrors: [], consoleWarnings: [], pageErrors: [], failedRequests: [], badResponses: [] });

function fakeDriver(reports: Record<string, Partial<BrowserRouteReport>>): BrowserDriver & { visited: string[]; closed: boolean } {
  const driver = {
    visited: [] as string[],
    closed: false,
    async visit(url: string, route: string) {
      driver.visited.push(url);
      return { ...clean(route), ...(reports[route] ?? {}) };
    },
    async close() {
      driver.closed = true;
    }
  };
  return driver;
}

describe("check-deploy --browser", () => {
  test("static server behaves like a plain static host", async () => {
    const dist = makeDist({ "index.html": "<h1>home</h1>", "about/index.html": "<h1>about</h1>", "pricing.html": "<h1>pricing</h1>", "app.js": "console.log(1)" });
    const { server, origin } = await startStaticServer(dist);
    try {
      const get = async (path: string) => {
        const response = await fetch(`${origin}${path}`);
        return { status: response.status, type: response.headers.get("content-type"), body: await response.text() };
      };
      expect((await get("/")).body).toBe("<h1>home</h1>");
      expect((await get("/about/")).body).toBe("<h1>about</h1>");
      expect((await get("/pricing")).body).toBe("<h1>pricing</h1>");
      expect((await get("/app.js")).type).toBe("text/javascript");
      // No SPA fallback: a missing file is a real 404, which is what a static host would return.
      expect((await get("/missing.glb")).status).toBe(404);
      // Paths cannot climb out of dist.
      expect((await get("/..%2f..%2fetc/passwd")).status).toBe(404);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  });

  test("a clean route passes", () => {
    expect(evaluateRouteReport(clean("/"))).toEqual({ failures: [], warnings: [] });
  });

  test("HTTP errors, failed requests, uncaught errors and console errors each fail the route", () => {
    const verdict = evaluateRouteReport({
      ...clean("/game/"),
      badResponses: ["404 /aura-assets/robot.12345678.glb"],
      failedRequests: ["/hdri/studio.hdr (net::ERR_ABORTED)"],
      pageErrors: ["TypeError: x is not a function"],
      consoleErrors: ["Failed to load resource: the server responded with a status of 404 (Not Found)", "[aura3d] shader compile failed"]
    });
    expect(verdict.failures).toEqual([
      "Route /game/ request failed with HTTP 404 /aura-assets/robot.12345678.glb.",
      "Route /game/ request did not complete: /hdri/studio.hdr (net::ERR_ABORTED).",
      "Route /game/ threw an uncaught error: TypeError: x is not a function",
      // The browser's own "Failed to load resource" echo is not counted twice.
      "Route /game/ logged a console error: [aura3d] shader compile failed"
    ]);
  });

  test("a missing favicon and console warnings are reported but do not fail", () => {
    const verdict = evaluateRouteReport({ ...clean("/"), badResponses: ["404 /favicon.ico"], consoleWarnings: ["deprecated thing"] });
    expect(verdict.failures).toEqual([]);
    expect(verdict.warnings).toEqual(["Route / request failed with HTTP 404 /favicon.ico.", "Route / logged a console warning: deprecated thing"]);
  });

  test("an app boot error and a non-200 route fail", () => {
    expect(evaluateRouteReport({ ...clean("/"), appError: "ASSET_HASH_MISMATCH" }).failures).toEqual([
      "Route / reported an app boot error (data-aura3d-error): ASSET_HASH_MISMATCH"
    ]);
    expect(evaluateRouteReport({ ...clean("/x"), status: 500 }).failures).toEqual(["Route /x answered 500."]);
    expect(evaluateRouteReport({ ...clean("/x"), status: null }).failures).toEqual(["Route /x answered no response."]);
  });

  test("runBrowserDeployCheck opens every route from the local server and aggregates results", async () => {
    const dist = makeDist({ "index.html": "<h1>home</h1>", "play/index.html": "<h1>play</h1>" });
    const driver = fakeDriver({ "/play/": { consoleErrors: ["boom"] } });
    const result = await runBrowserDeployCheck({ distDir: dist, routes: ["/", "play/"], driver });
    expect(driver.visited).toHaveLength(2);
    expect(driver.visited[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(driver.visited[1]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/play\/$/);
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(["Route /play/ logged a console error: boom"]);
    expect(result.routes).toHaveLength(2);
    expect(driver.closed).toBe(true);
  });

  test("defaults to the root route and passes when the page is clean", async () => {
    const dist = makeDist({ "index.html": "<h1>home</h1>" });
    const driver = fakeDriver({});
    const result = await runBrowserDeployCheck({ distDir: dist, driver });
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(driver.visited).toHaveLength(1);
  });

  test("a driver that cannot open a route is a failure, not a crash", async () => {
    const dist = makeDist({ "index.html": "x" });
    const driver: BrowserDriver = { async visit() { throw new Error("net::ERR_CONNECTION_REFUSED\nstack"); }, async close() {} };
    const result = await runBrowserDeployCheck({ distDir: dist, driver });
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(["Route / could not be opened: net::ERR_CONNECTION_REFUSED"]);
  });

  test("a dist folder without index.html fails with a build hint", async () => {
    const dist = makeDist({ "other.txt": "x" });
    const result = await runBrowserDeployCheck({ distDir: dist, driver: fakeDriver({}) });
    expect(result.ok).toBe(false);
    expect(result.failures[0]).toContain("no index.html");
  });

  test("a project without Playwright gets an instruction, not a stack trace", () => {
    const project = mkdtempSync(join(tmpdir(), "aura3d-no-playwright-"));
    // A module name that cannot exist keeps this independent of any Playwright installed on the machine running the test.
    expect(() => loadChromium(project, ["aura3d-test-no-such-playwright"])).toThrow(/npm i -D playwright/);
  });
});
