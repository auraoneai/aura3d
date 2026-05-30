export const DEFAULT_FPS_CALIBRATION_THRESHOLDS = Object.freeze({
  emptyRafMinFps: 55,
  webglControlMinFps: 45,
  maxP95FrameTimeMs: 34
});

export function summarizeFrameTimes(frameTimes) {
  const finite = frameTimes.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  const p50FrameTimeMs = percentile(finite, 0.5);
  const p95FrameTimeMs = percentile(finite, 0.95);
  return {
    sampleCount: finite.length,
    p50FrameTimeMs,
    p95FrameTimeMs,
    p50Fps: p50FrameTimeMs ? 1000 / p50FrameTimeMs : null
  };
}

export function classifyFpsCalibration(calibration, thresholds = DEFAULT_FPS_CALIBRATION_THRESHOLDS) {
  const failures = [];
  if ((calibration.emptyRaf?.p50Fps ?? 0) < thresholds.emptyRafMinFps) {
    failures.push(`empty rAF p50 FPS ${formatFps(calibration.emptyRaf?.p50Fps)} < ${thresholds.emptyRafMinFps}`);
  }
  if ((calibration.webglControl?.p50Fps ?? 0) < thresholds.webglControlMinFps) {
    failures.push(`WebGL control p50 FPS ${formatFps(calibration.webglControl?.p50Fps)} < ${thresholds.webglControlMinFps}`);
  }
  if ((calibration.webglControl?.p95FrameTimeMs ?? Number.POSITIVE_INFINITY) > thresholds.maxP95FrameTimeMs) {
    failures.push(`WebGL control p95 frame time ${formatMs(calibration.webglControl?.p95FrameTimeMs)} > ${thresholds.maxP95FrameTimeMs}ms`);
  }
  return {
    status: failures.length === 0 ? "pass" : "invalid",
    failures,
    thresholds
  };
}

export async function samplePageFps(page, options = {}) {
  const warmupMs = options.warmupMs ?? 5000;
  const sampleMs = options.sampleMs ?? 15000;
  if (warmupMs > 0) await page.waitForTimeout(warmupMs);
  const frameTimes = await page.evaluate(async (durationMs) => {
    const samples = [];
    let last = performance.now();
    const start = performance.now();
    return await new Promise((resolve) => {
      function frame(now) {
        samples.push(now - last);
        last = now;
        if (now - start >= durationMs) resolve(samples.slice(1));
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }, sampleMs);
  return summarizeFrameTimes(frameTimes);
}

export async function runFpsCalibration(browser, options = {}) {
  const emptyPage = await browser.newPage({ viewport: options.viewport ?? { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const webglPage = await browser.newPage({ viewport: options.viewport ?? { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  try {
    await emptyPage.setContent("<!doctype html><html><body></body></html>");
    const emptyRaf = await samplePageFps(emptyPage, {
      warmupMs: options.controlWarmupMs ?? 500,
      sampleMs: options.controlSampleMs ?? 3000
    });

    await webglPage.setContent(webglControlHtml());
    await webglPage.waitForFunction(() => window.__AURA3D_FPS_CONTROL_READY__ === true, null, { timeout: 5000 });
    const webglControl = await samplePageFps(webglPage, {
      warmupMs: options.controlWarmupMs ?? 500,
      sampleMs: options.controlSampleMs ?? 3000
    });
    const calibration = { emptyRaf, webglControl };
    return {
      ...calibration,
      verdict: classifyFpsCalibration(calibration, options.thresholds)
    };
  } finally {
    await emptyPage.close();
    await webglPage.close();
  }
}

export function applyFpsCalibrationToMetrics(metrics, calibration) {
  if (calibration.verdict?.status === "pass") {
    return {
      ...metrics,
      fpsCalibration: calibration
    };
  }
  return {
    ...metrics,
    p50Fps: null,
    p95FrameTimeMs: null,
    fpsInstrumentationStatus: "invalid",
    fpsInstrumentationFailures: calibration.verdict?.failures ?? ["FPS calibration did not pass."],
    fpsCalibration: calibration
  };
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const index = Math.min(values.length - 1, Math.max(0, Math.floor(values.length * fraction)));
  return values[index] ?? null;
}

function formatFps(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}` : "unavailable";
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}ms` : "unavailable";
}

function webglControlHtml() {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#05070d">
    <canvas id="c" width="1440" height="960"></canvas>
    <script type="module">
      const canvas = document.getElementById("c");
      const gl = canvas.getContext("webgl2", { antialias: true, preserveDrawingBuffer: true });
      if (!gl) throw new Error("missing webgl2");
      const vertex = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vertex, \`#version 300 es
      in vec2 p;
      uniform float t;
      void main() {
        float c = cos(t);
        float s = sin(t);
        vec2 q = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
        gl_Position = vec4(q * 0.55, 0.0, 1.0);
      }\`);
      gl.compileShader(vertex);
      const fragment = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fragment, \`#version 300 es
      precision highp float;
      out vec4 color;
      void main() { color = vec4(0.36, 0.86, 1.0, 1.0); }\`);
      gl.compileShader(fragment);
      const program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, 0,1]), gl.STATIC_DRAW);
      const attr = gl.getAttribLocation(program, "p");
      const time = gl.getUniformLocation(program, "t");
      function frame(now) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.02, 0.03, 0.05, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        gl.uniform1f(time, now / 1000);
        gl.enableVertexAttribArray(attr);
        gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        requestAnimationFrame(frame);
      }
      window.__AURA3D_FPS_CONTROL_READY__ = true;
      requestAnimationFrame(frame);
    </script>
  </body>
</html>`;
}
