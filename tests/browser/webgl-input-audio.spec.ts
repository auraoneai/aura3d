import { expect, test } from "@playwright/test";

test("browser runtime exposes WebGL2, pointer events, and audio context lifecycle", async ({ page }) => {
  await page.setContent(`
    <canvas id="surface" width="64" height="64" style="width:64px;height:64px"></canvas>
    <button id="target">target</button>
  `);

  const webgl = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#surface");
    if (!canvas) return { ok: false, reason: "missing canvas" };
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) return { ok: false, reason: "missing webgl2" };

    gl.clearColor(0.25, 0.5, 0.75, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 2, 3, 4]), gl.STATIC_DRAW);

    return {
      ok: pixel[0] > 0 && pixel[1] > 0 && pixel[2] > 0 && pixel[3] === 255,
      pixel: Array.from(pixel),
      hasBuffer: buffer !== null
    };
  });

  expect(webgl.ok).toBe(true);
  expect(webgl.hasBuffer).toBe(true);

  let pointerCount = 0;
  await page.exposeFunction("recordPointer", () => {
    pointerCount += 1;
  });
  await page.evaluate(() => {
    document.querySelector("#target")?.addEventListener("pointerdown", () => {
      void (window as unknown as { recordPointer: () => void }).recordPointer();
    });
  });
  await page.locator("#target").click();
  expect(pointerCount).toBe(1);

  const audio = await page.evaluate(async () => {
    const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextCtor) return { ok: false, reason: "missing audio context" };
    const context = new AudioContextCtor();
    await context.resume();
    const state = context.state;
    await context.close();
    return { ok: state === "running" || state === "suspended", state };
  });

  expect(audio.ok).toBe(true);
});

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
