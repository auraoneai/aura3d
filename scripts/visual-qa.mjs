#!/usr/bin/env node
/**
 * Visual-QA harness for the aura3d marketing surface (fleet standard, adapted
 * from the Pounce-authored canonical harness replicated across sibling repos).
 *
 * What it does
 *   1. Serves the PRODUCTION build:
 *        a. If a static export dir exists (default `out/`, override with
 *           `--static-dir marketing/dist` for this repo's Vite build), it is
 *           served by a tiny built-in node:http static server (no new deps).
 *        b. Else, if `--command` is passed (e.g.
 *           `--command "pnpm --dir marketing preview --port 3180"`), the
 *           command is spawned with PORT=<--port> and the script waits for an
 *           OK response on `/` before shooting.
 *   2. Identity gate: before any screenshot, fetches the routes file's
 *      `identity.path` (default `/`) and asserts the `identity.marker`
 *      substring is present in the HTML. A port collision that parked another
 *      app on the port fails loudly here instead of shooting the wrong site.
 *   3. Loads the routes manifest (`scripts/visual-qa.routes.json` unless
 *      `--routes` is given) and captures a full-page PNG per shot x width
 *      with playwright chromium headless at deviceScaleFactor 2 (390px
 *      viewports produce 780px-wide crisp PNGs).
 *   4. Walks each page in stepped ~0.8-viewport scroll increments before the
 *      full-page capture so scroll/IntersectionObserver reveals and lazy
 *      posters fire along the way.
 *   5. Writes `artifacts/visual-qa/<name>-<width>.png` plus a `manifest.json`
 *      recording routes, widths, HTTP status, redirect behavior, byte sizes,
 *      and the identity check.
 *   6. Exits non-zero if any route answers >= 400, any screenshot is < 5 KB
 *      (blank-page guard), or the identity gate fails.
 *
 * Rules of engagement
 *   - Browsers are installed ONLY by the remote runner (`npx playwright
 *     install --with-deps chromium`). Never install or run browsers locally;
 *     this script is syntax-checked locally with `node --check`.
 *   - Authenticated routes are NOT faked: mark them `"skipIfRedirect": true`.
 *
 * Usage
 *   node scripts/visual-qa.mjs [--routes <file>] [--port <n>] [--command <cmd>]
 *                              [--static-dir <dir>] [--out <dir>] [--timeout <ms>] [--help]
 *
 * Exit codes: 0 = all shots pass gates, 1 = visual-QA failure, 2 = usage/config error.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const DEFAULT_ROUTES_FILE = path.join(REPO_ROOT, 'scripts', 'visual-qa.routes.json');
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'artifacts', 'visual-qa');
const DEFAULT_STATIC_DIR = path.join(REPO_ROOT, 'out');
const MIN_PNG_BYTES = 5 * 1024; // blank-page guard: < 5 KB means nothing rendered
const DEFAULT_PORT = 3180;

const USAGE = `Usage: node scripts/visual-qa.mjs [options]

Options:
  --routes <file>     Routes manifest (default: scripts/visual-qa.routes.json)
  --port <n>          Port to serve on / probe (default: ${DEFAULT_PORT}; overrides
                      the port inside the routes file's baseUrl)
  --command <cmd>     Optional serve command for a non-static build, e.g.
                      --command "pnpm --dir marketing preview --port 3180".
                      Spawned with PORT=<port>.
  --static-dir <dir>  Static export directory to serve (default: out/; this
                      repo's production build lives in marketing/dist)
  --out <dir>         Artifact directory (default: artifacts/visual-qa)
  --timeout <ms>      Per-shot navigation + server-ready timeout (default: 90000)
  --help              Print this usage and exit (never launches a browser)

Examples:
  aura3d marketing scope (static dist):
    node scripts/visual-qa.mjs --static-dir marketing/dist
  aura3d via vite preview instead:
    node scripts/visual-qa.mjs --command "pnpm --dir marketing preview --port 3180"

Gates (exit 1): identity marker missing on /, any route answering >= 400, or any
screenshot < ${MIN_PNG_BYTES} bytes.
`;

// ---------------------------------------------------------------------------
// Argument parsing (no deps)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    routes: DEFAULT_ROUTES_FILE,
    out: DEFAULT_OUT_DIR,
    port: null,
    command: null,
    staticDir: null,
    timeout: 90_000,
    help: false
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) failUsage(`missing value for ${flag}`);
      return argv[++i];
    };
    switch (flag) {
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--routes':
        args.routes = path.resolve(next());
        break;
      case '--port':
        args.port = Number.parseInt(next(), 10);
        if (!Number.isInteger(args.port) || args.port <= 0 || args.port > 65535) {
          failUsage(`invalid port: ${args.port}`);
        }
        break;
      case '--command':
        args.command = next();
        break;
      case '--static-dir':
        args.staticDir = path.resolve(REPO_ROOT, next());
        break;
      case '--out':
        args.out = path.resolve(next());
        break;
      case '--timeout':
        args.timeout = Number.parseInt(next(), 10);
        if (!Number.isInteger(args.timeout) || args.timeout < 1000)
          failUsage(`invalid timeout: ${args.timeout}`);
        break;
      default:
        failUsage(`unknown flag: ${flag}`);
    }
  }
  return args;
}

function failUsage(message) {
  console.error(`visual-qa: ${message}\n\n${USAGE}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Routes manifest
// ---------------------------------------------------------------------------

function loadRoutes(routesFile) {
  if (!fs.existsSync(routesFile)) {
    console.error(`visual-qa: routes file not found: ${routesFile}`);
    console.error(
      'visual-qa: pass --routes <file> or create it (schema documented inside the file).'
    );
    process.exit(2);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(routesFile, 'utf8'));
  } catch (error) {
    console.error(`visual-qa: routes file is not valid JSON (${routesFile}): ${error.message}`);
    process.exit(2);
  }
  const { baseUrl, widths, shots } = parsed;
  if (typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl)) {
    console.error(
      `visual-qa: routes file must set baseUrl (e.g. "http://127.0.0.1:${DEFAULT_PORT}")`
    );
    process.exit(2);
  }
  if (
    !Array.isArray(widths) ||
    widths.length === 0 ||
    widths.some((w) => !Number.isInteger(w) || w <= 0)
  ) {
    console.error(
      'visual-qa: routes file must set widths as a non-empty array of integers (e.g. [1440, 390])'
    );
    process.exit(2);
  }
  if (!Array.isArray(shots) || shots.length === 0) {
    console.error(
      'visual-qa: routes file must set shots as a non-empty array of { name, path[, skipIfRedirect] }'
    );
    process.exit(2);
  }
  for (const shot of shots) {
    if (typeof shot.name !== 'string' || !/^[a-z0-9-]+$/.test(shot.name)) {
      console.error(
        `visual-qa: shot name must be kebab-case (lowercase/digits/dashes), got: ${JSON.stringify(shot.name)}`
      );
      process.exit(2);
    }
    if (typeof shot.path !== 'string' || !shot.path.startsWith('/')) {
      console.error(`visual-qa: shot "${shot.name}" needs a path starting with "/"`);
      process.exit(2);
    }
  }
  if (parsed.identity !== undefined) {
    const { path: identityPath, marker } = parsed.identity;
    if (typeof identityPath !== 'string' || !identityPath.startsWith('/')) {
      console.error('visual-qa: identity.path must start with "/"');
      process.exit(2);
    }
    if (typeof marker !== 'string' || marker.length < 8) {
      console.error(
        'visual-qa: identity.marker must be a distinctive substring (>= 8 chars) unique to this repo'
      );
      process.exit(2);
    }
  }
  return parsed;
}

/** Apply the --port override to the routes file's baseUrl; returns the origin. */
function resolveBaseUrl(routesBaseUrl, port) {
  const url = new URL(routesBaseUrl);
  if (port !== null) url.port = String(port);
  return url.origin;
}

