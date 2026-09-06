import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';

// Infrastructure suitability only: this does not certify Aura3D rendering or performance.
const output = process.env.PROBE_OUTPUT;
if (!output) throw new Error('PROBE_OUTPUT is required');
await mkdir(output, { recursive: true });
const command = (binary, args) => {
  try { return { output: execFileSync(binary, args, { encoding: 'utf8', timeout: 30_000 }).trim(), error: null }; }
  catch (error) { return { output: '', error: String(error) }; }
};
const evidence = {
  schema: 'aura3d.native-webgpu-adapter-probe.v1',
  scope: 'runner adapter suitability; no engine or performance acceptance',
  startedAt: new Date().toISOString(),
  source: { commit: process.env.GITHUB_SHA ?? null, runId: process.env.GITHUB_RUN_ID ?? null, runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null },
  command: process.argv,
  probeSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
  runner: {
    os: platform(), arch: arch(), release: release(), totalMemory: totalmem(), cpuModel: cpus()[0]?.model,
    image: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null,
    hardware: command('/usr/sbin/system_profiler', ['SPHardwareDataType', 'SPDisplaysDataType', '-json']),
    macos: command('/usr/bin/sw_vers', []),
  },
  attempts: [], nativeMetalComputeVerified: false,
};
const server = createServer((_req, response) => { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>Native adapter probe</title>'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
try {
  // No SwiftShader/software overrides. The second attempt only requests the native Metal ANGLE backend.
  for (const args of [[], ['--use-angle=metal', '--enable-unsafe-webgpu']]) {
    const attempt = { args, headless: true, browserVersion: null, systemInfo: null, result: null, error: null };
    evidence.attempts.push(attempt);
    let browser;
    try {
      browser = await chromium.launch({ headless: true, args, timeout: 45_000 });
      attempt.browserVersion = browser.version();
      const session = await browser.newBrowserCDPSession();
      attempt.systemInfo = await session.send('SystemInfo.getInfo');
      const page = await browser.newPage();
      page.setDefaultTimeout(30_000);
      await page.goto(url);
      attempt.result = await page.evaluate(async () => {
        if (!navigator.gpu) return { available: false, reason: 'navigator.gpu unavailable' };
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance', forceFallbackAdapter: false });
        if (!adapter) return { available: false, reason: 'requestAdapter returned null' };
        const info = adapter.info ?? await adapter.requestAdapterInfo();
        const adapterInfo = Object.fromEntries(['vendor', 'architecture', 'device', 'description', 'backend', 'type', 'isFallbackAdapter'].map(key => [key, info[key] ?? null]));
        const device = await adapter.requestDevice();
        const errors = [];
        device.addEventListener('uncapturederror', event => errors.push(String(event.error)));
        device.pushErrorScope('validation');
        const gpu = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
        const readback = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        try {
          const module = device.createShaderModule({ code: '@group(0) @binding(0) var<storage, read_write> result: array<u32>; @compute @workgroup_size(4) fn main(@builtin(local_invocation_index) i: u32) { result[i] = i * i + 17u; }' });
          const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } });
          const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: gpu } }] });
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginComputePass();
          pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup); pass.dispatchWorkgroups(1); pass.end();
          encoder.copyBufferToBuffer(gpu, 0, readback, 0, 16);
          device.queue.submit([encoder.finish()]);
          await device.queue.onSubmittedWorkDone();
          await readback.mapAsync(GPUMapMode.READ);
          const actual = Array.from(new Uint32Array(readback.getMappedRange()));
          readback.unmap();
          const validationError = await device.popErrorScope();
          return { available: true, adapterInfo, fallback: adapter.isFallbackAdapter ?? info.isFallbackAdapter ?? null, features: Array.from(adapter.features), actual, expected: [17, 18, 21, 26], computePassed: actual.join(',') === '17,18,21,26' && errors.length === 0 && !validationError, errors, validationError: validationError ? String(validationError) : null };
        } finally { gpu.destroy(); readback.destroy(); device.destroy(); }
      });
      await page.screenshot({ path: join(output, `probe-${evidence.attempts.length}.png`) });
      const identity = JSON.stringify(attempt.result?.adapterInfo ?? {});
      const nativeIdentity = /apple|metal/i.test(identity) && !/swiftshader|llvmpipe|software|lavapipe/i.test(identity);
      const gpu = attempt.systemInfo?.gpu;
      const nativeBackend = gpu?.auxAttributes?.displayType === 'ANGLE_METAL' &&
        /metal/i.test(gpu?.auxAttributes?.glRenderer ?? '') && gpu?.featureStatus?.webgpu === 'enabled';
      attempt.nativeMetalComputeVerified = platform() === 'darwin' && nativeIdentity && nativeBackend && attempt.result?.fallback === false && attempt.result?.computePassed === true;
      evidence.nativeMetalComputeVerified ||= attempt.nativeMetalComputeVerified;
    } catch (error) { attempt.error = String(error?.stack ?? error); }
    finally { await browser?.close(); await writeFile(join(output, 'adapter-probe.json'), JSON.stringify(evidence, null, 2)); }
  }
} finally {
  await new Promise(resolve => server.close(resolve));
  evidence.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'adapter-probe.json'), JSON.stringify(evidence, null, 2));
}
console.log(JSON.stringify({ nativeMetalComputeVerified: evidence.nativeMetalComputeVerified, attempts: evidence.attempts.map(({ args, result, error }) => ({ args, result, error })) }, null, 2));
if (!evidence.nativeMetalComputeVerified) process.exitCode = 1;
