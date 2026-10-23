---

## Three.js parity surface

**Status legend.** This appendix is hand-maintained for the parity workstream
and appended verbatim by `tools/api-docs` — edit this file, then regenerate
with `pnpm exec tsx --tsconfig tsconfig.base.json tools/api-docs/index.ts --write`.
Verdicts: **LIVE** — a real value export on the named surface today, verified
against the source barrels and exercised by a `tests/unit/parity/*` fixture —
and **NOT YET** — the remaining gaps, listed in "Not yet" below.
Lane-by-lane verdicts live in `docs/workflows/threejs-parity-gaps.md`; the
fixture suite lives in `tests/unit/parity/` (each file header names the parity
IDs it covers).

Unless a row names another surface, exports resolve from the published
`@aura3d/engine` "." barrel (`packages/engine/src/public/index.ts`). Math,
audio, and animation parity ship from their own packages: `@aura3d/math`,
`@aura3d/audio`, `@aura3d/animation`.

### Math breadth — SM-01/03/04, AD-14 (lane L3 — LIVE)

```ts
// @aura3d/math
Vector2, Vector3, Vector4, Matrix3, Matrix4, Quaternion, Color,
Ray, Plane, Sphere, Box3, Frustum, Line3, Triangle,
Spherical, Cylindrical, SphericalHarmonics3, OBB, Capsule,
ConvexHull, Octree, ShapeUtils, Transform, Interpolation, Easing, Random
MathUtils                                   // namespace export; the
  // non-colliding helpers are also top-level: generateUUID, euclideanModulo,
  // mapLinear, damp, pingpong, smootherstep, randInt, randFloat,
  // randFloatSpread, seededRandom, degToRad, radToDeg, isPowerOfTwo,
  // ceilPowerOfTwo, floorPowerOfTwo
Euler — all six orders: "XYZ" | "YXZ" | "ZXY" | "ZYX" | "YZX" | "XZY"
Color.setHSL / getHSL / offsetHSL / lerpHSL
```

Fixture: `tests/unit/parity/math.test.ts`.

### Curve family — SM-02 (lane L3 — LIVE)

```ts
// @aura3d/math — real classes (Curves.ts), not a facade namespace.
abstract class Curve<V>          // CurveBase: getPoint / getPointAt /
                                 //   getTangent / getTangentAt / getLength /
                                 //   getLengths / getUtoTmapping /
                                 //   updateArcLengths / getPoints /
                                 //   getSpacedPoints / computeFrenetFrames
CatmullRomCurve3(points, closed?, curveType?, tension?)
CubicBezierCurve3, QuadraticBezierCurve3, LineCurve3
LineCurve, QuadraticBezierCurve, CubicBezierCurve, SplineCurve   // 2D
EllipseCurve, ArcCurve                          // ArcCurve extends EllipseCurve
CurvePath<V>   // closePath, getCurveLengths, cacheLengths
Path           // moveTo, lineTo, quadraticCurveTo, bezierCurveTo,
               // splineThru, arc/absarc, ellipse/absellipse, setFromPoints
Shape extends Path                            // holes, getPointsHoles
```

`primitives.tube`/`extrude`/`lathe`/`shape` consume frozen `Curve`/`Shape`
instances through `options.params.path` / `.points` / `.shape`.
Fixture: `tests/unit/parity/curves.test.ts`.

### Textures — ST-01/02/03/05/06/07, AD-03 (lane L4 — LIVE)

```ts
// @aura3d/engine — `texture` namespace + `TextureHandle` are "." exports.
texture.load(url, options?: AuraTextureLoadOptions): Promise<TextureHandle>
texture.data({ width, height, data, format?, colorSpace? })
texture.canvas({ canvas, colorSpace?, flipY? })
texture.video({ video, colorSpace? })
texture.compressed({ mipmaps: [{ data, width, height }], format })
texture.depth({ width, height })
texture.cube({ faces, colorSpace? })
texture.dataArray({ width, height, depth, data, format? })

class TextureHandle implements AuraTextureRef
  // live, mutable write-through fields: wrapS, wrapT, repeat, offset,
  // rotation, center, anisotropy, minFilter, magFilter, generateMipmaps,
  // colorSpace, flipY, needsUpdate; plus dispose()
```

`texture.load` routes through `@aura3d/assets` and decodes `.exr` (AD-03);
per-item progress/failures surface via `createAuraApp({ onAssetProgress,
onAssetError })` (ST-06). `AuraTextureRef` and every `AuraTexture*Options`
type are exported from ".". GLTF decoder plumbing (draco/ktx2/meshopt) is
covered by ST-05.
Fixtures: `tests/unit/parity/texture.test.ts`, `exr.test.ts`,
`gltf-decoders.test.ts`.

