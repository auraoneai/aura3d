import path from "node:path";
import { test } from "@playwright/test";
import { emit, serve } from "./shotsd-lib";

test.setTimeout(3_000_000);

async function waitReady(page: import("@playwright/test").Page): Promise<number> {
  const t0 = Date.now();
  await page.waitForSelector("canvas", { timeout: 240_000 });
  await page.waitForFunction(() => {
    const b = document.getElementById("boot");
    return !b || b.classList.contains("done") || getComputedStyle(b).display === "none" || getComputedStyle(b).opacity === "0";
  }, undefined, { timeout: 500_000 });
  await page.waitForTimeout(8_000);
  return Math.round((Date.now() - t0) / 1000);
}

async function metrics(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const r = (el: Element) => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; };
    const visible = (el: HTMLElement) => { const cs = getComputedStyle(el); return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.05 && el.getBoundingClientRect().width > 4; };
    const panels = ["taxiCard", "taxiTrip", "taxiPen", "topRightCluster", "where"].map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e && visible(e));
    const tags = [...document.querySelectorAll<HTMLElement>(".mpTag")].filter(visible);
    const inter = (a: ReturnType<typeof r>, b: ReturnType<typeof r>) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
    const overlaps: Array<{ tag: string; panel: string; area: number }> = [];
    for (const t of tags) for (const p of panels) { const area = inter(r(t), r(p)); if (area > 0) overlaps.push({ tag: t.textContent?.slice(0, 14) ?? "", panel: p.id, area: Math.round(area) }); }
    const tagTag: number[] = [];
    for (let i = 0; i < tags.length; i++) for (let j = i + 1; j < tags.length; j++) { const area = inter(r(tags[i]!), r(tags[j]!)); if (area > 0) tagTag.push(Math.round(area)); }
    const card = document.getElementById("taxiCard");
    return {
      vw: innerWidth, vh: innerHeight,
      cardOn: !!card && visible(card), cardClass: card?.className ?? "", cardRect: card ? r(card) : null,
      cardHeightPct: card && visible(card) ? Math.round((card.getBoundingClientRect().height / innerHeight) * 1000) / 10 : 0,
      tags: tags.length, tagOverlaps: overlaps, tagTagOverlaps: tagTag, leaderTags: tags.filter((t) => t.dataset.leader).length
    };
  });
}

test("fixdl teleoperator", async ({ browser }) => {
  const { origin, close } = await serve(path.resolve("tests/browser/fixdl-dist"));
  for (const profile of [
    { name: "1280", width: 1280, height: 720, mobile: false },
    { name: "390", width: 390, height: 844, mobile: true }
  ]) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: 1, isMobile: profile.mobile, hasTouch: profile.mobile });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 200)));
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text().slice(0, 200)); });
    await page.goto(`${origin}/apps/showcase-teleoperator/`, { waitUntil: "load", timeout: 180_000 });
    const readySec = await waitReady(page);
    const shot = async (state: string) => { emit("teleoperator", profile.name, state, await page.screenshot({ type: "jpeg", quality: 86, timeout: 120_000 })); };
    console.log(`@@FIXDL tele ${profile.name} ready ${readySec}s`);
    console.log(`@@FIXDL tele ${profile.name} early ${JSON.stringify(await metrics(page))}`);
    await shot("01-early");
    await page.keyboard.down("KeyW"); await page.waitForTimeout(3_000); await page.keyboard.up("KeyW");
    await page.waitForTimeout(1_500);
    console.log(`@@FIXDL tele ${profile.name} drive ${JSON.stringify(await metrics(page))}`);
    await shot("02-drive");
    if (profile.mobile) {
      await page.evaluate(() => (document.querySelector("#taxiCard .tx-head .tg") as HTMLElement | null)?.click());
      await page.waitForTimeout(1_200);
      console.log(`@@FIXDL tele ${profile.name} collapsed ${JSON.stringify(await metrics(page))}`);
      await shot("03-collapsed");
    }
    console.log(`@@FIXDL tele ${profile.name} errors ${JSON.stringify(errors)}`);
    await context.close();
  }
  await close();
});
