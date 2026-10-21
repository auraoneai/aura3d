---

## Reserved and planned exports (threejs-parity)

**Status legend.** This appendix is hand-maintained for the parity workstream
and appended verbatim by `tools/api-docs` — edit this file, then run
`pnpm verify:api-docs -- --write`. Verdicts: `closed/public` (real GPU path
today), `partial/internal` (exists internally, not public), `gap/public`
(frozen contract, no implementation), `excluded` (deliberately out of scope —
never shipped). Lane verdicts live in
`docs/workflows/threejs-parity-gaps.md`.

Nothing in this section is importable today unless a row says otherwise.
Items marked **landing** are owned by a parity lane and merge with that lane —
the codemod (`aura3d migrate three`) emits `parityPending` markers that name
the same target so generated code and this doc stay in sync.

### `curve.*` — SM-02 (lane L3, landing)

```ts
// @aura3d/engine — planned namespace over the frozen Curve<V> interface
// (M/Curves.ts exports CatmullRomCurve3 + CubicBezierCurve3 as math classes).
curve.catmullRom({ points, closed?, curveType? })
curve.cubicBezier({ v0, v1, v2, v3 })   // + quadraticBezier, line, spline,
curve.path()                            //   ellipse, arc, CurvePath,
curve.shape()                           //   Path/Shape with holes
```

### `texture.*` — ST-01/02/07 (lane L4, landing)

```ts
// @aura3d/engine — planned; AuraTextureRef fields are frozen.
texture.load(url, opts): Promise<TextureHandle>
texture.data / canvas / video / compressed / depth / cube / dataArray
// handle: colorSpace, flipY, wrapS/wrapT, repeat/offset/rotation/center,
//         anisotropy, min/magFilter, generateMipmaps, needsUpdate, dispose
```

### `lines.*`, `points.*`, `sprites.*` — SG-06/07/08 (lane L6, landing)

```ts
// @aura3d/engine — planned scene nodes.
lines.line({ points })
lines.loop / lines.segments / lines.fat({ dashed })
points({ positions, size, sizeAttenuation?, map?, alphaTest? })
sprites({ map?, center?, rotation?, sizeAttenuation? })
```

### `batched.*` — SG-02 (lane L5, probe-gated on P-2)

```ts
// @aura3d/engine — planned; promotion to ● needs a BatchedMesh probe hit.
batched.mesh({ maxInstances, maxVertices, material? })
```

### `instances.mesh` — SG-01 (lane L5, landing)

```ts
// @aura3d/engine — extends the live instances.* factories with a handle:
//   setMatrixAt / setColorAt / count / needsUpdate over the GPU instance
//   buffer write path.
```

### `helpers.*` — SC-03 (lane L6, P2)

```ts
// @aura3d/engine — planned debug helpers over lines.*.
helpers.axes / grid / polarGrid / box / box3 / camera / arrow / plane
helpers.directionalLight / pointLight / spotLight / skeleton
```

### `surfaces.*` — AD-15 (lane L7)

```ts
// @aura3d/engine — planned over R/PlanarReflection.
surfaces.mirror({ size, resolution?, tint? })
```

### `Clock`, `raycast`, cameras — SR-01/03, SC-01 (lane L7)

```ts
// @aura3d/engine — planned.
new Clock()                        // getDelta/getElapsedTime/start/stop
raycast({ origin, direction } | { camera, ndc }, { firstHitOnly?, recursive?, layers?, near?, far? })
cameras.cube({ resolution, near, far })   // via Renderer.renderProbeFace
cameras.array / cameras.stereo            // P2 — needs viewport/scissor
```

### `material.custom` — SH-02 (lane L1, spec frozen)

```ts
// @aura3d/engine — AuraCustomMaterialSpec is frozen in contracts.
material.custom({
  glsl: { fragment },        // required — WebGL2 is the live backend
  wgsl?,                     // optional — WebGPU only (A3D_QR_WEBGPU)
  uniforms?, defines?, transparent?, depthWrite?, side?, blending?, patch?
})
```

### `effects.shaderPass` — SH-03 (lane L1)

```ts
// @aura3d/engine — planned scene node. TODAY'S live GPU path for a custom
// pass is already public:
app.addPostPass({ name, insertAt, fragment: { glsl }, uniforms? })  // ships
effects.shaderPass({ /* same shape */ })                           // landing
```

### Geometry breadth / authoring — SG-03/04/05 (lane L2, landing)

```ts
// kinds exist in the frozen AuraBuiltinPrimitive union; generators land L2.
primitives.cone / circle / ring / tube / lathe / extrude / shape /
           torusKnot / polyhedron({variant}) / roundedBox   // landing
geometry.dynamic(spec)                    // typed-array attributes — landing
geometry.edges(src, thresholdAngle?)      // landing
geometry.wireframe(src)                   // landing
geometry.merge / toNonIndexed             // AD-06 — landing
```

### Math breadth — SM-01/04, AD-14 (lane L3, landing)

```ts
// @aura3d/engine/math — planned additions to the live math classes.
Line3, Triangle, Spherical, Cylindrical, MathUtils,
Color.setHSL/getHSL/offsetHSL/lerpHSL, SphericalHarmonics3, Octree
// all 6 Euler orders; finish Box3/Sphere/Plane/Ray/Frustum/Matrix3 method set
```

### Runtime surface — SH-05/06, SR-04/05/07, SG-09 (lane L7, landing)

```ts
app.setPixelRatio / setClearColor / info / precompile      // typed, unassigned
RenderTarget + renderer.render({ target })               // type reserved on
                                                         // @aura3d/engine/renderer
node handle: renderOrder, frustumCulled, layers, userData, traverse,
             getWorldPosition/Quaternion, attach         // fields frozen
```

### Animation — SA-02/03/04/06, SM-03 (lane L8)

```ts
// @aura3d/engine(/animation) — planned; AN/* internals exist.
AnimationObjectGroup, characters.clone (cloneSkinned),
PropertyBinding parser (node.prop[index], morphTargetInfluences[name]),
KeyframeTrack typed factories, AnimationUtils.subclip/optimize/merge/
  makeClipAdditive
```

### Audio — AU-01/02/03 (lane L9, partial)

```ts
// @aura3d/engine/audio — AudioSource/PositionalEmitter/AudioListener ship;
// lane L9 fixes AU-02 double attenuation, wires the listener to ctx.listener,
// adds panner distanceModel/cone and AudioAnalyser.
```

### Excluded by contract — never lands

```ts
// AD-04 loaders: FBXLoader MMDLoader PLYLoader STLLoader USDZLoader
//   ThreeMFLoader VOXLoader ColladaLoader TDSLoader AMFLoader IFCLoader
// AD-05 exporters: GLTFExporter OBJExporter PLYExporter STLExporter
//   USDZExporter DRACOExporter ColladaExporter
// AD-09 effects/*, AD-10 modifiers (bake offline),
// AD-11 GPUComputationRenderer (waits on SH-04 WebGPU compute),
// AD-13 webxr/inspector/transpiler/libs/offscreen
```