### Lines, points, sprites, helpers — SG-06/07/08, AD-08, SC-03 (lane L6 — LIVE)

```ts
// @aura3d/engine — scene-node factories returning AuraNodeBuilder
// (.runtime({ id }) binds a live AuraRuntimeNodeHandle).
lines.line({ points|positions, colors?, material?, dashed?, dashSize?,
             gapSize?, dashOffset?, ...transforms })
lines.loop({...})  lines.segments({...})
lines.fat({ ...lineOptions, width?, worldUnits? })   // instanced ribbon mesh;
                                                     // worldUnits ⨯ dashed
// top-level aliases: line, loop, segments, fat
computeLineDistances(positions, "line" | "loop" | "segments")  // AD-08

points({ points|positions, colors?, size?, sizeAttenuation?, map?,
         alphaTest?, transparent?, material?, ...transforms })  // SG-07

sprites.sprite({ map?, center?, rotation?, sizeAttenuation?, color? })  // SG-08
// `sprite` is also a top-level export; `sprites` = { sprite }

helpers.axes / grid / polarGrid / box / box3 / arrow / camera /
        directionalLight / spotLight / pointLight / skeleton      // SC-03 —
        // each emits a real line-segment node builder
```

Fixture: `tests/unit/parity/lines.test.ts`.

### Instancing and batching — SG-01/02 (lane L5 — LIVE)

```ts
// @aura3d/engine
instances.mesh(geometry, material, count): AuraInstancedMeshHandle
  // geometry: @aura3d/rendering Geometry | builtin primitive name |
  //           AuraCustomGeometrySpec
  // handle: setMatrixAt / getMatrixAt / setColorAt / getColorAt / count /
  //         capacity / needsUpdate / instanceMatrix / instanceColor /
  //         computeBoundingSphere / computeBoundingBox / dispose
instances.box / sphere / plane / cylinder / capsule / torus / cone / circle /
          ring / tube / lathe / extrude / shape / torusKnot / polyhedron /
          roundedBox / model / custom    // pre-existing factories — the L2
                                         // kinds share primitives.* params

batched.mesh({ maxInstances, maxVertices?, maxIndices?, material?,
               multiDraw?: "auto" | "multi-draw" | "loop" | "instanced",
               name?, geometries? }): AuraBatchedMeshHandle
  // handle: addGeometry(geo) → geometryId, addInstance(geometryId) → index,
  //         setMatrixAt / getMatrixAt / setColorAt / getColorAt /
  //         setVisibleAt / deleteInstance / count / needsUpdate /
  //         computeBoundingSphere
```

The `batched.mesh` API and dense store are live today — `"auto"` packs a
multi-draw where the generated path supports it and falls back to
per-geometry instancing otherwise. Promotion of the SG-02 row to ● stays
probe-gated on P-2 (see "Not yet").
Fixture: `tests/unit/parity/instancing.test.ts`.

### Surfaces, cameras, scene backgrounds — SC-01, AD-15, SG-10 (lane L7 — LIVE)

```ts
// @aura3d/engine
surfaces.mirror({ name?, size?, resolution?, tint?, position?, runtime? })
  // horizontal Reflector plane at position[1]; captures via the renderer's
  // planar-reflection target
cameras.cube({ name?, resolution?, near?, far?, updateEvery?, position?,
               runtime? })
  // cube-camera node; rendered via Renderer.renderProbeFace once per
  // `updateEvery` frames — consume via material envMap: { cubeCamera: name }

scene().background(color | { texture, intensity?, rotation? } |
                   { cube: { faces: [6], intensity? } })          // SG-10 —
                   // color, image, or cubemap backdrop; never enables IBL
```

Fixture: `tests/unit/parity/runtime.test.ts`.

### Custom materials and shader passes — SH-02/03, SH-10 (lane L1 — LIVE)

```ts
// @aura3d/engine
material.custom({
  glsl: { vertex?, fragment },     // fragment required — WebGL2 is the live
                                   // backend; a WGSL-only spec fails validate
  wgsl?: { vertex?, fragment? },   // used only on the WebGPU backend
  uniforms?, defines?, transparent?, depthWrite?, depthTest?,
  side?, blending?, fog?           // AuraCustomMaterialSpec
}): AuraMaterialSpec

effects.shaderPass({
  name?, glsl? | fragment?: { glsl?, wgsl? }, wgsl?,
  uniforms?,                                    // numeric uniforms by name
  inputs?: ("color" | "depth" | "velocity")[],
  insertAt?: "after-depth" | "before-taa" | "after-taa" |
             "before-tonemap" | "after-tonemap",     // v2 graph anchor
  order?: "before-bloom" | "after-bloom" | "before-tonemap" |
          "after-tonemap" | number,                  // named slot → anchor
  enabled?
}): AuraCustomPostPass

app.addPostPass(pass)                            // registers a custom pass
app.setPassUniform(passName, key, value)         // mutate without rebuild
handle.setUniform(name, value)                   // material.custom uniform
                                                 // write, no recompile

// @aura3d/engine/renderer
registerShaderChunk(name, glsl)    // SH-10 registry — resolves #include in
                                   // material.custom / effects.shaderPass
```