// ---------------------------------------------------------------------------
// Built-in static server for static exports — ~30 lines, no new deps
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function startStaticServer(root, port) {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    // Path-traversal guard: the resolved file must stay inside the root.
    const candidates = [pathname, `${pathname}.html`, `${pathname}/index.html`, '/index.html'];
    const file = candidates
      .map((c) => path.resolve(root, `.${c}`))
      .find((f) => f.startsWith(root) && fs.existsSync(f) && fs.statSync(f).isFile());
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end(`visual-qa static server: not found: ${pathname}`);
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store'
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

// ---------------------------------------------------------------------------
// Serving the production build
// ---------------------------------------------------------------------------

/** Spawn a serve command (e.g. "pnpm --dir marketing preview") with PORT set. */
function spawnServeCommand(command, port) {
  const child = spawn(command, {
    shell: true,
    detached: true, // own process group so we can kill pnpm AND vite beneath it
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let outputTail = '';
  const record = (chunk) => {
    outputTail = (outputTail + chunk.toString()).slice(-2000);
    process.stderr.write(`[serve] ${chunk}`);
  };
  child.stdout.on('data', record);
  child.stderr.on('data', record);
  const exited = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal, outputTail }))
  );
  child.__exited = exited;
  return child;
}

function killProcessGroup(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGTERM'); // negative pid = the whole detached group
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

/** Poll the origin until `/` answers a non-error status (or throw on timeout). */
async function waitForServer(origin, timeoutMs, describe) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(4000)
      });
      if (response.status < 400) return;
      lastError = `/ answered ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await sleep(400);
  }
  throw new Error(`server at ${origin} never became ready (${describe}; last: ${lastError})`);
}

/**
 * Identity gate: fetch the identity path and assert the repo-unique marker.
 * A port collision that served a different app fails here, loudly, before
 * any screenshot is taken.
 */
async function assertIdentity(origin, identity) {
  const target = identity ? `${origin}${identity.path}` : `${origin}/`;
  const marker = identity?.marker ?? null;
  let body = '';
  let status = 0;
  try {
    const response = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    status = response.status;
    body = await response.text();
  } catch (error) {
    throw new Error(`identity gate: could not fetch ${target}: ${error.message}`);
  }
  if (status >= 400) {
    throw new Error(`identity gate: ${target} answered HTTP ${status} — wrong app or broken build?`);
  }
  if (marker !== null && !body.includes(marker)) {
    throw new Error(
      `identity gate FAILED: ${target} does not contain the marker for this repo.\n` +
        `  expected marker: ${JSON.stringify(marker)}\n` +
        `  A port collision (another app on this port) or a wrong --static-dir is the usual cause.\n` +
        `  First 200 bytes served: ${JSON.stringify(body.slice(0, 200))}`
    );
  }
  return { target, marker, ok: true };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Redirect probe (node fetch, no browser) — records the raw status + Location
// ---------------------------------------------------------------------------

async function probe(url) {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
    return { status: response.status, location: response.headers.get('location') };
  } catch (error) {
    return { status: 0, location: null, error: error.message };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  const routes = loadRoutes(args.routes);
  const origin = resolveBaseUrl(routes.baseUrl, args.port);
  const port = args.port ?? (Number.parseInt(new URL(routes.baseUrl).port, 10) || DEFAULT_PORT);
  const outDir = args.out;
  const widths = routes.widths;
  const staticDir = args.staticDir ?? DEFAULT_STATIC_DIR;

  // --- Decide how to serve ------------------------------------------------
  let staticServer = null;
  let serveChild = null;
  let serveDescription;

  if (args.command) {
    serveChild = spawnServeCommand(args.command, port);
    serveChild.__exited.then(({ code, signal, outputTail }) => {
      console.error(
        `visual-qa: serve command exited early (code=${code} signal=${signal})\n${outputTail}`
      );
    });
    serveDescription = `spawned: ${args.command} (PORT=${port})`;
  } else if (fs.existsSync(staticDir)) {
    staticServer = await startStaticServer(staticDir, port);
    serveDescription = `static server on ${staticDir}`;
  } else {
    console.error(
      `visual-qa: no static export at ${staticDir} and no --command given.\n` +
        `visual-qa: build first (pnpm build && pnpm --dir marketing build) or pass\n` +
        `visual-qa:   --static-dir marketing/dist\n` +
        `visual-qa: or use a server:  --command "pnpm --dir marketing preview --port ${port}"\n` +
        USAGE
    );
    return 2;
  }

  // --- Wait for readiness, verify identity, then shoot ---------------------
  const failures = [];
  const results = [];
  let browser = null;
  let identityResult = null;

  try {
    process.stdout.write(`visual-qa: waiting for ${origin}/ (${serveDescription})...\n`);
    await waitForServer(origin, args.timeout, serveDescription);

    try {
      identityResult = await assertIdentity(origin, routes.identity);
      process.stdout.write(
        `visual-qa: identity gate passed on ${identityResult.target} (marker: ${JSON.stringify(identityResult.marker)})\n`
      );
    } catch (error) {
      // Fail closed: never screenshot a server that is not provably this app.
      console.error(`visual-qa: ${error.message}`);
      const manifest = {
        tool: 'visual-qa',
        generatedAt: new Date().toISOString(),
        baseUrl: origin,
        servedBy: serveDescription,
        staticDir: path.relative(REPO_ROOT, staticDir),
        identity: {
          path: routes.identity?.path ?? '/',
          marker: routes.identity?.marker ?? null,
          passed: false,
          error: error.message.split('\n')[0]
        },
        widths,
        minPngBytes: MIN_PNG_BYTES,
        deviceScaleFactor: 2,
        summary: { shots: 0, passed: 0, skipped: 0, failed: 1 },
        results: [],
        failures: [`identity gate: ${error.message.split('\n')[0]}`]
      };
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, 'manifest.json'),
        `${JSON.stringify(manifest, null, 2)}\n`
      );
      if (staticServer) staticServer.close();
      killProcessGroup(serveChild);
      return 1;
    }

    process.stdout.write(
      `visual-qa: capturing ${routes.shots.length} shot(s) x ${widths.length} width(s)\n`
    );

    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });

    // Playwright is imported lazily so --help / config errors never touch it,
    // and so local machines without browsers installed stay unaffected.
    let chromium;
    try {
      ({ chromium } = await import('playwright'));
    } catch {
      console.error(
        'visual-qa: playwright is not installed. It is a devDependency; browsers are\n' +
          'visual-qa: installed by the remote runner via `npx playwright install --with-deps chromium` —\n' +
          'visual-qa: never install or run browsers locally.'
      );
      return 1;
    }
    browser = await chromium.launch(); // headless chromium, installed by the runner

    for (const width of widths) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        deviceScaleFactor: 2 // crisp text; 390px viewports yield 780px PNGs
      });
      const page = await context.newPage();

      for (const shot of routes.shots) {
        const requestedUrl = `${origin}${shot.path}`;
        // WebGL game routes wedge the shared GPU (SwiftShader) process, which
        // stalls the whole browser. They run in a dedicated, throwaway browser
        // per shot (domcontentloaded — game asset streams never hit `load`).
        if (shot.noScroll === true) {
          let isoBrowser = null;
          try {
            ({ chromium } = await import('playwright'));
            isoBrowser = await chromium.launch({ timeout: 30_000 });
            const isoContext = await isoBrowser.newContext({
              viewport: { width, height: 1000 },
              deviceScaleFactor: 2
            });
            const isoPage = await isoContext.newPage();
            const initial = await probe(requestedUrl);
            const resp = await isoPage
              .goto(requestedUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
              .catch(() => null);
            await sleep(2500);
            const file = path.join(outDir, `${shot.name}-${width}.png`);
            await isoPage.screenshot({ path: file, fullPage: true, timeout: width >= 1200 ? 240_000 : 60_000 });
            const bytes = fs.statSync(file).size;
            const okShot = initial.status < 400 && bytes >= MIN_PNG_BYTES;
            if (okShot) {
              process.stdout.write(`visual-qa: OK    ${shot.name} @${width} — iso ${bytes} B
