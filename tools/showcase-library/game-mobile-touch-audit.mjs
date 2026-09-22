#!/usr/bin/env node
/*
 * Mobile touch-control audit (§25).
 *
 * A route may list "touch buttons" in its published controls and still be
 * unplayable on a phone: the buttons can sit below the scroll fold of a side
 * panel, be pushed off a short viewport, or be clipped by an `overflow:hidden`
 * ancestor. Rendering them is not the bar - reaching them with a thumb while
 * the game is live is.
 *
 * For every game route at a phone viewport this reports, per button:
 *   on-screen        taps without scrolling
 *   scroll-only      needs the panel scrolled first (unplayable mid-action)
 *   off-viewport     outside the visual viewport
 *   clipped          inside an `overflow:hidden` ancestor that hides it
 *   hidden           display:none / zero area
 * and then taps every on-screen button to prove the tap does not fault.
 *
 * Usage: pnpm game:mobile-audit [--only <id>] [--base <url>] [--out <dir>]
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = resolve(fileURLToPath(import.meta.url), "../..", "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const baseUrl = arg("--base", "http://localhost:5199");
const outDir = resolve(repoRoot, arg("--out", "tests/reports/game-mobile-audit"));
const only = arg("--only", "");
const vw = Number(arg("--width", 390));
const vh = Number(arg("--height", 844));

const routesJson = JSON.parse(
  readFileSync(resolve(repoRoot, "tools/showcase-library/route-gates.json"), "utf8"),
);
/*
 * The playbook is the authoritative "is this a game" list, shared with the play
 * probe. route-gates.json also carries internal tooling routes
 * (`showcase-index`, `showcase-product-configurator`, the asset inspector) that
 * have no touch controls to audit; sweeping them as if they were games turns
 * the report into noise and makes a real §25 violation easy to skim past.
 */
const playbook = JSON.parse(
  readFileSync(resolve(repoRoot, "tools/showcase-library/game-play-playbook.json"), "utf8"),
);
const gameIds = new Set(Object.keys(playbook).filter((k) => !k.startsWith("$")));
const EXTRA_ROUTES = [
  { id: "aura-clash-showcase", label: "Aura Clash Arena", path: "/apps/aura-clash-showcase/" },
];
const routes = [...EXTRA_ROUTES, ...routesJson.routes]
  .filter((r) => gameIds.has(r.id))
  .filter((r) => {
    if (!only) return true;
    // Comma-separated so a handful of routes can be re-checked after an edit
    // without paying for the full sweep.
    const needles = only.split(",").map((s) => s.trim()).filter(Boolean);
    return needles.some((n) => r.id === n || r.id.includes(n));
  })
  .map((r) => ({ id: r.id, label: r.label ?? r.id, route: r.path }));

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();

const collect = () => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  /*
   * §25 is about *claimed* touch support: "where touch controls are claimed,
   * test them." A route that publishes no touch claim is not violating it by
   * being desktop-first, so flagging one turns this gate into the boy who cried
   * wolf and the real violations get skimmed past. Claims are read from the
   * route's own published evidence plus any control region explicitly labelled
   * for touch, rather than guessed from how many buttons happen to exist.
   */
  const evidenceBlobs = Object.entries(globalThis)
    .filter(([key]) => /_EVIDENCE__$/.test(key))
    .flatMap(([, value]) => {
      if (!value || typeof value !== "object") return [];
      const controls = Array.isArray(value.controls) ? value.controls.map(String) : [];
      const flags = value.touch === true ? ["touch:true"] : [];
      return [...controls, ...flags];
    });
  const labelledTouch = [...document.querySelectorAll("[aria-label]")]
    .map((el) => el.getAttribute("aria-label") ?? "")
    .filter((label) => /touch/i.test(label));
  const touchClaimSources = [...new Set([
    ...evidenceBlobs.filter((s) => /touch/i.test(s)),
    ...labelledTouch.map((label) => `aria-label:"${label}"`),
  ])].slice(0, 6);
  return {
    vw,
    vh,
    docScrollable:
      document.documentElement.scrollHeight > vh + 1 || document.documentElement.scrollWidth > vw + 1,
    claimsTouch: touchClaimSources.length > 0,
    touchClaimSources,
    controls: [...document.querySelectorAll("button, [role=button], [data-touch], input[type=button]")].map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const label = (
        el.getAttribute("aria-label") ||
        el.textContent ||
        el.id ||
        el.getAttribute("data-testid") ||
        "?"
      ).trim().slice(0, 28);
      let klass = "on-screen";
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") {
        klass = "hidden";
      } else if (r.width < 1 || r.height < 1) {
        klass = "hidden";
      } else {
        // The ancestor walk runs first: a button parked below the fold is often
        // inside a scrollable panel, and "needs scrolling" is a different (and
        // milder) defect than "no scroll can ever reveal it". Checking the
        // viewport rect before the ancestors collapses both into off-viewport.
        let ancestorVerdict = null;
        for (let p = el.parentElement; p; p = p.parentElement) {
          const pcs = getComputedStyle(p);
          const pr = p.getBoundingClientRect();
          const pastAncestor = r.bottom > pr.bottom + 1 || r.right > pr.right + 1;
          if (!pastAncestor) continue;
          if (/auto|scroll/.test(pcs.overflowY) && p.scrollHeight > p.clientHeight + 1) {
            ancestorVerdict = "scroll-only";
            break;
          }
          if (/hidden|clip/.test(pcs.overflow)) {
            ancestorVerdict = "clipped";
            break;
          }
        }
        if (ancestorVerdict) {
          klass = ancestorVerdict;
        } else if (r.bottom > vh + 1 || r.top < -1 || r.right > vw + 1 || r.left < -1) {
          klass = "off-viewport";
        }
      }
      return {
        label,
        id: el.id || null,
        klass,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        tapTargetOk: r.width >= 44 && r.height >= 44,
      };
    }),
  };
};

