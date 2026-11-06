# Decoder deployment

`@aura3d/assets/vite` serves and copies the optional Basis, Draco and Meshopt
decoder files. It uses the same decoder URL in Vite development, a built site,
and Vite static preview. Decoder downloads and the KTX2 worker stay on the
application's origin; there is no CDN or blob-worker fallback.

The default decoder URL is `<vite-base>aura-decoders/`. For example, Vite base
`/` uses `/aura-decoders/`; base `/store/` uses
`/store/aura-decoders/`. A build for `/store/` places that directory at
`<outDir>/aura-decoders/`, because the web server mounts `<outDir>` at
`/store/`. The plugin injects its validated URL as a build-scoped runtime
default for the engine and decoder pipeline:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { auraDecodersPlugin } from "@aura3d/assets/vite";

export default defineConfig({
  base: "/store/",
  plugins: [auraDecodersPlugin({ basePath: "/store/codecs/v1/", codecs: ["basis", "draco"] })]
});
```

The plugin also exposes its resolved decoder directory through an optional
virtual module. To pass the path explicitly, add the declaration reference to the Vite application's
`src/vite-env.d.ts` (or another included declaration file):

```ts
/// <reference types="@aura3d/assets/vite-client" />
```

Then pass the value into the application's existing asset options if an explicit
override is needed:

```ts
import { createAuraApp, looks, scene } from "@aura3d/engine";
import { decoderBasePath } from "virtual:aura3d-decoder-deployment";