`);
            } else {
              failures.push(`${shot.name} @${width}: iso capture failed (HTTP ${initial.status}, ${bytes} B)`);
              process.stdout.write(`visual-qa: FAIL  ${shot.name} @${width} — iso HTTP ${initial.status} ${bytes} B
`);
            }
            results.push({ name: shot.name, path: shot.path, requestedUrl, finalUrl: isoPage.url(),
              skipIfRedirect: false, redirected: false, skipped: false, status: initial.status,
              finalStatus: resp?.status ?? null, width, file: path.relative(REPO_ROOT, file), bytes,
              ok: okShot, isolated: true });
          } catch (error) {
            failures.push(`${shot.name} @${width}: isolated capture error: ${error.message}`);
            process.stdout.write(`visual-qa: FAIL  ${shot.name} @${width} — ${error.message}\n`);
          } finally {
            if (isoBrowser) await isoBrowser.close().catch(() => {});
          }
          continue;
        }
        const result = {
          name: shot.name,
          path: shot.path,
          requestedUrl,
          finalUrl: null,
          skipIfRedirect: shot.skipIfRedirect === true,
          redirected: false,
          skipped: false,
          status: null, // raw first response (pre-redirect)
          finalStatus: null,
          width,
          file: null,
          bytes: null,
          ok: false
        };
        results.push(result);

        const initial = await probe(requestedUrl);
        result.status = initial.status;
        result.redirected = initial.status >= 300 && initial.status < 400;
        if (result.redirected && result.skipIfRedirect) result.skipped = true;

        try {
          const response = await page.goto(requestedUrl, {
            waitUntil: 'load',
            timeout: args.timeout
          });
          await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
          // Stepped scroll sweep: walking the page in ~0.8-viewport steps fires
          // scroll/IntersectionObserver reveals along the way (lazy iframes and
          // posters on this site), so full-page captures include below-fold
          // sections. window/document exist in the page context evaluated
          // below; the script runs in Node where eslint flags them.
          /* eslint-disable no-undef */
          // WebGL showcase/game routes block the JS loop under software
          // rendering — the scroll walk can hang there for good. Shots may
          // opt out with "noScroll": true; every walk is also time-bounded.
          if (shot.noScroll === true) {
            await sleep(1500);
          } else {
            await Promise.race([
              page.evaluate(async () => {
                const step = Math.max(400, Math.round(window.innerHeight * 0.8));
                for (let y = 0; y < document.body.scrollHeight; y += step) {
                  window.scrollTo(0, y);
                  await new Promise((resolve) => setTimeout(resolve, 120));
                }
                window.scrollTo(0, document.body.scrollHeight);
                await new Promise((resolve) => setTimeout(resolve, 400));
                window.scrollTo(0, 0);
              }),
              new Promise((resolve) => setTimeout(resolve, 20_000))
            ]).catch(() => {});
          }
          /* eslint-enable no-undef */
          await sleep(250);

          result.finalStatus = response?.status ?? null;
          result.finalUrl = page.url();
          const file = path.join(outDir, `${shot.name}-${width}.png`);
          await page.screenshot({ path: file, fullPage: true, timeout: args.timeout });
          result.file = path.relative(REPO_ROOT, file);
          result.bytes = fs.statSync(file).size;

          if (result.skipped) {
            // Redirected + skipIfRedirect: record where the route sent us.
            process.stdout.write(
              `visual-qa: SKIP  ${shot.name} @${width} — ${initial.status} -> ${result.finalUrl} (redirect honored, screenshot of landing page kept)\n`
            );
            result.ok = true;
          } else if (
            initial.status >= 400 ||
            (result.finalStatus !== null && result.finalStatus >= 400)
          ) {
            failures.push(
              `${shot.name} @${width}: HTTP ${initial.status}${result.finalStatus !== initial.status ? ` -> ${result.finalStatus}` : ''} on ${shot.path}`
            );
            process.stdout.write(
              `visual-qa: FAIL  ${shot.name} @${width} — HTTP ${initial.status} -> ${result.finalStatus}\n`
            );
          } else if (result.bytes < MIN_PNG_BYTES) {
            failures.push(
              `${shot.name} @${width}: screenshot only ${result.bytes} bytes (< ${MIN_PNG_BYTES} — blank page?)`
            );
            process.stdout.write(
              `visual-qa: FAIL  ${shot.name} @${width} — ${result.bytes} bytes (blank-page guard)\n`
            );
          } else {
            result.ok = true;
            process.stdout.write(
              `visual-qa: OK    ${shot.name} @${width} — ${result.finalStatus} ${result.bytes} B${result.redirected ? ` (redirected -> ${result.finalUrl})` : ''}\n`
            );
          }
        } catch (error) {
          failures.push(`${shot.name} @${width}: navigation failed: ${error.message}`);
          process.stdout.write(`visual-qa: FAIL  ${shot.name} @${width} — ${error.message}\n`);
        }
      }
      await context.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (staticServer) staticServer.close();
    killProcessGroup(serveChild);
  }

  // --- Manifest -------------------------------------------------------------
  const manifest = {
    tool: 'visual-qa',
    generatedAt: new Date().toISOString(),
    baseUrl: origin,
    servedBy: serveDescription,
    staticDir: path.relative(REPO_ROOT, staticDir),
    identity: identityResult
      ? { path: identityResult.target, marker: identityResult.marker, passed: true }
      : { path: routes.identity?.path ?? '/', marker: routes.identity?.marker ?? null, passed: false },
    widths,
    minPngBytes: MIN_PNG_BYTES,
    deviceScaleFactor: 2,
    summary: {
      shots: results.length,
      passed: results.filter((r) => r.ok).length,
      skipped: results.filter((r) => r.skipped).length,
      failed: failures.length
    },
    results,
    failures
  };
  fs.mkdirSync(outDir, { recursive: true });
  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  process.stdout.write(
    `\nvisual-qa: ${manifest.summary.passed} passed, ${manifest.summary.skipped} skipped (redirect), ${failures.length} failed\n` +
      `visual-qa: manifest + PNGs written to ${path.relative(REPO_ROOT, outDir)}\n`
  );
  return failures.length === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`visual-qa: ${error.stack ?? error.message}`);
    process.exit(1);
  });
