import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { decodePngTexturePixels } from "../../../packages/engine/src/agent-api/PngTexturePixels";

test("PNG data-map decode preserves low-alpha RGB and independent channel decoys exactly", async () => {
  const directory = "tests/browser/fixtures/c1-extension/source";
  const rgba = await decodePngTexturePixels(readFileSync(`${directory}/rgba.png`));
  const decoy = await decodePngTexturePixels(readFileSync(`${directory}/decoyR.png`));
  expect(rgba).toBeDefined();
  expect([rgba!.width, rgba!.height]).toEqual([32, 32]);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const index = (y * 32 + x) * 4;
    expect([...rgba!.data.slice(index, index + 4)]).toEqual([24 + ((x * 7 + y * 3) % 220), 20 + ((x * 3 + y * 11) % 230), 32 + ((x * 13 + y * 5) % 208), 30 + ((x * 5 + y * 17) % 220)]);
    expect(decoy!.data[index]).toBe(rgba!.data[index]);
    expect(decoy!.data[index + 3]).toBe(255 - rgba!.data[index + 3]!);
  }
});

test("non-PNG and unsupported pixel layouts explicitly use browser decode fallback", async () => {
  expect(await decodePngTexturePixels(new Uint8Array([1, 2, 3]))).toBeUndefined();
  const indexed = new Uint8Array(readFileSync("tests/browser/fixtures/c1-extension/source/rgba.png"));
  indexed[25] = 3;
  expect(await decodePngTexturePixels(indexed)).toBeUndefined();
});

test("malformed dimensions and truncated chunks fail before allocating an image", async () => {
  const source = new Uint8Array(readFileSync("tests/browser/fixtures/c1-extension/source/rgba.png"));
  const huge = new Uint8Array(source); new DataView(huge.buffer).setUint32(16, 0xffffffff);
  await expect(decodePngTexturePixels(huge)).rejects.toThrow(/dimensions/);
  await expect(decodePngTexturePixels(source.slice(0, source.length - 20))).rejects.toThrow(/Truncated/);
});
