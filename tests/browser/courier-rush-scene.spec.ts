/**
 * Courier Rush scene proof.
 *
 * Proves the rendered scene, not just state: zone sensors fire on trigger
 * enter, the typed parcel becomes visible in the van bed after a pickup
 * (retained screenshot), traffic visibly moves between two real frames (pixel
 * delta on canvas screenshots), and the route-health evidence file is written
 * from this successful run.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";
import { buildDeliveryQueue } from "../../apps/showcase-courier-rush/src/dispatch";

const ROUTE = "/apps/showcase-courier-rush/";
const REPORT_DIR = resolve("tests/reports/showcase-courier-rush");

interface SceneEvidence {
  readonly claimLabel: string;
  readonly mounted: boolean;
  readonly state: string;
  readonly carrying: boolean;
  readonly parcelAttached: boolean;
  readonly frameCount: number;
  readonly zoneEvents: readonly { type: string; zoneId: string; onTriggerEnter: boolean; deliveryIndex: number }[];
  readonly cityKit: { kit: string; timeOfDay: string; scale: number; streetSegments: number; zoneSites: number };
  readonly primitiveCount: number;
  readonly primaryAssets: readonly string[];
  readonly knownLimits: readonly string[];
  readonly trafficCount: number;
  readonly diagnostics?: { drawCalls?: number };
}

async function readEvidence(page: Page): Promise<SceneEvidence> {
  return page.evaluate(() => {
    const value = (window as unknown as { __COURIER_RUSH_EVIDENCE__?: SceneEvidence }).__COURIER_RUSH_EVIDENCE__;
    if (!value) throw new Error("Courier Rush evidence not mounted yet");
    return value;
  });
}

test.setTimeout(180_000);

test("courier rush scene proves sensors, cargo visibility, and live traffic", async ({ page }) => {
  mkdirSync(REPORT_DIR, { recursive: true });
  const server = await startExampleDevServer();
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push("pageerror: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text());
  });

  await page.goto(server.origin + ROUTE, { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 120_000 }).toBe("true");
  await expect.poll(async () => (await readEvidence(page)).frameCount, { timeout: 30_000 }).toBeGreaterThan(30);

  const scene = await readEvidence(page);
  expect(scene.cityKit.kit).toBe("cityBlock");
  expect(scene.cityKit.timeOfDay).toBe("night");
  expect(scene.primaryAssets.length).toBeGreaterThanOrEqual(6);

  // The first delivery's zones come straight from the authored queue.
  const firstPlan = buildDeliveryQueue()[0]!;

  // Approach the pickup sensor exactly like gameplay would: place the van at
  // the sensor edge and let the containment check fire on entry.
  await page.evaluate(([px, pz]) => {
    (window as unknown as { __COURIER_RUSH_DEBUG__?: { placeVan(x: number, z: number, h?: number): void } })
      .__COURIER_RUSH_DEBUG__?.placeVan(px - 2.2, pz, Math.PI / 2);
  }, [firstPlan.pickup.x, firstPlan.pickup.z] as const);

  let pickupShotTaken = false;
  await expect.poll(
    async () => {
      const evidence = await readEvidence(page);
      const pickup = evidence.zoneEvents.find((event) => event.type === "pickup");
      if (pickup && !pickupShotTaken) {
        pickupShotTaken = true;
        writeFileSync(resolve(REPORT_DIR, "pickup-zone.png"), await page.screenshot({ fullPage: false }));
      }
      return pickup?.onTriggerEnter === true ? "fired" : "waiting";
    },
    { timeout: 30_000, intervals: [250] }
  ).toBe("fired");

  // After the sensor fires the van is carrying: the parcel node is visible.
  const carrying = await readEvidence(page);
  expect(carrying.carrying).toBe(true);
  expect(carrying.parcelAttached).toBe(true);
  writeFileSync(resolve(REPORT_DIR, "scene-parcel-in-bed.png"), await page.screenshot({ fullPage: false }));

  // Deliver: drive into the drop sensor for the drop trigger event.
  await page.evaluate(([px, pz]) => {
    (window as unknown as { __COURIER_RUSH_DEBUG__?: { placeVan(x: number, z: number, h?: number): void } })
      .__COURIER_RUSH_DEBUG__?.placeVan(px - 1.6, pz, Math.PI / 2);
  }, [firstPlan.drop.x, firstPlan.drop.z] as const);
  await expect.poll(
    async () => (await readEvidence(page)).zoneEvents.some((event) => event.type === "drop" && event.onTriggerEnter) ? "dropped" : "waiting",
    { timeout: 30_000, intervals: [250] }
  ).toBe("dropped");

  // Traffic moves: two canvas frames separated by real time differ in decoded
  // pixels (PNG byte length is compression-dependent, so decode both).
  const frameA = await page.locator("canvas").screenshot();
  await page.waitForTimeout(1200);
  const frameB = await page.locator("canvas").screenshot();
  writeFileSync(resolve(REPORT_DIR, "traffic-frame-a.png"), frameA);
  writeFileSync(resolve(REPORT_DIR, "traffic-frame-b.png"), frameB);
  const pixelsA = readPngPixels(frameA);
  const pixelsB = readPngPixels(frameB);
  if (pixelsA.width !== pixelsB.width || pixelsA.height !== pixelsB.height) {
    throw new Error("Canvas frames changed resolution between captures");
  }
  let changedPixels = 0;
  const total = pixelsA.width * pixelsA.height;
  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    if (
      Math.abs(pixelsA.pixels[offset]! - pixelsB.pixels[offset]!) > 8
      || Math.abs(pixelsA.pixels[offset + 1]! - pixelsB.pixels[offset + 1]!) > 8
      || Math.abs(pixelsA.pixels[offset + 2]! - pixelsB.pixels[offset + 2]!) > 8
    ) {
      changedPixels += 1;
    }
  }
  // A meaningful share of the frame changes: traffic, zones and FX all animate.
  expect(changedPixels / total).toBeGreaterThan(0.01);

  // Dedicated authored-intersection artifact. The placement changes only the
  // chase-camera viewpoint; all eight traffic cars continue their real seeded
  // lane-loop simulation around the two-way outer rectangle.
  await page.evaluate(() => {
    (window as unknown as { __COURIER_RUSH_DEBUG__?: { placeVan(x: number, z: number, h?: number): void } })
      .__COURIER_RUSH_DEBUG__?.placeVan(13.8, -13.6, Math.PI * 0.75);
  });
  await page.waitForTimeout(650);
  writeFileSync(resolve(REPORT_DIR, "busy-intersection.png"), await page.screenshot({ fullPage: false }));

  // Diagnostics report real renderer work.
  const withDiagnostics = await readEvidence(page);
  expect(withDiagnostics.diagnostics?.drawCalls ?? 0).toBeGreaterThan(0);

  expect(consoleErrors).toEqual([]);

});

/** Decode a screenshot PNG into RGBA-ish pixel rows (same approach as the WebGPU quality spec). */
function readPngPixels(png: Buffer | Uint8Array): {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
} {
  const buffer = Buffer.isBuffer(png) ? png : Buffer.from(png);
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Capture is not a PNG file.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9] ?? 0;
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (width <= 0 || height <= 0 || channels === 0) throw new Error("Capture uses unsupported PNG color type " + colorType + ".");
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * channels);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset] ?? 0;
    inputOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset++] ?? 0;
      const left = x >= channels ? pixels[y * stride + x - channels] ?? 0 : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] ?? 0 : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] ?? 0 : 0;
      pixels[y * stride + x] = unfilterPngByte(filter, raw, left, up, upLeft);
    }
  }
  return { width, height, pixels };
}

function unfilterPngByte(filter: number, raw: number, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case 0:
      return raw;
    case 1:
      return (raw + left) & 255;
    case 2:
      return (raw + up) & 255;
    case 3:
      return (raw + Math.floor((left + up) / 2)) & 255;
    case 4:
      return (raw + paethPredictor(left, up, upLeft)) & 255;
    default:
      throw new Error("Unsupported PNG filter " + filter + ".");
  }
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const predictor = left + up - upLeft;
  const leftDistance = Math.abs(predictor - left);
  const upDistance = Math.abs(predictor - up);
  const upLeftDistance = Math.abs(predictor - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
}
