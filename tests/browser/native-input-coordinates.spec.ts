import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

// Runtime evidence from this suite is browser input evidence, never a physical-touch receipt.
for (const dpr of [1, 2]) {
  test.describe(`native canvas input at device scale ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    let server: ExampleDevServer;

    test.beforeAll(async () => { server = await startExampleDevServer(); });
    test.afterAll(async () => { await server.close(); });

    test("maps scrolled and resized targets to rendered picks and keeps contact termination distinct", async ({ page }) => {
      await page.goto(`${server.origin}/tests/browser/input-browser-harness.html`, { waitUntil: "domcontentloaded" });
      await page.setContent(`<!doctype html><style>
        body { margin: 0; height: 1600px; }
        #wrap { position: absolute; top: 340px; left: 83px; }
        canvas { display: block; width: 240px; height: 120px; }
      </style><div id="wrap"><canvas id="surface" tabindex="0"></canvas></div>`);
      await page.evaluate(async () => {
        const inputUrl = "/packages/input/src/index.ts";
        const sceneUrl = "/packages/scene/src/index.ts";
        const { InputSystem, InteractionSystem, pickingRayFromCamera } = await import(inputUrl);
        const { Scene } = await import(sceneUrl);
        const canvas = document.querySelector<HTMLCanvasElement>("#surface")!;
        const input = new InputSystem(canvas);
        const scene = new Scene();
        const camera = scene.createOrthographicCamera({ left: -1, right: 1, top: 1, bottom: -1, near: 0.1, far: 20 });
        scene.root.addChild(camera);
        camera.transform.setPosition(0, 0, 3);
        const interaction = new InteractionSystem(
          (snapshot: InstanceType<typeof InputSystem>["snapshot"]) => pickingRayFromCamera(camera, snapshot.pointer.x, snapshot.pointer.y),
          () => [
            { id: "left", bounds: { min: [-0.8, -0.5, -0.01], max: [-0.2, 0.5, 0.01] } },
            { id: "right", bounds: { min: [0.2, -0.5, -0.01], max: [0.8, 0.5, 0.01] } }
          ]
        );
        const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
        if (!gl) throw new Error("WebGL2 is required for this rendered picking case");
        const shader = (kind: number, source: string) => {
          const result = gl.createShader(kind)!;
          gl.shaderSource(result, source);
          gl.compileShader(result);
          if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result) ?? "shader compilation failed");
          return result;
        };
        const program = gl.createProgram()!;
        gl.attachShader(program, shader(gl.VERTEX_SHADER, `#version 300 es
          in vec2 position;
          void main() { gl_Position = vec4(position, 0., 1.); }`));
        gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `#version 300 es
          precision highp float;
          uniform vec4 color;
          out vec4 outColor;
          void main() { outColor = color; }`));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "program link failed");
        const buffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
          -.8, -.5, -.2, -.5, -.8, .5, -.8, .5, -.2, -.5, -.2, .5,
          .2, -.5, .8, -.5, .2, .5, .2, .5, .8, -.5, .8, .5
        ]), gl.STATIC_DRAW);
        gl.useProgram(program);
        const location = gl.getAttribLocation(program, "position");
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
        const color = gl.getUniformLocation(program, "color");
        const render = () => {
          const rect = canvas.getBoundingClientRect();
          canvas.width = Math.round(rect.width * devicePixelRatio);
          canvas.height = Math.round(rect.height * devicePixelRatio);
          camera.setViewport({ x: 0, y: 0, width: canvas.width, height: canvas.height });
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.useProgram(program);
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
          gl.clearColor(0, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.uniform4f(color, 1, 0, 0, 1);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          gl.uniform4f(color, 0, 1, 0, 1);
          gl.drawArrays(gl.TRIANGLES, 6, 6);
        };
        render();
        const inspect = () => {
          const snapshot = input.update();
          const point = snapshot.pointer;
          const pixel = new Uint8Array(4);
          gl.readPixels(Math.floor(point.framebufferX), canvas.height - 1 - Math.floor(point.framebufferY), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          const hit = interaction.update(snapshot);
          return {
            clientX: point.clientX, clientY: point.clientY, cssX: point.cssX, cssY: point.cssY,
            framebufferX: point.framebufferX, framebufferY: point.framebufferY,
            pixel: Array.from(pixel), hit: hit?.target.id,
            ids: point.touches.map((touch: { id: number }) => touch.id),
            cancellations: point.cancellations, released: snapshot.button(0).released,
            down: snapshot.button(0).down
          };
        };
        canvas.addEventListener("pointerdown", event => {
          if (event.isTrusted) canvas.setPointerCapture(event.pointerId);
        });
        (window as unknown as { __nativeInput: unknown }).__nativeInput = { canvas, input, render, inspect };
      });
      await page.evaluate(() => window.scrollTo(0, 220));
      const box = await page.locator("#surface").boundingBox();
      if (!box) throw new Error("canvas has no layout box");
      await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
      await page.mouse.down();
      let observed = await page.evaluate(() => {
        const h = (window as any).__nativeInput;
        return h.inspect();
      });
      expect(observed.cssX).toBeCloseTo(box.width * 0.25, 1);
      expect(observed.cssY).toBeCloseTo(box.height * 0.5, 1);
      expect(observed.framebufferX).toBeCloseTo(box.width * dpr * 0.25, 1);
      expect(observed.framebufferY).toBeCloseTo(box.height * dpr * 0.5, 1);
      expect(observed.pixel).toEqual([255, 0, 0, 255]);
      expect(observed.hit).toBe("left");
      await page.mouse.up();
      await page.evaluate(() => { const h = (window as any).__nativeInput; h.input.update(); h.input.endFrame(); });

      await page.evaluate(() => {
        const h = (window as any).__nativeInput;
        h.canvas.style.width = "300px";
        h.canvas.style.height = "160px";
        h.render();
      });
      const resized = await page.locator("#surface").boundingBox();
      if (!resized) throw new Error("resized canvas has no layout box");
      await page.mouse.move(resized.x + resized.width * 0.75, resized.y + resized.height * 0.5);
      observed = await page.evaluate(() => (window as any).__nativeInput.inspect());
      expect(observed.framebufferX).toBeCloseTo(resized.width * dpr * 0.75, 1);
      expect(observed.pixel).toEqual([0, 255, 0, 255]);
      expect(observed.hit).toBe("right");

      const touch = await page.evaluate(() => {
        const h = (window as any).__nativeInput;
        h.input.endFrame();
        const r = h.canvas.getBoundingClientRect();
        const send = (type: string, pointerId: number, x: number) => h.canvas.dispatchEvent(new PointerEvent(type, {
          pointerId, pointerType: "touch", clientX: r.left + x, clientY: r.top + 20, button: 0, bubbles: true
        }));
        send("pointerdown", 11, 20);
        send("pointerdown", 12, 50);
        h.input.update();
        h.input.endFrame();
        send("pointercancel", 11, 20);
        return h.inspect();
      });
      expect(touch.ids).toEqual([12]);
      expect(touch.cancellations).toMatchObject([{ id: 11, reason: "pointercancel" }]);
      expect(touch.down).toBe(true);
      expect(touch.released).toBe(false);
      await page.evaluate(() => { const h = (window as any).__nativeInput; h.input.pointer.blur(); h.input.update(); h.input.endFrame(); });

      // A trusted mouse pointer is captured on down; explicit capture loss must cancel it.
      await page.mouse.move(resized.x + resized.width * 0.25, resized.y + resized.height * 0.5);
      await page.mouse.down();
      await page.evaluate(() => {
        const h = (window as any).__nativeInput;
        const id = h.input.update().pointer.primaryId;
        h.input.endFrame();
        const log: string[] = [];
        (window as any).__captureLog = log;
        for (const type of ["lostpointercapture", "pointermove", "pointerup", "pointercancel"]) {
          h.canvas.addEventListener(type, (event: PointerEvent) => log.push(`${type}:${event.pointerId}`));
        }
        log.push(`before:id=${id}:has=${h.canvas.hasPointerCapture(id)}`);
        h.canvas.releasePointerCapture(id);
        log.push(`after:has=${h.canvas.hasPointerCapture(id)}`);
      });
      // Chromium delivers lostpointercapture with the next pointer event, so keep the pointer moving while polling.
      let jitter = 0;
      try {
        await expect.poll(async () => {
          jitter += 1;
          await page.mouse.move(resized.x + resized.width * (0.3 + (jitter % 2) * 0.02), resized.y + resized.height * 0.5);
          return page.evaluate(() => (window as any).__nativeInput.inspect().cancellations.map((c: { reason: string }) => c.reason));
        }).toContain("lostpointercapture");
      } catch (error) {
        const log = await page.evaluate(() => JSON.stringify((window as any).__captureLog));
        throw new Error(`${error instanceof Error ? error.message : String(error)}\npointer event log: ${log}`);
      }
      observed = await page.evaluate(() => (window as any).__nativeInput.inspect());
      expect(observed.released).toBe(false);
      await page.mouse.up();
      await page.evaluate(() => (window as any).__nativeInput.input.dispose());
    });
  });
}