Fixtures: `tests/unit/parity/shader-material.test.ts`,
`shader-pass-order.test.ts`.

### Geometry breadth and authoring — SG-03/04/05 (lane L2 — LIVE)

```ts
// @aura3d/engine — AuraBuiltinPrimitive union is fully generated.
primitives.cone / circle / ring / tube / lathe / extrude / shape /
           torusKnot / polyhedron / roundedBox        // (options.params:
                                                     //  AuraPrimitiveParams)
geometry.dynamic(spec: AuraDynamicGeometrySpec)      // typed-array attributes;
  // validated + tagged so handle.setGeometry / updateAttribute rewrite the
  // live buffers in place (no realloc while vertex count is stable)
geometry.edges(source: AuraCustomGeometrySpec, thresholdAngle = 1)
  // three's EdgesGeometry → a "lines"-topology spec
geometry.wireframe(source: AuraCustomGeometrySpec)
  // three's WireframeGeometry → a "lines"-topology spec
geometry.merge(specs: readonly AuraCustomGeometrySpec[])
  // BufferGeometryUtils.mergeGeometries over specs
```

**Scatter planning and static merge (4.0.9, root exports, pure TypeScript).** Deterministic placement and baking
utilities extracted from the Crayon ports; full reference in `docs/api/scatter-merge.md`.

```ts
createScatterRandom(seed?: number): () => number
scatterAlongPath(options: AuraScatterAlongPathOptions): AuraScatterPoint[]
scatterInArea(options: AuraScatterInAreaOptions): AuraScatterPoint[]
splitScatterByDistance(points: readonly AuraScatterPoint[], origin: readonly [number, number], radii: readonly number[]): AuraScatterPoint[][]
scatterTransforms(points: readonly AuraScatterPoint[], options?: { kind?: number; baseScale?: number | AuraVec3 }): AuraTransformSpec[]
mergeStatic(parts: readonly AuraStaticPart[], options?: AuraMergeStaticOptions): AuraCustomGeometrySpec | undefined
mergeStaticByKey(parts: readonly (AuraStaticPart & { key: K })[], options?: AuraMergeStaticOptions): Map<K, AuraCustomGeometrySpec>
```

`geometry.toNonIndexed` does not exist as a public member — the equivalent
`auraGeometryToNonIndexed` helper is internal-only (parity-tested, but not
re-exported through either barrel). The public `geometry` namespace ships
`define / custom / dynamic / edges / wireframe / merge`.
Fixtures: `tests/unit/parity/geometry-counts.test.ts`,
`geometry-dynamic.test.ts`.

### Runtime surface — SG-09, SR-03/04/05/06/07, SH-05/06 (lane L7 — LIVE)

```ts
// @aura3d/engine — AuraRuntimeNodeHandle members (type exported from "."):
renderOrder: number                 // draw-order override, default 0
frustumCulled: boolean              // default true
layers: AuraLayerMask               // mask/set/enable/enableAll/disable/
                                    // disableAll/toggle/test/isEnabled
userData: Record<string, unknown>
traverse(cb)                        // depth-first, self included
getWorldPosition / getWorldQuaternion / getWorldScale
attach(child)                       // re-parent preserving world transform
setUniform(name, value)             // SH-02 write path
setGeometry(spec) / updateAttribute(name, { array, offset? })   // SG-05
morphTargetDictionary(): Record<string, number>                 // SA-05
// plus pre-existing morphInfluence / setMorphTarget(s)

// AuraApp members:
app.info: AuraRendererInfo          // render{calls,triangles,points,lines,
                                    // frame} + memory{geometries,textures,
                                    // renderTargets?,programs?} +
                                    // approximateGpuMemoryBytes?
app.setPixelRatio(ratio)            // applies on the next frame
app.setClearColor(color, alpha?)
app.precompile(snapshot?): Promise<{ compiledPrograms, durationMs }>

new Clock({ now?, autoStart? })     // SR-06 — getDelta / getElapsedTime /
                                    // start / stop / running / elapsedTime

raycast(input, options?)            // SR-03 — input is a world ray
  // { origin, direction, maxDistance? } or an NDC pick { camera, ndc };
  // options: targets? | nodes?, firstHitOnly?, recursive?, layers?,
  //          near?, far? → hits nearest-first (AABB targets)
raycastFirst(input, options?)       // nearest-hit shorthand

// SH-06 — @aura3d/engine/renderer: RenderTarget (type) +
renderer.render({ source, camera?, target? })   // render into a target at
                                                // its own dimensions
```

