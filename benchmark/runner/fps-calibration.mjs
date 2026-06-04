export const DEFAULT_FPS_CALIBRATION_THRESHOLDS = Object.freeze({
  emptyRafMinFps: 55,
  webglControlMinFps: 45,
  maxP95FrameTimeMs: 34,
  minControlSamples: 90,
  minSceneSamples: 2
});

export function summarizeFrameTimes(frameTimes, options = {}) {
  const finite = frameTimes.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  const p50FrameTimeMs = percentile(finite, 0.5);
  const p95FrameTimeMs = percentile(finite, 0.95);
  const totalFrameTimeMs = finite.reduce((total, value) => total + value, 0);
  return {
    sampleCount: finite.length,
    totalFrameTimeMs,
    minFrameTimeMs: finite[0] ?? null,
    maxFrameTimeMs: finite.at(-1) ?? null,
    p50FrameTimeMs,
    p95FrameTimeMs,
    p50Fps: p50FrameTimeMs ? 1000 / p50FrameTimeMs : null,
    timedOut: options.timedOut === true
  };
}

export function classifyFpsCalibration(calibration, thresholds = DEFAULT_FPS_CALIBRATION_THRESHOLDS) {
  const failures = [];
  if ((calibration.emptyRaf?.sampleCount ?? 0) < thresholds.minControlSamples) {
    failures.push(`empty rAF sample count ${formatCount(calibration.emptyRaf?.sampleCount)} < ${thresholds.minControlSamples}`);
  }
  if (calibration.emptyRaf?.timedOut === true) {
    failures.push("empty rAF sampling timed out before the requested window completed");
  }
  if ((calibration.emptyRaf?.p50Fps ?? 0) < thresholds.emptyRafMinFps) {
    failures.push(`empty rAF p50 FPS ${formatFps(calibration.emptyRaf?.p50Fps)} < ${thresholds.emptyRafMinFps}`);
  }
  if ((calibration.webglControl?.sampleCount ?? 0) < thresholds.minControlSamples) {
    failures.push(`WebGL control sample count ${formatCount(calibration.webglControl?.sampleCount)} < ${thresholds.minControlSamples}`);
  }
  if (calibration.webglControl?.timedOut === true) {
    failures.push("WebGL control sampling timed out before the requested window completed");
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

export function classifySceneFpsSample(fpsSample, thresholds = DEFAULT_FPS_CALIBRATION_THRESHOLDS) {
  const failures = [];
  if (!fpsSample) {
    failures.push("scene FPS sampling did not run");
  } else {
    if ((fpsSample.sampleCount ?? 0) < thresholds.minSceneSamples) {
      failures.push(`scene FPS sample count ${formatCount(fpsSample.sampleCount)} < ${thresholds.minSceneSamples}`);
    }
    if (fpsSample.timedOut === true) {
      failures.push("scene FPS sampling timed out before the requested window completed");
    }
    if (!Number.isFinite(fpsSample.p50Fps)) {
      failures.push("scene FPS p50 unavailable");
    }
    if (!Number.isFinite(fpsSample.p95FrameTimeMs)) {
      failures.push("scene FPS p95 frame time unavailable");
    }
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
  const timeoutSlackMs = options.timeoutSlackMs ?? Math.max(1000, Math.ceil(sampleMs * 0.2));
  if (warmupMs > 0) await page.waitForTimeout(warmupMs);
  const result = await page.evaluate(async ({ durationMs, timeoutMs }) => {
    const frameTimes = [];
    let last = null;
    let timeoutId = 0;
    const start = performance.now();
    return await new Promise((resolve) => {
      let resolved = false;
      function finish(timedOut) {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        resolve({ frameTimes, timedOut });
      }
      function frame(now) {
        if (last !== null) frameTimes.push(now - last);
        last = now;
        if (now - start >= durationMs) finish(false);
        else requestAnimationFrame(frame);
      }
      timeoutId = setTimeout(() => finish(true), timeoutMs);
      requestAnimationFrame(frame);
    });
  }, { durationMs: sampleMs, timeoutMs: sampleMs + timeoutSlackMs });
  return summarizeFrameTimes(result.frameTimes, { timedOut: result.timedOut });
}

export async function runFpsCalibration(browser, options = {}) {
  const viewport = options.viewport ?? { width: 1440, height: 960 };
  const controlFailures = [];
  let emptyPage = null;
  let webglPage = null;
  try {
    emptyPage = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    webglPage = await browser.newPage({ viewport, deviceScaleFactor: 1 });

    const emptyRaf = await runCalibrationControl(controlFailures, "empty rAF", async () => {
      await emptyPage.setContent("<!doctype html><html><body></body></html>");
      return await samplePageFps(emptyPage, {
        warmupMs: options.controlWarmupMs ?? 500,
        sampleMs: options.controlSampleMs ?? 3000
      });
    });

    const webglControlErrors = [];
    webglPage.on?.("pageerror", (error) => {
      webglControlErrors.push(error?.message ?? String(error));
    });
    const webglControl = await runCalibrationControl(controlFailures, "WebGL control", async () => {
      await webglPage.setContent(webglControlHtml(viewport));
      await webglPage.waitForFunction(() => window.__AURA3D_FPS_CONTROL_READY__ === true, null, { timeout: 5000 });
      if (webglControlErrors.length > 0) {
        throw new Error(webglControlErrors.join("; "));
      }
      return await samplePageFps(webglPage, {
        warmupMs: options.controlWarmupMs ?? 500,
        sampleMs: options.controlSampleMs ?? 3000
      });
    });

    const calibration = { emptyRaf, webglControl };
    const verdict = classifyFpsCalibration(calibration, options.thresholds);
    const failures = [...controlFailures, ...verdict.failures];
    return {
      ...calibration,
      verdict: {
        ...verdict,
        status: failures.length === 0 ? "pass" : "invalid",
        failures
      }
    };
  } finally {
    await emptyPage?.close();
    await webglPage?.close();
  }
}

export function applyFpsCalibrationToMetrics(metrics, calibration) {
  const verdict = calibration.verdict ?? classifyFpsCalibration(calibration);
  const sceneVerdict = classifySceneFpsSample(metrics.fpsSample, verdict.thresholds);
  const fpsCalibration = { ...calibration, verdict };
  if (verdict.status === "pass" && sceneVerdict.status === "pass") {
    return {
      ...metrics,
      fpsInstrumentationStatus: "pass",
      fpsInstrumentationFailures: [],
      fpsCalibration
    };
  }
  return {
    ...metrics,
    p50Fps: null,
    p95FrameTimeMs: null,
    fpsInstrumentationStatus: "invalid",
    fpsInstrumentationFailures: [...verdict.failures, ...sceneVerdict.failures].length > 0
      ? [...verdict.failures, ...sceneVerdict.failures]
      : ["FPS calibration did not pass."],
    fpsCalibration
  };
}

async function runCalibrationControl(controlFailures, label, run) {
  try {
    return await run();
  } catch (error) {
    controlFailures.push(`${label} calibration failed: ${error?.message ?? String(error)}`);
    return emptyFpsSummary({ timedOut: true });
  }
}

function emptyFpsSummary(options = {}) {
  return summarizeFrameTimes([], options);
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const index = Math.min(values.length - 1, Math.max(0, Math.floor(values.length * fraction)));
  return values[index] ?? null;
}

function formatCount(value) {
  return Number.isFinite(value) ? `${value}` : "unavailable";
}

function formatFps(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}` : "unavailable";
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}ms` : "unavailable";
}

function webglControlHtml(viewport) {
  const width = Math.max(1, Math.floor(viewport.width));
  const height = Math.max(1, Math.floor(viewport.height));
  return `<!doctype html>
<html>
  <body style="margin:0;background:#05070d">
    <canvas id="c" width="${width}" height="${height}" style="display:block;width:${width}px;height:${height}px"></canvas>
    <script type="module">
      const canvas = document.getElementById("c");
      const gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance"
      });
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
      if (!gl.getShaderParameter(vertex, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(vertex) ?? "vertex shader compile failed");
      const fragment = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fragment, \`#version 300 es
      precision highp float;
      out vec4 color;
      void main() { color = vec4(0.36, 0.86, 1.0, 1.0); }\`);
      gl.compileShader(fragment);
      if (!gl.getShaderParameter(fragment, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(fragment) ?? "fragment shader compile failed");
      const program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "program link failed");
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