createAuraApp("#app", {
  scene: scene().add(looks.preset("product-studio")),
  ...looks.appOptions("product-studio"),
  assets: { decoders: { basePath: decoderBasePath } }
});
```

The virtual module requires `auraDecodersPlugin()` in that Vite configuration.
It exports the same validated directory the plugin serves and copies, including
an explicit plugin `basePath`. It is available to development and Vite builds,
including server-side builds that use the plugin; static preview serves the
value compiled into the application. Configure each build for its actual
deployment. The module does not infer a base from the current page, model, or
engine bundle URL.

Without an explicit app option, builds using the plugin use its injected
decoder directory. The same `assets` option can be supplied to
`createWorkerRenderer()` from `@aura3d/engine/worker`. An explicit decoder base
overrides a packaged render worker's individual decoder URLs; omit the option
when that worker should use its manifest. With the Vite plugin, the packaged
worker manifest uses the same configured decoder directory. Without the plugin,
packaged workers retain their bundled decoder URLs, which can differ from the
source worker's default. Applications may set
`assets.decoders.basePath` manually instead of importing the virtual module.
See [worker renderer texture snapshots](../api/worker-renderer.md) for the
separate scene-resource and queue limits.
Separately bundled custom workers and non-Vite nested deployments need their
own explicit configuration. The `ensureCompressedTextureSupport()` diagnostic
uses the build-scoped default or its own explicit `{ basePath }` option; it
does not read an app instance's options.

The configuration and runtime paths have source tests. Vite server, production
build and deployed worker URL behavior still need acceptance testing.

With the example configuration, the imported value is
`"/store/codecs/v1/"`. Vite writes files to `<outDir>/codecs/v1/` and the
runtime uses:

| Purpose | Same-origin URL |
| --- | --- |
| KTX2 worker | `/store/codecs/v1/basis/ktx2.worker.js` |
| Basis transcoder | `/store/codecs/v1/basis/basis_transcoder.js`, `basis_transcoder.mjs`, and `basis_transcoder.wasm` |
| Draco decoder | `/store/codecs/v1/draco/draco_decoder.js`, `draco_decoder.mjs`, and `draco_decoder.wasm` |

The default includes Meshopt at `meshopt/meshopt_decoder.mjs` as well. The
optional `codecs` list restricts what is deployed; an asset that requires a
codec omitted from that list cannot be decoded. Omit `codecs` to deploy all
three. The `basis` family includes the KTX2 worker. Worker and codec failures
must be surfaced to the application; do not replace missing files with the
single-page application's HTML fallback.

The `.js` codec files serve the main thread and classic workers. A module
worker loads the corresponding `.mjs` codec because `importScripts()` cannot
load classic scripts there. The plugin generates these modules from the same
vendored codec source in development and when building the site. The KTX2
transcode pool itself still runs its packaged classic `ktx2.worker.js`.

For a static deployment prepared without the Vite plugin, include both module
files alongside the `.js` and `.wasm` files. Copy the Basis `LICENSE.txt` and
`LICENSE-zstd.txt`, the Draco `LICENSE.txt`, and the Meshopt `LICENSE.txt` for
each selected codec alongside its files. The
[provenance manifest](../../packages/assets/vendor/codec-provenance.json)
records the original projects, immutable revisions, source URLs, and hashes.
Generate each module from its unchanged `.js` codec by prepending the change
notice and declarations:

```js
// Modified by Aura3D: added module bindings and a default export for ESM loading.
const module = undefined, exports = undefined, define = undefined;
const importScripts = globalThis.importScripts ?? (() => { throw new TypeError("importScripts unavailable"); });
```

Append `export default BASIS;` for Basis or
`export default DracoDecoderModule;` for Draco. Preserve a newline between the
declarations, original source and export. The local `importScripts` binding
lets these particular codec versions recognize a worker even when that legacy
global is absent; the codecs only test the binding and do not call it. These
are static files; the runtime does not evaluate generated source or create blob
URLs.

Both `base` and an explicit decoder `basePath` must be absolute same-origin
paths. The decoder path must name a directory inside the Vite base. Relative
Vite bases, cross-origin URLs, query strings, fragments, dot segments, encoded
separators and ambiguous encodings are rejected. URL-encoded ordinary
characters, such as `%20` for a space, are mapped to their decoded filesystem
names. `resolveAuraDecodersDeployment(base, basePath)` is exported from the
Vite subpath for configurations and tooling that need to calculate the mapping.

Serve `.js` and `.mjs` with a JavaScript MIME type and `.wasm` as
`application/wasm`. Set an appropriate Content Security Policy for the
application: the worker needs `worker-src 'self'`; its classic script and
the `.js` and `.mjs` decoder scripts need `script-src 'self'`, and decoder fetches need
`connect-src 'self'`. A codec that compiles WebAssembly also needs compilation
permitted by the browser's policy,
normally `script-src 'wasm-unsafe-eval'` where supported. `blob:` workers are
not required.

**KTX2 (Basis) needs `'unsafe-eval'` under a strict CSP.** A real-browser
acceptance run found that the vendored Basis transcoder (an Emscripten build)
generates code with `eval`/`new Function` while initializing. Under a policy
without `script-src 'unsafe-eval'` (in addition to `'wasm-unsafe-eval'`) the
KTX2 worker fails to initialize. No CSP-safe Basis build ships yet. Draco and
Meshopt do not have this requirement. When the failure is recognizably a
Content Security Policy refusal (an `EvalError`, or a worker error mentioning
`unsafe-eval` or the Content Security Policy), the rejection is an
`AssetDecoderUnavailable` whose `code` is `KTX2_CSP_BLOCKED` and whose message
ends with `:KTX2_CSP_BLOCKED`. Either relax the policy for pages that load KTX2
textures, or ship PNG/JPEG textures and Draco/Meshopt geometry only on pages
with a strict policy. Confirm the policy against the browsers and hosting
environment used by the application.

The plugin copies the compiled worker from the installed assets package. In a
source checkout, it asks the host Vite installation to transpile the worker
source when the compiled worker is absent. Build or pack `@aura3d/assets`
with its worker and vendor directories intact; otherwise decoder deployment
fails instead of producing an incomplete site. Browser deployment validation
is a separate acceptance step and is not implied by the source tests.