`AuraToneMappingOperator` is `"none" | "linear" | "reinhard" | "aces" |
"agx" | "neutral" | "cineon"` — all six operators map to shipped GLSL
chunks, including Cineon (landed L7).
Fixture: `tests/unit/parity/runtime.test.ts`.

### Animation — SA-01/02/03/04/05/06, SM-03 (lane L8 — LIVE)

```ts
// @aura3d/animation
AnimationMixer + AnimationAction + AnimationClip + AnimationTrack
  // mixer depth: per-action loop/timeScale/weight, "loop"/"finished"
  // events (AnimationMixerLoopEvent / AnimationMixerFinishedEvent)
AnimationObjectGroup                                   // SA-02
PropertyBinding, parseTrackName, findNode, sanitizeNodeName
  // SA-03 — node.prop[index] and morphTargetInfluences[name] binding paths
BooleanKeyframeTrack, ColorKeyframeTrack, NumberKeyframeTrack,
  QuaternionKeyframeTrack, StringKeyframeTrack, VectorKeyframeTrack  // SM-03
AnimationUtils (+ named: subclip, optimize, merge,
                makeClipAdditive, isClipAdditive)                    // SA-06
SceneAnimationBridge                                  // runtime bridge

// @aura3d/engine
cloneSkinned(source, count?)                          // SA-04 —
  // SkeletonUtils.clone argument order; returns typed skeleton/skinning
  // evidence
characters.clone                                      // namespace twin
```

Morph-target depth: `handle.morphTargetDictionary()`,
`handle.morphInfluence(name, weight?)`, `setMorphTarget(s)` — unclamped
weights supported (SA-05).
Fixture: `tests/unit/parity/animation.test.ts`.

### Audio — AU-01/02/03 (lane L9 — LIVE)

```ts
// @aura3d/audio
new AudioListener(ctx?)        // AU-03 — binds and writes into
                               // ctx.listener
new PositionalEmitter(...)     // AU-01/02 — panner distanceModel +
                               // distance params and cone
                               // (innerAngle/outerAngle/outerGain) map to a
                               // real PannerNode; distance/cone attenuation
                               // is applied exactly once (no double
                               // attenuation)
createAudioAnalyser(node, fftSize?) / new AudioAnalyser(...)
  // wraps a real AnalyserNode: frequency + time-domain data,
  // getAverageFrequency, disconnect
```

Coverage: `tests/unit/audio/*` (no dedicated parity fixture — L9 merged the
attenuation fix, listener wiring, and analyser together).

### Not yet — the only remaining gaps

```ts
// batched.mesh promotion to ● — probe-gated on P-2 (native multi-draw/
//   GPU-residency probe). The API and per-geometry-instancing path are
//   LIVE today; the ● verdict waits on the probe.
// cameras.array / cameras.stereo (P2) — need viewport/scissor support in
//   the frame graph.
// SH-01 TSL subset — three's WebGPU node-material language; P2 /
//   probe-gated.
// SH-04 compute — behind the A3D_QR_WEBGPU backend.
// material.custom `patch` (SH-09) — the field is typed on
//   AuraCustomMaterialSpec and the compiler include-bakes named chunks,
//   but promotion to public parity is intentionally deferred; treat patch
//   as not-yet.
// SG-11 mixed-child LOD — `distanceLod` ships root LOD (one primitive or
//   geometry per level); three's LOD object with mixed child sets per
//   level is not yet.
// SC-04 XR controller buttons.
// AD-16 rectArea/LightProbe — `lights.rectArea` (alias of lights.rect)
//   ships and compiles to a real "rect-area" render light; three's
//   RectAreaLight uniforms-lib fidelity and LightProbe (spherical-
//   harmonics probe) are not yet.
```

Dev gates: the parity lanes sit behind `A3D_PARITY_SHADING`,
`A3D_PARITY_GEOMETRY`, `A3D_PARITY_TEXTURES`, `A3D_PARITY_BATCHING`,
`A3D_PARITY_LINES`, `A3D_PARITY_RUNTIME` (or the `parity.<area>` short form —
`?a3d-qr=parity.lines`). Fixture: `tests/unit/parity/l0-flags.test.ts`.

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