const all = [];
for (const route of routes) {
  const ctx = await browser.newContext({
    viewport: { width: vw, height: vh },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e?.message ?? e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  const entry = { id: route.id, label: route.label, route: route.route };
  try {
    await page.goto(baseUrl + route.route, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("canvas", { timeout: 45_000 }).catch(() => undefined);
    await page.waitForTimeout(2200);
    const snap = await page.evaluate(collect);
    entry.viewport = { vw: snap.vw, vh: snap.vh };
    entry.docScrollable = snap.docScrollable;
    entry.controls = snap.controls;
    entry.tally = snap.controls.reduce((a, c) => ((a[c.klass] = (a[c.klass] ?? 0) + 1), a), {});
    entry.smallTargets = snap.controls.filter((c) => c.klass === "on-screen" && !c.tapTargetOk).map((c) => c.id ?? c.label);

    // Prove on-screen controls actually respond, not merely render.
    const taps = [];
    for (const c of snap.controls.filter((k) => k.klass === "on-screen").slice(0, 14)) {
      const before = await page.evaluate(() => (document.body?.innerText ?? "").slice(0, 4000));
      const ok = await page.touchscreen
        .tap(c.rect.x + c.rect.w / 2, c.rect.y + c.rect.h / 2)
        .then(() => true)
        .catch((e) => String(e?.message ?? e).slice(0, 90));
      await page.waitForTimeout(320);
      const after = await page.evaluate(() => (document.body?.innerText ?? "").slice(0, 4000));
      taps.push({ id: c.id, tapped: ok === true, hudChanged: before !== after });
    }
    entry.taps = taps;
    entry.tapsFaulted = taps.filter((t) => t.tapped !== true).length;
    entry.reachableOnScreen = (entry.tally["on-screen"] ?? 0);
    entry.claimsTouch = snap.claimsTouch;
    entry.touchClaimSources = snap.touchClaimSources;
    const geometryViolations = snap.claimsTouch
      ? [
          ...(entry.tally["scroll-only"] ? ["touch-controls-below-scroll-fold"] : []),
          ...(entry.tally["off-viewport"] ? ["touch-controls-off-viewport"] : []),
          ...(entry.tally.clipped ? ["touch-controls-clipped-by-overflow"] : []),
          ...(entry.smallTargets.length ? ["touch-targets-under-44px"] : []),
        ]
      : [];
    entry.violations = [
      ...geometryViolations,
      ...(snap.claimsTouch && entry.docScrollable ? ["page-scrolls-in-phone-viewport"] : []),
      ...(entry.tapsFaulted ? ["touch-tap-faulted"] : []),
      ...(errors.length ? ["errors"] : []),
    ];
    const shotPath = resolve(outDir, `${route.id}.png`);
    await page
      .screenshot({ path: shotPath, fullPage: false, animations: "disabled", timeout: 20_000 })
      .then(() => { entry.screenshot = `${route.id}.png`; })
      // Playwright waits for the page to look stable before it captures, which
      // a route driving WebGL from requestAnimationFrame never grants. Falling
      // back to a direct compositor capture keeps the frame a human is supposed
      // to inspect, and records which path produced it.
      .catch(async (e) => {
        entry.screenshotError = String(e?.message ?? e).split("\n")[0].slice(0, 120);
        try {
          const cdp = await ctx.newCDPSession(page);
          const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
          writeFileSync(shotPath, Buffer.from(data, "base64"));
          await cdp.detach();
          entry.screenshot = `${route.id}.png (cdp)`;
        } catch (fallbackError) {
          entry.screenshotError += ` | cdp: ${String(fallbackError?.message ?? fallbackError).split("\n")[0].slice(0, 120)}`;
        }
      });
    // Only a route we could not capture at all is a finding; a slow first path
    // that the compositor capture recovered from is recorded, not penalised.
    if (!entry.screenshot) entry.violations.push("screenshot-failed");
  } catch (e) {
    entry.error = String(e?.message ?? e).slice(0, 300);    entry.violations = ["probe-failed"];
  }
  entry.errors = errors.slice(0, 8);
  all.push(entry);
  console.log(
    `${entry.violations?.length ? "FAIL" : " ok "} ${route.id.padEnd(26)} ` +
      `${entry.claimsTouch === false ? "[no-touch-claim]" : "[claims-touch]"} ` +
      JSON.stringify(entry.tally ?? {}) +
      (entry.smallTargets?.length ? ` small=${entry.smallTargets.join("|")}` : "") +
      (entry.violations?.length ? ` :: ${entry.violations.join(",")}` : ""),
  );
  await ctx.close();
}
await browser.close();

writeFileSync(resolve(outDir, "mobile-touch-audit.json"), JSON.stringify({ vw, vh, routes: all }, null, 2));
console.log(`\n${outDir}/mobile-touch-audit.json`);
console.log(`routes flagged: ${all.filter((a) => a.violations?.length).length}/${all.length}`);
