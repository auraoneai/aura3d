import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * rework-diamond: is the bat in the batter's hand? Samples the evidence beacon through stance, swing and follow-through on
 * software WebGL2 (remote only, RUN_ID prefix rwdia) and prints @@RWDIA lines. Frames are written under
 * tests/reports/rwdia/ and printed as base64 chunks by task-run (see @@FRAME lines).
 */
const ROUTE = "/apps/showcase-aura-diamond-3d/index.html";
let server: ExampleDevServer;

test.setTimeout(2_400_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

test("diamond bat stays in the batter's hand", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "warning" && /pose|retarget|ANIMATION|attach|socket/i.test(m.text())) process.stdout.write(`@@WARN ${m.text().slice(0, 240)}\n`);
    if (m.type() === "error" && !/404|favicon|local\.css|fonts\//.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto(`${server.origin}${ROUTE}?mode=quick`, { waitUntil: "load", timeout: 180_000 });
  await page.waitForFunction(() => Boolean((window as unknown as Record<string, unknown>).__AURA3D_GAME_DIAMOND__), undefined, { timeout: 600_000 });
  await page.waitForTimeout(6_000);

  const outDir = path.resolve("tests/reports/rwdia");
  mkdirSync(outDir, { recursive: true });
  const samples: unknown[] = [];
  const sample = async (label: string) => {
    const s = await page.evaluate(() => {
      const w = window as unknown as Record<string, any>;
      const b = w.__AURA3D_GAME__ ?? {};
      return { phase: w.__AURA3D_GAME_DIAMOND__?.state?.().phase, bat: b.bat, swing: b.swing, ball: b.ball };
    });
    samples.push({ label, ...s });
    process.stdout.write(`@@RWDIA ${label} ${JSON.stringify(s)}\n`);
    return s;
  };
  const crop = async (name: string) => shot(name, { x: 400, y: 280, width: 160, height: 160 });
  const shot = async (name: string, clip?: { x: number; y: number; width: number; height: number }) => {
    const buf = await page.screenshot({ type: "jpeg", quality: 85, ...(clip ? { clip } : {}) });
    writeFileSync(path.join(outDir, `${name}.jpg`), buf);
    const b64 = buf.toString("base64");
    const size = 30_000;
    const total = Math.ceil(b64.length / size);
    for (let i = 0; i < total; i += 1) process.stdout.write(`@@FRAME ${name} ${i + 1}/${total} ${b64.slice(i * size, (i + 1) * size)}\n`);
  };

  await sample("boot");
  await shot("00-boot");
  for (let i = 0; i < 4; i += 1) {
    await sample(`wait-${i}`);
    await page.waitForTimeout(500);
  }
  await shot("01-stance");
  await crop("01-stance-crop");
  await sample("stance");
  await page.evaluate(() => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__.triggerSwing(0.84));
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(110);
    await sample(`swing-${i}`);
    if (i === 2 || i === 4 || i === 6) await crop(`02-swing-${i}-crop`);
  }
  await page.waitForTimeout(1_200);
  await sample("after");
  await shot("03-after");
  // Auto batting: collect contacts with the bat-derived direction and the resulting hit.
  await page.getByRole("button", { name: "Auto", exact: true }).click().catch(() => process.stdout.write("@@RWDIA auto-click-failed\n"));
  const contacts: unknown[] = [];
  let lastKey = "";
  const t0 = Date.now();
  while (Date.now() - t0 < 600_000 && contacts.length < 4) {
    await page.waitForTimeout(400);
    const s = await page.evaluate(() => {
      const b = (window as unknown as Record<string, any>).__AURA3D_GAME__ ?? {};
      return { swing: b.swing, ball: b.ball, exitVelo: b.exitVelo, launchDeg: b.launchDeg, lastGrade: b.lastGrade, bat: b.bat };
    });
    const key = JSON.stringify(s.swing?.lastContact ?? null) + String(s.exitVelo);
    if (s.swing?.lastContact && key !== lastKey) {
      lastKey = key;
      contacts.push(s);
      process.stdout.write(`@@CONTACT ${contacts.length} ${JSON.stringify({ lastContact: s.swing.lastContact, sweetVelocity: s.swing.sweetVelocity, exitVelo: s.exitVelo, launchDeg: s.launchDeg, grade: s.lastGrade, knobToPalm: s.bat?.knobToHand })}\n`);
      await shot(`04-contact-${contacts.length}`);
    }
  }
  await shot("05-field");
  process.stdout.write(`@@RWDIA contacts ${contacts.length}\n`);
  writeFileSync(path.join(outDir, "samples.json"), JSON.stringify({ errors, samples, contacts }, null, 1));
  process.stdout.write(`@@RWDIA errors ${JSON.stringify(errors)}\n`);
  expect(errors).toEqual([]);
});
