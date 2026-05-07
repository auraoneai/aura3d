# WebGPU Hardware Matrix

Version: 0.1.0-alpha.0

Galileo3D separates real WebGPU evidence from injected adapter evidence. Browser tests that use injected adapters prove the renderer contract, fallback behavior, and submission shape. They do not prove hardware support.

The real-device probe is `tests/browser/webgpu-real-device.spec.ts`. It uses `navigator.gpu` directly when the browser exposes it and writes `tests/reports/webgpu-hardware-matrix.json` with:

- browser name and Playwright project name;
- operating system platform and release;
- browser user agent;
- whether `navigator.gpu` exists;
- adapter request status;
- device request status;
- adapter info, features, and limits when the browser exposes them;
- unsupported cases such as missing `navigator.gpu`, null adapter, missing `requestDevice`, or thrown adapter/device errors.

If `navigator.gpu` is unavailable, the report is still valid fallback evidence for that browser/runtime. It must be read as unsupported hardware evidence, not as a passing WebGPU hardware result.

Public claims must not say "full WebGPU support" until the matrix includes real adapter/device results across the browsers, operating systems, and GPU adapters named in the release notes. Injected adapter reports are allowed only as contract evidence.
