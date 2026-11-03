# @aura3d/react

`@aura3d/react` connects React components to the public `@aura3d/engine`
scene API. The declared peers are React 18 or 19 and `@aura3d/engine` 4.7.x.
For the complete readiness contract, use an engine with `app.readiness()`.
The package ships an ES module and TypeScript declarations. Its model nodes
use generated `AuraAssetRef<"model">` values from the typed asset pipeline.

## Status

The adapter remains **experimental** pending the remote, packed-consumer browser
matrix for both React peer majors. Source tests can establish server rendering,
resource identity, cancellation and failure behavior; they do not establish
browser, GPU, device, or visual support. The repository's native capability
roadmap tracks the remaining acceptance work.

## Canvas lifetime and readiness

`AuraCanvas` renders a canvas and mounts an app in a React effect. `onReady`
receives the app only after its **renderer** readiness outcome is successful;
it does not mean the first frame or every model asset has finished loading.
`useAuraApp()` returns `undefined` until that point and outside the provider.
It also returns `undefined` while a changed scene's renderer is mounting;
the existing app becomes available again when that mount is ready. `onReady`
fires once for each created app, rather than once for each scene change.
For an older engine that only offers `ready()`, the adapter also requires
diagnostics to confirm a mounted WebGL2 renderer before calling `onReady`;
otherwise it reports `legacy-renderer-unavailable`. The older API cannot
express every cancellation and failure distinction available in newer engines.
The adapter disposes the app and removes its pointer listeners on cleanup,
including the cleanup between React StrictMode's development mount passes.
Late readiness from an older scene or an unmounted app is ignored.

Pass `onError(error)` to handle a renderer creation, readiness or scene update
failure. Without `onError`, the adapter throws the failure during render so a
React error boundary can handle it. `AuraCanvasReadinessError` exposes `state`
(`failed`, `cancelled`, or `disposed`) and `code`; failures carry the engine's
bounded diagnostic message. To retry a failed canvas, remount it with a new
React `key`. An ordinary unmount is silent and does not call `onError`.

Scene-relevant changes are applied to the existing app with `setScene`.
Changes to `diagnostics`, `pixelRatio`, `autoStart`, or `resize` recreate the
app. Callback props come from the latest committed render, so replacing a
handler does not recreate the app and an abandoned render cannot change it.
`Model`, `Camera`, `Lights`, and `Effect` declarations can be siblings of
`Scene`, nested inside it, or grouped in React fragments. The first `Scene`
supplies scene options. The adapter reads those declarative elements directly:
it does not inspect scene elements returned by other components, though those
components can use hooks or render UI.
Canvas pointer props are DOM events, not node picking;
`eventInteractionNodes(target)` declares the matching picking interactions.
`useAuraFrame(callback, priority?)` shares one app frame subscription and
releases it when its subscribers leave.

## Server rendering and hydration

The module can be imported and `AuraCanvas` rendered on the server without a
DOM or a renderer. Effects create the app only on the client. `Scene` renders
its children, so a nested `Model` can provide a Suspense fallback. During
server rendering and the first hydration render, `Model` renders that fallback
without starting its preload; it starts on the client after hydration. Use a
fallback that is valid at its location in the surrounding DOM. As with other
client renderers, server markup is not evidence of a rendered 3D frame.

## Preload resources and ownership

`createAuraAssetResource(descriptors, loader?)` creates an independent
Suspense resource; `resourceForDescriptors(descriptors, loader?,
securityContext?)` shares one for equal ordered descriptors, the same loader
function, and the same security-context object identity. Direct shared lookups
with a custom loader require an explicit `securityContext`; omitting it throws
before the loader starts. The built-in loader can still share without an
explicit context.

Each `AuraCanvas` supplies a default context for its Models using the built-in
loader. A Model with a custom loader instead gets its own instance scope when
no context is supplied. Pass the same explicit `securityContext` to Models or
direct lookups only when they may share the same request policy and evidence.
To retain the former implicit sharing, supply a context explicitly. For an
independent request, create a resource with `createAuraAssetResource` and pass
it to `useAuraAsset`.

Create the context and resource per request or session outside the initially
suspending subtree, and retain the resource across retries. A context made
inside a component that suspends before its first commit can be discarded and
recreated on retry. Replace the context or loader, recreate the independent
resource, or remount the Model whenever credentials, headers, authorization,
request policy, or tenant change. A Model's implicit instance scope cannot
detect changes inside a loader's closure. Never put secrets in the context
identity itself. Descriptors contain `id`, `url`, and optional `hash` or
`sha256`: a SHA-256 as 64 hexadecimal digits, optionally prefixed `sha256-`.
They are copied at creation, so later caller mutations cannot change a request
under an old cache key.

The default loader requests with `credentials: "omit"`, reads the bytes and
checks any supplied digest using Web Crypto. It only warms the HTTP cache;
it does not own the engine's model or establish that it rendered. Applications
that need authenticated requests should supply their own loader and an
appropriate security-context identity. A custom loader is responsible for
its own request policy and digest verification. It receives an optional second
argument containing the adapter's `AbortSignal` and returns evidence with
`ok`, a list of loaded descriptor ids, and per-id failures. Adapt other
preloader result shapes explicitly.

The engine scene includes the declared model independently of this preload.
The engine may therefore load or render the model while its React fallback is
visible, and a preload failure does not gate the engine's asset request. The
preload does not prove the engine consumed the same bytes or request policy.

`resource.read()` suspends while loading, returns successful evidence, and
throws a rejection or `AuraAssetPreloadError` for incomplete/failed evidence.
`resource.retry()` starts another attempt after a failure. Use an error
boundary and reset/remount it after retrying. `preload({ signal })` lets each
caller cancel its own wait; the shared flight is aborted only when its last
cancellable waiter leaves and no retained or uncancellable owner remains.
The loader should honor its signal; if it does not, a cancelled or disposed
resource still ignores its late result. `retain()` returns an idempotent release
function for independent owners. `dispose()` evicts and cancels the resource
for all owners, so do not dispose a shared resource while another owner uses it.
After the final owner cancels a flight, a later owner starts a fresh attempt;
an ordinary loader failure still requires an explicit retry.

The shared cache keeps at most 128 entries using least-recently-used eviction.
Eviction cancels an unowned pending flight; active preload waiters, retained
owners, and uncancellable reads are not cancelled by cache pressure. If every
entry has a live owner, the least-recently-used entry is removed from the lookup
without cancelling its work. Existing references still work, though a later lookup
may create a separate resource. `Model` begins its
cancellable preload in a committed effect, so unmounting a loading model
releases its ownership without interrupting another model. A direct unsignalled
`resource.read()` starts an uncancellable shared read. An initial
`useAuraAsset(resource)` read also has no effect cleanup if its render
suspends before the first commit, so that work remains until it settles or is
explicitly disposed, even if its lookup entry is evicted. After the hook
commits, later unsignalled reads of native resources are scoped to that hook's
effect lifetime; an explicitly supplied signal still controls its own read.
`useAuraAsset(resource)` retains a committed resource until cleanup.

## Other public helpers

`Scene`, `Model`, `Camera`, `Lights`, and `Effect` declare the supported scene
nodes; `buildSceneFromChildren` and `productViewerScene` build scene fragments.
`cameraControlsRecipe`, `environmentPresetRecipe`, and
`transformGizmoRecipe` are Aura3D recipes. `R3F_TO_AURA_MIGRATION_TABLE` is a
manual mapping of covered concepts, not a compatibility or parity claim.
